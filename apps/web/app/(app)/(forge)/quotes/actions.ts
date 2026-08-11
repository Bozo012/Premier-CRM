'use server';

import { revalidatePath } from 'next/cache';

import {
  AddLineItemInputSchema,
  CreateQuoteFromJobInputSchema,
  ErrorCode,
  RemoveLineItemInputSchema,
  SendQuoteInputSchema,
  UpdateLineItemInputSchema,
  UpdateQuoteMetadataInputSchema,
  err,
  hasCapability,
  ok,
  type Capability,
  type Result,
} from '@premier/shared';
import {
  addQuoteLineItem,
  createDraftQuote,
  getActiveOrgContext,
  getQuoteById,
  listJobs,
  logActivity,
  removeQuoteLineItem,
  updateQuoteLineItem,
  updateQuoteMetadata,
  createServiceClient,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { sendQuoteEmail } from '@/lib/email';

export type LineItemActionState = Result<{ lineItemId: string }>;

interface QuoteActionContext {
  orgId: string;
  userId: string;
}

/**
 * Quotes are the priced, customer-facing document in this codebase's
 * estimate → quote → job pipeline — mapped onto the business-level
 * "estimates" capability (create/send) from the authorization design, since
 * that capability set has no separate "quotes" entry.
 */
const CAPABILITY_LABELS: Record<Capability, string> = {
  canCreateEstimates: 'create or edit quotes',
  canSendEstimates: 'send quotes',
  canCreateInvoices: 'create or edit invoices',
  canSendInvoices: 'send invoices',
  canRecordPayments: 'record payments',
  canVoidInvoices: 'void invoices',
  canDeleteInvoices: 'delete invoices',
  canIssueRefunds: 'issue refunds',
  canScheduleJobs: 'schedule jobs',
  canProposeChangeOrders: 'propose change orders',
  canManageDeposits: 'manage deposits',
  canEditWorkingInvoice: 'edit the working invoice',
  canTriageRequests: 'triage requests',
  canCreateDirectWorkOrder: 'create a direct work order',
  canManageInspectionTemplates: 'manage inspection templates',
  canEditEstimate: 'edit the estimate',
  canApproveEstimatePricing: 'approve estimate pricing',
  canCreateQuote: 'create a quote',
  canCreateExpenses: 'create or edit expenses',
  canApproveExpenses: 'approve or reject expenses',
  canSendQuote: 'send a quote',
  canPublishCustomerMedia: 'publish photos to the customer portal',
};

async function getQuoteActionContext(
  capability: Capability
): Promise<Result<QuoteActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to edit quotes.');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  const { orgId, role } = orgContextResult.data;
  if (!hasCapability(role, capability)) {
    return err(
      ErrorCode.FORBIDDEN,
      `Your role does not have permission to ${CAPABILITY_LABELS[capability]}.`
    );
  }

  return ok({ orgId, userId: user.id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(
  formData: FormData,
  key: string
): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Quote metadata editing (draft only)
// ---------------------------------------------------------------------------

export type UpdateQuoteMetadataActionState = Result<{ quoteId: string }>;

export async function updateQuoteMetadataAction(
  _prevState: UpdateQuoteMetadataActionState | null,
  formData: FormData
): Promise<UpdateQuoteMetadataActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    quoteId: readString(formData, 'quoteId'),
    title: readString(formData, 'title'),
    validUntil: readString(formData, 'validUntil'),
    discountAmount: readString(formData, 'discountAmount'),
    taxPct: readString(formData, 'taxPct'),
    introText: readString(formData, 'introText'),
    outroText: readString(formData, 'outroText'),
  };

  const parsed = UpdateQuoteMetadataInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid quote metadata.');
  }

  const client = createServiceClient();
  const result = await updateQuoteMetadata(client, { input: parsed.data, orgId });
  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  revalidatePath('/quotes');
  return ok({ quoteId: parsed.data.quoteId });
}

// ---------------------------------------------------------------------------
// Approve job (accepted quote → approved job)
// ---------------------------------------------------------------------------

export type ApproveJobActionState = Result<{ jobId: string }>;

export async function approveJobAction(
  _prevState: ApproveJobActionState | null,
  formData: FormData
): Promise<ApproveJobActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const quoteId = readString(formData, 'quoteId');
  const parsed = SendQuoteInputSchema.safeParse({ quoteId });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid quote ID.');
  }

  const client = createServiceClient();

  const { data: quote, error: fetchError } = await client
    .from('quotes')
    .select('id, status, job_id, total')
    .eq('id', parsed.data.quoteId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) {
    return err(ErrorCode.DB_ERROR, fetchError.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, 'Quote not found.');
  }

  if (quote.status !== 'accepted') {
    return err(
      ErrorCode.VALIDATION_ERROR,
      `Quote is ${quote.status} — only accepted quotes can trigger job approval.`
    );
  }

  if (!quote.job_id) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'This quote has no linked job. For estimate-origin quotes, use the Create job action instead.'
    );
  }

  const { data: linkedJob, error: jobFetchError } = await client
    .from('jobs')
    .select('id, status')
    .eq('id', quote.job_id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (jobFetchError) {
    return err(ErrorCode.DB_ERROR, jobFetchError.message);
  }
  if (!linkedJob) {
    return err(ErrorCode.NOT_FOUND, 'Linked job not found.');
  }

  // Idempotent — already approved.
  if (linkedJob.status === 'approved') {
    return ok({ jobId: linkedJob.id });
  }

  const { error: updateError } = await client
    .from('jobs')
    .update({ status: 'approved', quoted_total: quote.total })
    .eq('id', quote.job_id)
    .eq('org_id', orgId);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  revalidatePath(`/jobs/${quote.job_id}`);
  revalidatePath('/jobs');

  return ok({ jobId: quote.job_id });
}

// ---------------------------------------------------------------------------
// Send quote
// ---------------------------------------------------------------------------

export type SendQuoteActionState = Result<{ quoteUrl: string; emailSent: boolean }>;

export async function sendQuoteAction(
  _prevState: SendQuoteActionState | null,
  formData: FormData
): Promise<SendQuoteActionState> {
  const contextResult = await getQuoteActionContext('canSendQuote');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const rawInput = { quoteId: readString(formData, 'quoteId') };
  const parsed = SendQuoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid quote ID.');
  }

  const client = createServiceClient();

  const { data: quote, error: fetchError } = await client
    .from('quotes')
    .select('id, status, share_token')
    .eq('id', parsed.data.quoteId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) {
    return err(ErrorCode.DB_ERROR, fetchError.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, 'Quote not found.');
  }

  if (quote.status !== 'draft') {
    return err(ErrorCode.VALIDATION_ERROR, `Quote is already ${quote.status} — only draft quotes can be sent.`);
  }

  const { error: updateError } = await client
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', parsed.data.quoteId)
    .eq('org_id', orgId);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  await logActivity(client, {
    orgId,
    entityType: 'quote',
    entityId: parsed.data.quoteId,
    eventType: 'quote_sent',
    message: 'Quote sent to customer.',
    actorUserId: userId,
  });

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  revalidatePath('/quotes');

  const quoteUrl = `/q/${quote.share_token}`;

  // Attempt email delivery — best-effort, never blocks success path.
  // Fetch full quote detail for customer email + display context.
  let emailSent = false;
  const detailResult = await getQuoteById(client, {
    orgId,
    quoteId: parsed.data.quoteId,
  });

  if (detailResult.success) {
    const { customer, quote: quoteDetail } = detailResult.data;
    if (customer?.email) {
      const emailResult = await sendQuoteEmail({
        customerEmail: customer.email,
        customerName: customer.displayName,
        quoteTitle: quoteDetail.title?.trim() || quoteDetail.quote_number || 'Your quote',
        quoteTotal: quoteDetail.total,
        quoteUrl,
        validUntil: quoteDetail.valid_until,
      });
      emailSent = emailResult.sent;
    }
  }

  return ok({ quoteUrl, emailSent });
}

// ---------------------------------------------------------------------------
// Resend quote email
// ---------------------------------------------------------------------------

export type ResendQuoteEmailActionState = Result<{ sent: boolean }>;

// Statuses for which resending makes sense — excludes terminal and pre-send states.
const RESEND_ELIGIBLE_STATUSES = new Set(['sent', 'viewed']);

export async function resendQuoteEmailAction(
  _prevState: ResendQuoteEmailActionState | null,
  formData: FormData
): Promise<ResendQuoteEmailActionState> {
  const contextResult = await getQuoteActionContext('canSendQuote');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = { quoteId: readString(formData, 'quoteId') };
  const parsed = SendQuoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid quote ID.');
  }

  const client = createServiceClient();
  const detailResult = await getQuoteById(client, {
    orgId,
    quoteId: parsed.data.quoteId,
  });

  if (!detailResult.success) {
    return detailResult;
  }

  const { customer, quote: quoteDetail } = detailResult.data;

  if (!RESEND_ELIGIBLE_STATUSES.has(quoteDetail.status)) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      `Cannot resend email for a quote with status '${quoteDetail.status}'. Only sent or viewed quotes are eligible.`
    );
  }

  if (!customer?.email) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'No customer email address on record for this quote.'
    );
  }

  const emailResult = await sendQuoteEmail({
    customerEmail: customer.email,
    customerName: customer.displayName,
    quoteTitle: quoteDetail.title?.trim() || quoteDetail.quote_number || 'Your quote',
    quoteTotal: quoteDetail.total,
    quoteUrl: `/q/${quoteDetail.share_token}`,
    validUntil: quoteDetail.valid_until,
  });

  if (!emailResult.sent) {
    return err(ErrorCode.DB_ERROR, 'Email delivery failed. Check server logs for details.');
  }

  return ok({ sent: true });
}

// ---------------------------------------------------------------------------
// Quote creation from the workspace
// ---------------------------------------------------------------------------

export interface JobPickerItem {
  customerName: string | null;
  id: string;
  jobNumber: string | null;
  status: string;
  title: string;
}

export type SearchJobsForPickerActionState = Result<JobPickerItem[]>;

export async function searchJobsForPickerAction(
  _prevState: SearchJobsForPickerActionState | null,
  formData: FormData
): Promise<SearchJobsForPickerActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const search = readOptionalString(formData, 'q');

  const client = createServiceClient();
  const result = await listJobs(client, {
    limit: 30,
    offset: 0,
    orgId,
    search,
  });

  if (!result.success) {
    return result;
  }

  const items: JobPickerItem[] = result.data.jobs.map((item) => ({
    customerName: item.customer?.displayName ?? null,
    id: item.job.id,
    jobNumber: item.job.job_number,
    status: item.job.status,
    title: item.job.title,
  }));

  return ok(items);
}

export type CreateDraftQuoteActionState = Result<{ quoteId: string }>;

export async function createDraftQuoteAction(
  _prevState: CreateDraftQuoteActionState | null,
  formData: FormData
): Promise<CreateDraftQuoteActionState> {
  // Creating a quote (as opposed to editing an existing one) is gated by
  // canCreateQuote, not the broader canCreateEstimates — subcontractors are
  // deliberately excluded (packages/shared/permissions.ts).
  const contextResult = await getQuoteActionContext('canCreateQuote');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const rawInput = { jobId: readString(formData, 'jobId') };
  const parsed = CreateQuoteFromJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid job ID.');
  }

  const client = createServiceClient();
  const result = await createDraftQuote(client, {
    createdBy: userId,
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/quotes');
  return ok({ quoteId: result.data.id });
}

// ---------------------------------------------------------------------------
// Standalone quote creation (customer + property, no prior job/estimate) —
// per the post-MVP amendment, this is a second door alongside the
// request→estimate→quote pipeline and the "quote an existing job" dialog
// above. A quote can't exist with neither job_id nor estimate_id
// (quotes_has_job_or_estimate CHECK), so this creates a backing estimate
// (status 'quoted', since it's being quoted immediately) the same way the
// manual estimate path does, then a draft quote linked to it.
// ---------------------------------------------------------------------------

export type CreateStandaloneQuoteActionState = Result<{ id: string }>;

export async function createStandaloneQuoteAction(
  _prevState: CreateStandaloneQuoteActionState | null,
  formData: FormData
): Promise<CreateStandaloneQuoteActionState> {
  // Same reasoning as createDraftQuoteAction above — this also creates a new
  // quote (via a backing estimate), so it's gated by canCreateQuote, not
  // canCreateEstimates.
  const contextResult = await getQuoteActionContext('canCreateQuote');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const customerId = readString(formData, 'customerId');
  const propertyId = readString(formData, 'propertyId');
  const title = readString(formData, 'title');
  const description = readOptionalString(formData, 'description');

  if (!customerId) return err(ErrorCode.VALIDATION_ERROR, 'A customer is required.');
  if (!propertyId) return err(ErrorCode.VALIDATION_ERROR, 'A property is required.');
  if (!title) return err(ErrorCode.VALIDATION_ERROR, 'A title is required.');

  const client = createServiceClient();

  const { data: customer, error: customerError } = await client
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (customerError) return err(ErrorCode.DB_ERROR, customerError.message);
  if (!customer) return err(ErrorCode.NOT_FOUND, 'Customer not found.');

  const { data: link, error: linkError } = await client
    .from('customer_properties')
    .select('property_id')
    .eq('customer_id', customerId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (linkError) return err(ErrorCode.DB_ERROR, linkError.message);
  if (!link) {
    return err(ErrorCode.VALIDATION_ERROR, 'The selected property is not linked to this customer.');
  }

  const { data: estimate, error: estimateError } = await client
    .from('estimates')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      title,
      description: description ?? null,
      status: 'quoted',
      created_by: userId,
    })
    .select('id')
    .single();

  if (estimateError || !estimate) {
    return err(ErrorCode.DB_ERROR, estimateError?.message ?? 'Failed to create the backing estimate.');
  }

  const quoteResult = await createDraftQuote(client, {
    createdBy: userId,
    estimateId: estimate.id,
    orgId,
    title,
  });

  if (!quoteResult.success) {
    return quoteResult;
  }

  revalidatePath('/quotes');
  revalidatePath('/estimates');

  return ok({ id: quoteResult.data.id });
}

export async function addLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    quoteId: readString(formData, 'quoteId'),
    serviceId: readOptionalString(formData, 'serviceId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
    markupPct: readOptionalString(formData, 'markupPct'),
  };

  const parsed = AddLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid line item input.'
    );
  }

  const client = createServiceClient();
  const result = await addQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: result.data.id });
}

export async function updateLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    quoteId: readString(formData, 'quoteId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
    markupPct: readOptionalString(formData, 'markupPct'),
  };

  const parsed = UpdateLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid line item input.'
    );
  }

  const client = createServiceClient();
  const result = await updateQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: result.data.id });
}

export async function removeLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext('canCreateEstimates');
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    quoteId: readString(formData, 'quoteId'),
  };

  const parsed = RemoveLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid remove request.'
    );
  }

  const client = createServiceClient();
  const result = await removeQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: parsed.data.lineItemId });
}
