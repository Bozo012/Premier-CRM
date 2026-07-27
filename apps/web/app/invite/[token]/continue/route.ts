import { NextResponse, type NextRequest } from 'next/server';

import { acceptOrgInvite, createServiceClient, getInviteByToken } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

/**
 * Reached after /auth/confirm establishes a session for a brand-new invitee
 * (see that route's doc comment for the full round-trip). By this point the
 * user's email is Supabase-confirmed, so it's safe to run accept_org_invite
 * — this is the actual "join the org" step, deferred until after
 * confirmation rather than running immediately post-signUp (see
 * apps/web/app/invite/actions.ts).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  function redirectWithMessage(message: string) {
    const url = new URL(`/invite/${token}`, request.url);
    url.searchParams.set('message', message);
    return NextResponse.redirect(url);
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectWithMessage('Please confirm your email to continue.');
  }

  const serviceClient = createServiceClient();
  const inviteResult = await getInviteByToken(serviceClient, { token });
  if (!inviteResult.success) {
    return redirectWithMessage('This invite could not be found.');
  }
  const invite = inviteResult.data;

  if (invite.status !== 'pending') {
    return redirectWithMessage('This invite has already been used or is no longer valid.');
  }
  if (new Date(invite.expires_at) < new Date()) {
    return redirectWithMessage('This invite has expired. Ask an owner or admin to send a new one.');
  }
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return redirectWithMessage('This invite was issued to a different email address.');
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
    return redirectWithMessage(
      `Your account was confirmed, but we couldn't finish joining the team: ${acceptResult.error}. Contact an owner or admin.`
    );
  }

  return NextResponse.redirect(new URL('/today', request.url));
}
