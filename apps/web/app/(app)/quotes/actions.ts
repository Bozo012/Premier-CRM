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
  ok,
  type Result,
} from '@premier/shared';
import {
  addQuoteLineItem,
  createDraftQuote,
  getQuoteById,
  listJobs,
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

async function getQuoteActionContext(): Promise<Result<QuoteActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to edit quotes.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }

  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
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
  const contextResult = await getQuoteActionContext();
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
// Send quote
// ---------------------------------------------------------------------------

export type SendQuoteActionState = Result<{ quoteUrl: string; emailSent: boolean }>;

export async function sendQuoteAction(
  _prevState: SendQuoteActionState | null,
  formData: FormData
): Promise<SendQuoteActionState> {
  const contextResult = await getQuoteActionContext();
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
  const contextResult = await getQuoteActionContext();
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
  const contextResult = await getQuoteActionContext();
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
  const contextResult = await getQuoteActionContext();
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

export async function addLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext();
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
  const contextResult = await getQuoteActionContext();
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
  const contextResult = await getQuoteActionContext();
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
