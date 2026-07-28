import { NextResponse, type NextRequest } from 'next/server';

import { acceptOrgInvite, createServiceClient, getInviteByToken } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

/**
 * Auth Reset architecture — this route is now ONLY the "existing confirmed
 * user joins another organization" path (see team/actions.ts's
 * createInviteAction and the app email it sends): a person who already has
 * a confirmed Supabase Auth account, invited to join an org they don't yet
 * belong to. Brand-new users no longer come through here at all — they go
 * through Supabase's own "Invite user" email straight to
 * /auth/accept-invite, which establishes their session itself.
 *
 * Because this route requires the visitor to already be signed in (there's
 * no email link establishing a session here — the join email links
 * straight to this URL), an unauthenticated visit redirects to /login with
 * this URL as `redirectTo`, then lands back here once they've signed in
 * with their existing password.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  function redirectToLoginWithMessage(message: string) {
    const url = new URL('/login', request.url);
    url.searchParams.set('message', message);
    return NextResponse.redirect(url);
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', `/invite/${token}/continue`);
    return NextResponse.redirect(loginUrl);
  }

  const serviceClient = createServiceClient();
  const inviteResult = await getInviteByToken(serviceClient, { token });
  if (!inviteResult.success) {
    return redirectToLoginWithMessage('This invite could not be found.');
  }
  const invite = inviteResult.data;

  // Idempotent re-open: this exact user already completed this exact
  // invite — never re-run acceptance or treat it as an error.
  if (invite.status === 'accepted' && invite.accepted_user_id === user.id) {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  if (invite.status !== 'pending') {
    await supabase.auth.signOut();
    return redirectToLoginWithMessage('This invite has already been used or is no longer valid.');
  }
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.auth.signOut();
    return redirectToLoginWithMessage(
      'This invite has expired. Ask an owner or admin to send a new one.'
    );
  }
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    await supabase.auth.signOut();
    return redirectToLoginWithMessage(
      `This invite was issued to ${invite.email}. Sign in with that email address instead.`
    );
  }

  const fullName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    invite.full_name;

  const acceptResult = await acceptOrgInvite(serviceClient, {
    token,
    userId: user.id,
    fullName,
  });

  if (!acceptResult.success) {
    return redirectToLoginWithMessage(
      `We couldn't finish joining the team: ${acceptResult.error}. Contact an owner or admin.`
    );
  }

  return NextResponse.redirect(new URL('/today', request.url));
}
