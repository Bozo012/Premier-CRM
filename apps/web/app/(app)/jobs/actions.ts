'use server';

import {
  CreateQuoteFromJobInputSchema,
  ErrorCode,
  err,
  ok,
  type Result,
} from '@premier/shared';
import { createDraftQuote, createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type CreateDraftQuoteActionState = Result<{ quoteId: string }>;

async function getJobActionContext(): Promise<
  Result<{ orgId: string; userId: string }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(
      ErrorCode.FORBIDDEN,
      'You must be signed in to create a draft quote.'
    );
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
    return err(
      ErrorCode.FORBIDDEN,
      'No organization membership was found for this user.'
    );
  }

  return ok({
    orgId: membership.org_id,
    userId: user.id,
  });
}

export async function createDraftQuoteAction(
  _previousState: CreateDraftQuoteActionState | null,
  formData: FormData
): Promise<CreateDraftQuoteActionState> {
  const access = await getJobActionContext();

  if (!access.success) {
    return access;
  }

  const parsed = CreateQuoteFromJobInputSchema.safeParse({
    jobId: formData.get('jobId'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid quote creation payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await createDraftQuote(serviceClient, {
    createdBy: access.data.userId,
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  return ok({ quoteId: result.data.id });
}
