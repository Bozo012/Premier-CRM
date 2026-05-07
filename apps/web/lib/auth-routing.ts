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
  if (!rawValue || !rawValue.startsWith('/')) {
    return fallback;
  }

  return rawValue;
}
