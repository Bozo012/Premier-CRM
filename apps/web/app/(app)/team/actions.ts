'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  TeamMemberInviteSchema,
  err,
  ok,
  type Result,
} from '@premier/shared';
import {
  createOrgInvite,
  createServiceClient,
  listPendingInvites,
  revokeOrgInvite,
  type OrgInvite,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { sendTeamInviteEmail } from '@/lib/email';

interface TeamActionContext {
  orgId: string;
  userId: string;
}

async function getTeamActionContext(): Promise<Result<TeamActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to manage the team.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }
  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return err(ErrorCode.FORBIDDEN, 'Only owners and admins can manage the team.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
}

export type CreateInviteActionState = Result<{ emailSent: boolean; invite: OrgInvite }>;

export async function createInviteAction(
  _prevState: CreateInviteActionState | null,
  formData: FormData
): Promise<CreateInviteActionState> {
  const contextResult = await getTeamActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const parsed = TeamMemberInviteSchema.safeParse({
    email: formData.get('email'),
    fullName: formData.get('fullName'),
    role: formData.get('role'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(ErrorCode.VALIDATION_ERROR, firstIssue?.message ?? 'Invalid invite details.');
  }

  const serviceClient = createServiceClient();

  const inviteResult = await createOrgInvite(serviceClient, {
    input: parsed.data,
    invitedBy: userId,
    orgId,
  });

  if (!inviteResult.success) {
    return inviteResult;
  }

  const { data: inviterProfile } = await serviceClient
    .from('user_profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  const { sent } = await sendTeamInviteEmail({
    fullName: parsed.data.fullName,
    inviteUrl: `/invite/${inviteResult.data.token}`,
    inviterName: inviterProfile?.full_name?.trim() || 'A Premier team member',
    toEmail: parsed.data.email,
  });

  revalidatePath('/team');

  return ok({ emailSent: sent, invite: inviteResult.data });
}

export type RevokeInviteActionState = Result<{ inviteId: string }>;

export async function revokeInviteAction(
  _prevState: RevokeInviteActionState | null,
  formData: FormData
): Promise<RevokeInviteActionState> {
  const contextResult = await getTeamActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const inviteId = typeof formData.get('inviteId') === 'string' ? (formData.get('inviteId') as string).trim() : '';
  if (!inviteId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Invite ID is required.');
  }

  const serviceClient = createServiceClient();
  const result = await revokeOrgInvite(serviceClient, { inviteId, orgId });
  if (!result.success) return result;

  revalidatePath('/team');

  return ok({ inviteId });
}

export type ListPendingInvitesActionState = Result<OrgInvite[]>;

export async function listPendingInvitesAction(): Promise<ListPendingInvitesActionState> {
  const contextResult = await getTeamActionContext();
  if (!contextResult.success) return contextResult;

  const serviceClient = createServiceClient();
  return listPendingInvites(serviceClient, { orgId: contextResult.data.orgId });
}
