'use server';

import { revalidatePath } from 'next/cache';

import { createJobFromAcceptedQuote, createServiceClient, getQuoteById } from '@premier/db';
import { ErrorCode, RespondToQuoteInputSchema, err, ok, type Result } from '@premier/shared';

import { getOrgOwnerAndAdminEmails } from '@/lib/auth-admin';
import { sendQuoteRespondedNotification } from '@/lib/customer-lifecycle-notifications';

export type RespondToQuoteActionState = Result<{ status: 'accepted' | 'declined' }>;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

export async function respondToQuoteAction(
  _prevState: RespondToQuoteActionState | null,
  formData: FormData
): Promise<RespondToQuoteActionState> {
  const rawInput = {
    token: readString(formData, 'token'),
    response: readString(formData, 'response'),
    declineReason: readOptionalString(formData, 'declineReason'),
  };

  const parsed = RespondToQuoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(ErrorCode.VALIDATION_ERROR, firstError?.message ?? 'Invalid input.');
  }

  const { token, response, declineReason } = parsed.data;
  const client = createServiceClient();

  const { data: quote, error: fetchError } = await client
    .from('quotes')
    .select('id, status, valid_until, org_id')
    .eq('share_token', token)
    .maybeSingle();

  if (fetchError) {
    return err(ErrorCode.DB_ERROR, fetchError.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, 'Quote not found.');
  }

  if (quote.status !== 'sent' && quote.status !== 'viewed') {
    return err(
      ErrorCode.VALIDATION_ERROR,
      `This quote has already been ${quote.status} and cannot be changed.`
    );
  }

  if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'This quote has expired and can no longer be accepted or declined. Please contact Premier.'
    );
  }

  const now = new Date().toISOString();
  const finalStatus = response === 'accept' ? 'accepted' : 'declined';

  if (response === 'accept') {
    const { error } = await client
      .from('quotes')
      .update({ status: 'accepted', accepted_at: now })
      .eq('id', quote.id);

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }
  } else {
    const { error } = await client
      .from('quotes')
      .update({
        status: 'declined',
        declined_at: now,
        decline_reason: declineReason ?? null,
      })
      .eq('id', quote.id);

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }
  }

  // Accepted quote -> unscheduled job, via the same shared service the
  // staff manual action uses. Idempotent at the database boundary
  // (jobs_origin_quote_unique) — a duplicate accept callback (retry, double
  // submit) returns the job the first call already created rather than
  // erroring or duplicating.
  if (finalStatus === 'accepted') {
    const jobResult = await createJobFromAcceptedQuote(client, {
      orgId: quote.org_id,
      quoteId: quote.id,
      createdByUserId: null,
    });
    if (!jobResult.success) {
      console.error('[q/token] job creation from accepted quote failed:', jobResult.error);
    }
  }

  // Best-effort activity log + staff notification — never block the
  // response that already succeeded above.
  const message =
    finalStatus === 'declined' && declineReason
      ? `Quote declined: ${declineReason}`
      : `Quote ${finalStatus}.`;

  await client.from('activity_log').insert({
    org_id: quote.org_id,
    entity_type: 'quote',
    entity_id: quote.id,
    event_type: `quote_${finalStatus}`,
    message,
  });

  const detailResult = await getQuoteById(client, { orgId: quote.org_id, quoteId: quote.id });
  if (detailResult.success) {
    const toEmails = await getOrgOwnerAndAdminEmails(client, quote.org_id);
    await sendQuoteRespondedNotification({
      toEmails,
      customerName: detailResult.data.customer?.displayName ?? 'A customer',
      quoteTitle: detailResult.data.quote.title?.trim() || detailResult.data.quote.quote_number || 'Quote',
      quoteTotal: detailResult.data.quote.total,
      quoteId: quote.id,
      response: finalStatus,
      declineReason: declineReason ?? null,
    });
  }

  revalidatePath(`/q/${token}`);
  revalidatePath('/today');

  return ok({ status: finalStatus });
}
