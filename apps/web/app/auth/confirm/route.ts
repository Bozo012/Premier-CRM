import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase-server';

/**
 * Supabase Auth email-confirmation callback. Reached when a user clicks the
 * "Confirm signup" link — the Supabase dashboard's email template for that
 * link must be set to:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 *
 * (the default template points at Supabase's own hosted verify endpoint
 * instead, which would complete the OTP server-side on Supabase and never
 * give this app a chance to establish a session via cookies — see
 * apps/web/app/invite/actions.ts for how `next` gets set via `emailRedirectTo`
 * to carry an invite token through this round-trip).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/today';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.search = '';

  if (tokenHash && type) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  // Failure fallback: if `next` was an invite continue URL, send them back to
  // that invite's own page (which already knows how to render a `message`
  // error state) rather than a generic login page that doesn't.
  const inviteMatch = next.match(/^\/invite\/([0-9a-f-]{36})\/continue$/i);
  const fallback = request.nextUrl.clone();
  fallback.pathname = inviteMatch ? `/invite/${inviteMatch[1]}` : '/login';
  fallback.search = '';
  fallback.searchParams.set(
    'message',
    'That confirmation link is invalid or has expired. Please try again.'
  );
  return NextResponse.redirect(fallback);
}
