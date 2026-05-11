'use server';

import { revalidatePath } from 'next/cache';

import { createServiceClient } from '@premier/db';
import { ErrorCode, RespondToQuoteInputSchema, err, ok, type Result } from '@premier/shared';

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
    .select('id, status, valid_until')
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

  revalidatePath(`/q/${token}`);

  return ok({ status: response === 'accept' ? 'accepted' : 'declined' });
}
