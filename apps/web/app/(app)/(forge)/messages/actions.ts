'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, hasCapability, type OrgRole, type Result } from '@premier/shared';
import { getActiveOrgContext, markThreadReadByStaff, sendStaffReply, type CommunicationMessage } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

async function getMessagesActionContext(): Promise<Result<{ orgId: string; role: OrgRole }>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in.');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  return ok({ orgId: orgContextResult.data.orgId, role: orgContextResult.data.role as OrgRole });
}

export type SendStaffReplyActionState = Result<CommunicationMessage>;

export async function sendStaffReplyAction(threadId: string, body: string): Promise<SendStaffReplyActionState> {
  const access = await getMessagesActionContext();
  if (!access.success) return access;

  // Client/UI hiding of the reply form is not sufficient on its own — the
  // RPC also enforces this, but this app-level check keeps the failure mode
  // consistent with every other capability-gated action in the codebase.
  if (!hasCapability(access.data.role, 'canReplyToCustomers')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit replying to customers.');
  }

  const supabase = await getServerSupabase();
  const result = await sendStaffReply(supabase, threadId, body);
  if (!result.success) return result;

  revalidatePath(`/messages/${threadId}`);
  revalidatePath('/messages');
  return result;
}

export async function markThreadReadByStaffAction(threadId: string): Promise<Result<null>> {
  const access = await getMessagesActionContext();
  if (!access.success) return access;

  const supabase = await getServerSupabase();
  return markThreadReadByStaff(supabase, threadId, access.data.orgId);
}
