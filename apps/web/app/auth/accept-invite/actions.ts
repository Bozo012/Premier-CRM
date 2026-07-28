'use server';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { acceptOrgInvite, createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type CompleteInviteAcceptanceState = Result<{
  alreadyAccepted: boolean;
  orgName: string;
}>;

/**
 * The one place org_members ever gets activated for a Supabase-native
 * invite (Auth Reset architecture — see /auth/accept-invite/page.tsx's doc
 * comment for the full round-trip). Requires the caller to already have a
 * real Supabase session — established client-side by the invite email's
 * link itself (implicit-flow hash fragment, same mechanism
 * update-password/page.tsx already relies on) — never a token passed
 * through this action's own arguments, so there is nothing here that could
 * leak or misuse a raw invite/confirmation token.
 *
 * Matches by the SESSION'S OWN VERIFIED EMAIL, not a URL param — Supabase
 * only ever establishes this session for the exact address
 * admin.inviteUserByEmail() was called with, so email-matching here is as
 * strong a guarantee as the token-based matching accept_org_invite() itself
 * also re-checks.
 *
 * Idempotent: re-invoking after a successful acceptance (e.g. the page
 * reloads, or the user re-opens a still-valid session) recognizes the
 * invite is already accepted BY THIS SAME USER and returns success without
 * calling accept_org_invite() again — never creates a duplicate membership
 * or downgrades an existing role, since it simply doesn't re-run the
 * activation at all in that case.
 */
export async function completeInviteAcceptanceAction(
  fullName: string
): Promise<CompleteInviteAcceptanceState> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return err(
      ErrorCode.FORBIDDEN,
      'No verified session was found. Please open the invitation link again.'
    );
  }

  const serviceClient = createServiceClient();
  const { data: invites, error: invitesError } = await serviceClient
    .from('org_invites')
    .select('*')
    .eq('email', user.email.toLowerCase())
    .order('created_at', { ascending: false });

  if (invitesError) {
    return err(ErrorCode.DB_ERROR, invitesError.message);
  }

  const all = invites ?? [];

  // Idempotent re-open: this exact user already completed this exact
  // invite — never re-run acceptance, never touch the row again.
  const alreadyAcceptedByMe = all.find(
    (invite) => invite.status === 'accepted' && invite.accepted_user_id === user.id
  );
  if (alreadyAcceptedByMe) {
    const orgName = await resolveOrgName(serviceClient, alreadyAcceptedByMe.org_id);
    return ok({ alreadyAccepted: true, orgName });
  }

  const pending = all.filter(
    (invite) => invite.status === 'pending' && new Date(invite.expires_at) > new Date()
  );

  if (pending.length === 0) {
    return err(
      ErrorCode.NOT_FOUND,
      'No valid pending invitation was found for this email. Ask an owner or admin to send a new one.'
    );
  }
  if (pending.length > 1) {
    return err(
      ErrorCode.CONFLICT,
      'More than one pending invitation exists for this email. Contact an owner to resolve which one is correct before continuing.'
    );
  }

  const invite = pending[0]!;
  const acceptResult = await acceptOrgInvite(serviceClient, {
    token: invite.token,
    userId: user.id,
    fullName: fullName.trim() || invite.full_name,
  });

  if (!acceptResult.success) {
    return acceptResult;
  }

  const orgName = await resolveOrgName(serviceClient, acceptResult.data.orgId);
  return ok({ alreadyAccepted: false, orgName });
}

async function resolveOrgName(
  serviceClient: ReturnType<typeof createServiceClient>,
  orgId: string
): Promise<string> {
  const { data: org } = await serviceClient
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();
  return org?.name?.trim() || 'your organization';
}
