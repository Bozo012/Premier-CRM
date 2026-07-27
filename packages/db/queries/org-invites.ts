import { ErrorCode, err, ok, type Result, type TeamMemberInvite } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type OrgInvite = Database['public']['Tables']['org_invites']['Row'];

/**
 * Translates the friendly RAISE EXCEPTION messages from accept_org_invite()
 * (migration 20260723000000/20260723000001) into VALIDATION_ERROR results —
 * those messages are already written for a human reader, mirroring
 * translatePaymentError() in invoices.ts.
 */
export function translateAcceptInviteError(message: string): Result<never> {
  if (
    message.includes('Invite not found') ||
    message.includes('already been used') ||
    message.includes('expired') ||
    message.includes('different email address') ||
    message.includes('on behalf of another user')
  ) {
    return err(ErrorCode.VALIDATION_ERROR, message);
  }
  return err(ErrorCode.DB_ERROR, message);
}

export async function createOrgInvite(
  client: DbClient,
  args: { input: TeamMemberInvite; invitedBy: string; orgId: string }
): Promise<Result<OrgInvite>> {
  const { data, error } = await client
    .from('org_invites')
    .insert({
      org_id: args.orgId,
      email: args.input.email.toLowerCase(),
      full_name: args.input.fullName,
      role: args.input.role,
      invited_by: args.invitedBy,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return err(
        ErrorCode.VALIDATION_ERROR,
        'There is already a pending invite for this email address.'
      );
    }
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data);
}

export async function listPendingInvites(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<OrgInvite[]>> {
  const { data, error } = await client
    .from('org_invites')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data ?? []);
}

/**
 * Minimum time between resends of the same invite (PR C0, Phase 5) — a
 * simple per-invite cooldown rather than a separate rate-limit table, since
 * this only needs to stop rapid repeated clicks/abuse of one button, not
 * track usage across invites or users.
 */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Marks a pending invite as resent (bumping `last_resent_at`) if it's
 * eligible — the caller (resendInviteAction in
 * apps/web/app/(app)/team/actions.ts) sends the actual email afterward.
 * Enforces, in order: invite belongs to this org, is still pending, isn't
 * expired, and hasn't been resent within RESEND_COOLDOWN_SECONDS (falling
 * back to `created_at` if it has never been resent before).
 */
export async function resendOrgInvite(
  client: DbClient,
  args: { inviteId: string; orgId: string }
): Promise<Result<OrgInvite>> {
  const { data: invite, error: fetchError } = await client
    .from('org_invites')
    .select('*')
    .eq('id', args.inviteId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (fetchError) {
    return err(ErrorCode.DB_ERROR, fetchError.message);
  }
  if (!invite) {
    return err(ErrorCode.NOT_FOUND, 'Invite not found.');
  }
  if (invite.status !== 'pending') {
    return err(ErrorCode.VALIDATION_ERROR, 'Only a pending invite can be resent.');
  }
  if (new Date(invite.expires_at) < new Date()) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'This invite has expired. Revoke it and send a new one instead.'
    );
  }

  const lastSentAt = invite.last_resent_at ?? invite.created_at;
  const secondsSinceLastSend = (Date.now() - new Date(lastSentAt).getTime()) / 1000;
  if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
    const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
    return err(
      ErrorCode.VALIDATION_ERROR,
      `Please wait ${waitSeconds}s before resending this invite again.`
    );
  }

  const { data: updated, error: updateError } = await client
    .from('org_invites')
    .update({ last_resent_at: new Date().toISOString() })
    .eq('id', args.inviteId)
    .select('*')
    .single();

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  return ok(updated);
}

export async function revokeOrgInvite(
  client: DbClient,
  args: { inviteId: string; orgId: string }
): Promise<Result<void>> {
  const { data, error } = await client
    .from('org_invites')
    .update({ status: 'revoked' })
    .eq('id', args.inviteId)
    .eq('org_id', args.orgId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }
  if (!data) {
    return err(ErrorCode.NOT_FOUND, 'Invite not found or already resolved.');
  }

  return ok(undefined);
}

/**
 * Public accept-page lookup (used by /invite/[token] — no auth required).
 * Must be called with a service-role client. Returns the invite regardless
 * of status/expiry so the page can render an accurate "already used" /
 * "expired" message rather than a bare 404.
 */
export async function getInviteByToken(
  client: DbClient,
  args: { token: string }
): Promise<Result<OrgInvite>> {
  const { data, error } = await client
    .from('org_invites')
    .select('*')
    .eq('token', args.token)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }
  if (!data) {
    return err(ErrorCode.NOT_FOUND, 'Invite not found.');
  }

  return ok(data);
}

/**
 * Accepts an invite for a user who just completed Supabase Auth signUp.
 * Delegates to accept_org_invite() (SQL function, service_role-only) for
 * atomicity — creates org_members + user_profiles and marks the invite
 * accepted in a single transaction.
 */
export async function acceptOrgInvite(
  client: DbClient,
  args: { fullName: string; token: string; userId: string }
): Promise<Result<{ orgId: string }>> {
  const { data, error } = await client.rpc('accept_org_invite', {
    p_token: args.token,
    p_user_id: args.userId,
    p_full_name: args.fullName,
  });

  if (error) {
    return translateAcceptInviteError(error.message);
  }

  return ok({ orgId: data });
}
