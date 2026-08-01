/**
 * GET /auth/confirm
 *
 * Production's Supabase Auth email templates link here with
 * `?token_hash=...&type=...&next=...` (Supabase's own recommended pattern
 * for apps using @supabase/ssr) — confirmed by inspecting a real signup
 * confirmation email, not assumed. This route was missing entirely, which
 * is why signup confirmation still 404'd even after emailRedirectTo and
 * /portal/confirm were fixed: `next` (built from emailRedirectTo) was
 * correctly propagated all the way through, but nothing existed to
 * actually verify the token and establish the session before redirecting
 * to it.
 *
 * `next` is user-suppliable (a tampered confirmation URL) even though this
 * app only ever generates same-origin values for it, so it's validated as
 * same-origin before use, same reasoning as
 * app/api/client-error-log/redact.ts's safePathname().
 */

import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { getAppUrl } from '@/lib/email';
import { getServerSupabase } from '@/lib/supabase-server';

function safeNextPath(rawNext: string | null): string {
  const fallback = '/login';
  if (!rawNext) return fallback;

  if (rawNext.startsWith('/') && !/^\/[/\\]/.test(rawNext)) {
    return rawNext;
  }

  try {
    const parsed = new URL(rawNext);
    const appOrigin = new URL(getAppUrl()).origin;
    if (parsed.origin !== appOrigin) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));

  if (tokenHash && type) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      redirect(next);
    }
  }

  redirect(`/login?message=${encodeURIComponent('This confirmation link is invalid or has expired.')}`);
}
