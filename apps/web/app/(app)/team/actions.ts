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
  getActiveOrgContext,
  listPendingInvites,
  resendOrgInvite,
  revokeOrgInvite,
  type OrgInvite,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { getAppUrl, sendExistingUserJoinEmail } from '@/lib/email';
import { findAuthUserByEmail } from '@/lib/auth-admin';

/** "employee" -> "Employee" — for the invite email's human-readable role line. */
function displayRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Auth Reset architecture: exactly one email per invite, and which one
 * depends entirely on whether the address already has a CONFIRMED Supabase
 * Auth account.
 *
 *  - No account yet, or an account that was invited but never confirmed:
 *    `admin.inviteUserByEmail()` — Supabase's own native invite email,
 *    sent by Supabase itself. Never combined with a second, custom email
 *    for the same new user.
 *  - Already has a confirmed account (an existing employee/owner/etc being
 *    invited into another org, or re-invited after their first invite
 *    email was lost): our own application email
 *    (sendExistingUserJoinEmail()) with a link to /invite/[token]/continue,
 *    which requires them to actually sign in with their existing password
 *    before it will activate anything — see that route's doc comment.
 *
 * Used by both createInviteAction (new invite) and resendInviteAction
 * (still-pending invite) so a resend re-evaluates which path currently
 * applies rather than assuming it hasn't changed.
 */
async function sendInvitationEmail(args: {
  serviceClient: ReturnType<typeof createServiceClient>;
  invite: OrgInvite;
  fullName: string;
  inviterName: string;
  orgName: string;
}): Promise<{ sent: boolean }> {
  const { serviceClient, invite, fullName, inviterName, orgName } = args;

  const existingUser = await findAuthUserByEmail(serviceClient, invite.email);

  if (!existingUser || !existingUser.confirmedAt) {
    const { error } = await serviceClient.auth.admin.inviteUserByEmail(invite.email, {
      redirectTo: `${getAppUrl()}/auth/accept-invite`,
      data: { full_name: fullName },
    });
    if (error) {
      console.error('[team] Supabase inviteUserByEmail failed:', error.message);
    }
    return { sent: !error };
  }

  return sendExistingUserJoinEmail({
    displayRole: displayRoleLabel(invite.role),
    expiresAt: invite.expires_at,
    fullName,
    joinUrl: `/invite/${invite.token}/continue`,
    inviterName,
    orgName,
    toEmail: invite.email,
  });
}

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

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }
  const { orgId, role } = orgContextResult.data;
  if (role !== 'owner' && role !== 'admin') {
    return err(ErrorCode.FORBIDDEN, 'Only owners and admins can manage the team.');
  }

  return ok({ orgId, userId: user.id });
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

  const [{ data: inviterProfile }, { data: org }] = await Promise.all([
    serviceClient.from('user_profiles').select('full_name').eq('id', userId).maybeSingle(),
    serviceClient.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  const { sent } = await sendInvitationEmail({
    serviceClient,
    invite: inviteResult.data,
    fullName: parsed.data.fullName,
    inviterName: inviterProfile?.full_name?.trim() || 'A team member',
    orgName: org?.name?.trim() || 'the team',
  });

  revalidatePath('/team');

  return ok({ emailSent: sent, invite: inviteResult.data });
}

export type ResendInviteActionState = Result<{ emailSent: boolean; invite: OrgInvite }>;

/**
 * Resends the invitation email for a still-pending invite (PR C0, Phase 5).
 * Reuses the exact same owner/admin-only getTeamActionContext() guard as
 * createInviteAction — an employee cannot reach this action any more than
 * they can reach invite creation. resendOrgInvite() (packages/db/queries/
 * org-invites.ts) enforces the actual per-invite cooldown so repeated clicks
 * can't be used to spam the recipient.
 */
export async function resendInviteAction(
  _prevState: ResendInviteActionState | null,
  formData: FormData
): Promise<ResendInviteActionState> {
  const contextResult = await getTeamActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const inviteId =
    typeof formData.get('inviteId') === 'string' ? (formData.get('inviteId') as string).trim() : '';
  if (!inviteId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Invite ID is required.');
  }

  const serviceClient = createServiceClient();
  const result = await resendOrgInvite(serviceClient, { inviteId, orgId });
  if (!result.success) return result;
  const invite = result.data;

  const [{ data: inviterProfile }, { data: org }] = await Promise.all([
    serviceClient.from('user_profiles').select('full_name').eq('id', userId).maybeSingle(),
    serviceClient.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  const { sent } = await sendInvitationEmail({
    serviceClient,
    invite,
    fullName: invite.full_name,
    inviterName: inviterProfile?.full_name?.trim() || 'A team member',
    orgName: org?.name?.trim() || 'the team',
  });

  revalidatePath('/team');

  return ok({ emailSent: sent, invite });
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
