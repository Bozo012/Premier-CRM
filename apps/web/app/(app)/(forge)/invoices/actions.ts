'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  AddInvoiceLineItemInputSchema,
  CreateInvoiceFromJobInputSchema,
  CreateInvoiceFromQuoteInputSchema,
  ErrorCode,
  RecordPaymentInputSchema,
  RemoveInvoiceLineItemInputSchema,
  SendInvoiceInputSchema,
  UpdateInvoiceLineItemInputSchema,
  UpdateInvoiceMetadataInputSchema,
  VoidInvoiceInputSchema,
  err,
  hasCapability,
  ok,
  type Capability,
  type Result,
} from '@premier/shared';
import {
  addExpenseChargeToInvoice,
  addInvoiceLineItem,
  createDraftInvoiceFromJob,
  createDraftInvoiceFromQuote,
  getActiveOrgContext,
  getInvoiceById,
  listJobs,
  recordPayment,
  removeInvoiceLineItem,
  sendInvoice,
  updateInvoiceLineItem,
  updateInvoiceMetadata,
  voidInvoice,
  createServiceClient,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { sendPaymentRecordedNotification } from '@/lib/customer-lifecycle-notifications';
import { sendInvoiceEmail } from '@/lib/email';

export type LineItemActionState = Result<{ lineItemId: string }>;

interface InvoiceActionContext {
  orgId: string;
  userId: string;
}

/**
 * Capability names, in plain language, for the FORBIDDEN message when a
 * signed-in staff member's role doesn't grant the requested action.
 */
const CAPABILITY_LABELS: Record<Capability, string> = {
  canCreateEstimates: 'create estimates',
  canSendEstimates: 'send estimates',
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
  canReplyToCustomers: 'reply to customers',
  canManageCustomers: 'create or edit customers and properties',
};

async function getInvoiceActionContext(
  capability: Capability
): Promise<Result<InvoiceActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to edit invoices.');
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

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Job picker (invoice creation entry point from the /invoices list)
// ---------------------------------------------------------------------------

export interface JobPickerItem {
  customerName: string | null;
  id: string;
  jobNumber: string | null;
  status: string;
  title: string;
}

export type SearchJobsForInvoicePickerActionState = Result<JobPickerItem[]>;

export async function searchJobsForInvoicePickerAction(
  _prevState: SearchJobsForInvoicePickerActionState | null,
  formData: FormData
): Promise<SearchJobsForInvoicePickerActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const search = readOptionalString(formData, 'q');

  const client = createServiceClient();
  const result = await listJobs(client, { limit: 30, offset: 0, orgId, search });
  if (!result.success) return result;

  const items: JobPickerItem[] = result.data.jobs.map((item) => ({
    customerName: item.customer?.displayName ?? null,
    id: item.job.id,
    jobNumber: item.job.job_number,
    status: item.job.status,
    title: item.job.title,
  }));

  return ok(items);
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type CreateInvoiceActionState = Result<{ invoiceId: string }>;

export async function createInvoiceFromJobAction(
  _prevState: CreateInvoiceActionState | null,
  formData: FormData
): Promise<CreateInvoiceActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const rawInput = {
    jobId: readString(formData, 'jobId'),
    kind: readOptionalString(formData, 'kind') ?? 'standalone',
  };

  const parsed = CreateInvoiceFromJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid job ID.');
  }

  const client = createServiceClient();
  const result = await createDraftInvoiceFromJob(client, {
    createdBy: userId,
    input: parsed.data,
    orgId,
  });

  if (!result.success) return result;

  revalidatePath('/invoices');
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return ok({ invoiceId: result.data.id });
}

export async function createInvoiceFromQuoteAction(
  _prevState: CreateInvoiceActionState | null,
  formData: FormData
): Promise<CreateInvoiceActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const rawInput = {
    quoteId: readString(formData, 'quoteId'),
    kind: readOptionalString(formData, 'kind') ?? 'standalone',
    copyLineItems: readOptionalString(formData, 'copyLineItems') ?? 'true',
  };

  const parsed = CreateInvoiceFromQuoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid quote ID.');
  }

  const client = createServiceClient();
  const result = await createDraftInvoiceFromQuote(client, {
    createdBy: userId,
    input: parsed.data,
    orgId,
  });

  if (!result.success) return result;

  revalidatePath('/invoices');
  revalidatePath(`/jobs/${result.data.job_id}`);
  return ok({ invoiceId: result.data.id });
}

// ---------------------------------------------------------------------------
// Metadata editing (draft only)
// ---------------------------------------------------------------------------

export type UpdateInvoiceMetadataActionState = Result<{ invoiceId: string }>;

export async function updateInvoiceMetadataAction(
  _prevState: UpdateInvoiceMetadataActionState | null,
  formData: FormData
): Promise<UpdateInvoiceMetadataActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = {
    invoiceId: readString(formData, 'invoiceId'),
    title: readString(formData, 'title'),
    kind: readString(formData, 'kind'),
    issuedDate: readString(formData, 'issuedDate'),
    dueDate: readString(formData, 'dueDate'),
    discountAmount: readString(formData, 'discountAmount'),
    taxPct: readString(formData, 'taxPct'),
    notes: readString(formData, 'notes'),
    terms: readString(formData, 'terms'),
  };

  const parsed = UpdateInvoiceMetadataInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid invoice metadata.');
  }

  const client = createServiceClient();
  const result = await updateInvoiceMetadata(client, { input: parsed.data, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath('/invoices');
  return ok({ invoiceId: parsed.data.invoiceId });
}

// ---------------------------------------------------------------------------
// Line items (draft only)
// ---------------------------------------------------------------------------

export async function addInvoiceLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = {
    invoiceId: readString(formData, 'invoiceId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
  };

  const parsed = AddInvoiceLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid line item input.');
  }

  const client = createServiceClient();
  const result = await addInvoiceLineItem(client, { input: parsed.data, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  return ok({ lineItemId: result.data.id });
}

export async function updateInvoiceLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    invoiceId: readString(formData, 'invoiceId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
  };

  const parsed = UpdateInvoiceLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid line item input.');
  }

  const client = createServiceClient();
  const result = await updateInvoiceLineItem(client, { input: parsed.data, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  return ok({ lineItemId: result.data.id });
}

export async function removeInvoiceLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    invoiceId: readString(formData, 'invoiceId'),
  };

  const parsed = RemoveInvoiceLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid remove request.');
  }

  const client = createServiceClient();
  const result = await removeInvoiceLineItem(client, { input: parsed.data, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  return ok({ lineItemId: parsed.data.lineItemId });
}

// ---------------------------------------------------------------------------
// Expense → invoice line-item linkage. Uses the redirect-based plain-form
// pattern (like expenses/actions.ts) rather than useFormState, since
// eligible-expenses-section.tsx renders a plain per-row <form>, not a
// client hook-driven one.
// ---------------------------------------------------------------------------

export async function addExpenseChargeToInvoiceAction(formData: FormData): Promise<never> {
  const invoiceId = readString(formData, 'invoiceId');
  const expenseId = readString(formData, 'expenseId');

  const contextResult = await getInvoiceActionContext('canCreateInvoices');
  if (!contextResult.success) {
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(contextResult.error)}`);
  }
  const { orgId } = contextResult.data;

  const client = createServiceClient();
  const result = await addExpenseChargeToInvoice(client, { invoiceId, expenseId, orgId });

  if (!result.success) {
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath('/expenses');
  revalidatePath(`/expenses/${expenseId}`);
  redirect(`/invoices/${invoiceId}?message=${encodeURIComponent('Expense added to invoice.')}`);
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type SendInvoiceActionState = Result<{ invoiceUrl: string; emailSent: boolean }>;

export async function sendInvoiceAction(
  _prevState: SendInvoiceActionState | null,
  formData: FormData
): Promise<SendInvoiceActionState> {
  const contextResult = await getInvoiceActionContext('canSendInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = { invoiceId: readString(formData, 'invoiceId') };
  const parsed = SendInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid invoice ID.');
  }

  const client = createServiceClient();
  const result = await sendInvoice(client, { invoiceId: parsed.data.invoiceId, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath('/invoices');
  revalidatePath(`/jobs/${result.data.job_id}`);

  const invoiceUrl = `/i/${result.data.share_token}`;

  // Attempt email delivery — best-effort, never blocks the send transition
  // that already succeeded above.
  let emailSent = false;
  const detailResult = await getInvoiceById(client, {
    invoiceId: parsed.data.invoiceId,
    orgId,
  });

  if (detailResult.success) {
    const { customer, invoice } = detailResult.data;
    if (customer?.email) {
      const emailResult = await sendInvoiceEmail({
        customerEmail: customer.email,
        customerName: customer.displayName,
        invoiceTitle: invoice.title?.trim() || invoice.invoice_number || 'Your invoice',
        invoiceTotal: invoice.total,
        invoiceUrl,
        dueDate: invoice.due_date,
      });
      emailSent = emailResult.sent;
    }
  }

  return ok({ invoiceUrl, emailSent });
}

// ---------------------------------------------------------------------------
// Void
// ---------------------------------------------------------------------------

export type VoidInvoiceActionState = Result<{ invoiceId: string }>;

export async function voidInvoiceAction(
  _prevState: VoidInvoiceActionState | null,
  formData: FormData
): Promise<VoidInvoiceActionState> {
  const contextResult = await getInvoiceActionContext('canVoidInvoices');
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const rawInput = { invoiceId: readString(formData, 'invoiceId') };
  const parsed = VoidInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid invoice ID.');
  }

  const client = createServiceClient();
  const result = await voidInvoice(client, { invoiceId: parsed.data.invoiceId, orgId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath('/invoices');
  return ok({ invoiceId: parsed.data.invoiceId });
}

// ---------------------------------------------------------------------------
// Record payment
// ---------------------------------------------------------------------------

export type RecordPaymentActionState = Result<{ paymentId: string }>;

export async function recordPaymentAction(
  _prevState: RecordPaymentActionState | null,
  formData: FormData
): Promise<RecordPaymentActionState> {
  const contextResult = await getInvoiceActionContext('canRecordPayments');
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const rawInput = {
    invoiceId: readString(formData, 'invoiceId'),
    amount: readString(formData, 'amount'),
    method: readString(formData, 'method'),
    paidAt: readString(formData, 'paidAt'),
    reference: readOptionalString(formData, 'reference'),
    notes: readOptionalString(formData, 'notes'),
  };

  const parsed = RecordPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid payment input.');
  }

  const client = createServiceClient();
  const result = await recordPayment(client, { input: parsed.data, orgId, actorUserId: userId });
  if (!result.success) return result;

  revalidatePath(`/invoices/${parsed.data.invoiceId}`);
  revalidatePath('/invoices');

  // Look up the invoice's job for the job-detail totals to revalidate too.
  const { data: invoice } = await client
    .from('invoices')
    .select('job_id')
    .eq('id', parsed.data.invoiceId)
    .maybeSingle();
  if (invoice?.job_id) {
    revalidatePath(`/jobs/${invoice.job_id}`);
  }

  const invoiceDetail = await getInvoiceById(client, {
    invoiceId: parsed.data.invoiceId,
    orgId,
  });
  if (invoiceDetail.success) {
    await sendPaymentRecordedNotification(invoiceDetail.data, {
      amount: parsed.data.amount,
      method: parsed.data.method,
      paidAt: parsed.data.paidAt,
      reference: parsed.data.reference ?? null,
    });
  }

  return ok({ paymentId: result.data.id });
}
