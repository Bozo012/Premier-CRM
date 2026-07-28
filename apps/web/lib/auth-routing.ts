import type { DbClient } from '@premier/db';

export async function getPostAuthRedirectPath(
  _supabase: DbClient,
  _userId: string,
  activePath = '/today'
): Promise<string> {
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
