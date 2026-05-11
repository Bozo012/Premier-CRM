'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { createDraftQuote, createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

async function getEstimateActionContext(): Promise<
  Result<{ orgId: string; userId: string }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in.');
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

// ---------------------------------------------------------------------------
// Create draft quote from estimate
// ---------------------------------------------------------------------------

export type CreateQuoteFromEstimateActionState = Result<{ quoteId: string }>;

export async function createQuoteFromEstimateAction(
  _prevState: CreateQuoteFromEstimateActionState | null,
  formData: FormData
): Promise<CreateQuoteFromEstimateActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const estimateId =
    typeof formData.get('estimateId') === 'string'
      ? (formData.get('estimateId') as string).trim()
      : '';
  const title =
    typeof formData.get('title') === 'string'
      ? (formData.get('title') as string).trim()
      : '';

  if (!estimateId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Estimate ID is required.');
  }

  const client = createServiceClient();

  // Verify the estimate belongs to this org and fetch its current status.
  const { data: estimate, error: estimateError } = await client
    .from('estimates')
    .select('id, status, title')
    .eq('id', estimateId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (estimateError) {
    return err(ErrorCode.DB_ERROR, estimateError.message);
  }
  if (!estimate) {
    return err(ErrorCode.NOT_FOUND, 'Estimate not found.');
  }

  // Create the draft quote linked to this estimate.
  const quoteResult = await createDraftQuote(client, {
    createdBy: userId,
    estimateId: estimate.id,
    orgId,
    title: title || estimate.title || 'Draft quote',
  });

  if (!quoteResult.success) {
    return quoteResult;
  }

  // Advance estimate status to 'quoted' unless it's already in a terminal state.
  const terminalStatuses = new Set(['accepted', 'declined', 'expired', 'converted']);
  if (!terminalStatuses.has(estimate.status)) {
    await client
      .from('estimates')
      .update({ status: 'quoted' })
      .eq('id', estimateId)
      .eq('org_id', orgId);
  }

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath('/estimates');
  revalidatePath('/quotes');

  return ok({ quoteId: quoteResult.data.id });
}
