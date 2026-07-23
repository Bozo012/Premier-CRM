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
