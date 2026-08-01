import type { DbClient } from '@premier/db';

/**
 * Deterministic routing for a user who just landed a session via any auth
 * callback (invite, recovery, portal confirm). A user could in principle
 * have BOTH an active `org_members` row (staff) and an active
 * `customer_accounts` row (customer) — e.g. an owner who is also a
 * customer of their own org, or a stale/duplicate account from testing.
 * Checked in this order, first match wins — staff identity takes
 * precedence, since it implies operational/internal responsibility and
 * staff should never be silently dropped into the portal view of their own
 * org:
 *   1. Active `org_members` row -> `activePath` (default `/today`).
 *   2. Else active `customer_accounts` row -> `/portal/dashboard`.
 *   3. Else -> `activePath`, unchanged. Neither relationship existing yet
 *      is a legitimate, transient state — e.g. mid-invite-acceptance via
 *      `/invite/[token]/continue`, where `activePath` carries a
 *      `redirectTo` back to the link that is about to activate the
 *      membership itself. Guessing a different destination here would
 *      break that flow; the caller is trusted to pass a safe
 *      `activePath`/`redirectTo` (see `normalizeRedirectPath`).
 */
export async function getPostAuthRedirectPath(
  supabase: DbClient,
  userId: string,
  activePath = '/today'
): Promise<string> {
  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (membership) {
    return activePath;
  }

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (customerAccount) {
    return '/portal/dashboard';
  }

  return activePath;
}

export function normalizeRedirectPath(
  rawValue: string | null | undefined,
  fallback = '/today'
): string {
  // A single leading slash is required, but `//evil.com` and `/\evil.com`
  // are protocol-relative URLs a browser resolves to a different origin —
  // reject those so `redirectTo` can never become an open redirect.
  if (!rawValue || !rawValue.startsWith('/') || /^\/[/\\]/.test(rawValue)) {
    return fallback;
  }

  return rawValue;
}
