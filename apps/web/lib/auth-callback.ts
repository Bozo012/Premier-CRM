import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Explicitly establishes a session from whatever shape Supabase's hosted
 * verify redirect actually delivered, instead of relying only on
 * `onAuthStateChange` to notice a session appeared. Checked in this order:
 *
 * 1. `?code=` (PKCE) -> `exchangeCodeForSession`.
 * 2. `?token_hash=&type=` -> `verifyOtp`.
 * 3. URL hash fragment `access_token`/`refresh_token` (implicit flow) ->
 *    `setSession`. This is the shape actually proven working today for
 *    invite links (see `auth/accept-invite/page.tsx`) and is the most
 *    likely real path for every email type in this project, since
 *    Supabase's hosted verify endpoint uses the same redirect mechanism
 *    regardless of the client's configured `flowType`.
 *
 * Falls back to `getSession()` (a session may already be present) if none
 * of the three URL shapes matched. The caller should still listen to
 * `onAuthStateChange` as a secondary confirmation, not as the primary
 * detection mechanism.
 */
export async function establishSessionFromCallback(
  supabase: SupabaseClient
): Promise<{ hasSession: boolean }> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    window.history.replaceState(null, '', window.location.pathname);
    if (!error) return { hasSession: true };
  }

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'invite' | 'email_change' | 'email',
    });
    window.history.replaceState(null, '', window.location.pathname);
    if (!error) return { hasSession: true };
  }

  const hash = window.location.hash;
  if (hash.length > 1) {
    const hashParams = new URLSearchParams(hash.slice(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      window.history.replaceState(null, '', window.location.pathname);
      if (!error) return { hasSession: true };
    }
  }

  const { data } = await supabase.auth.getSession();
  return { hasSession: Boolean(data.session) };
}
