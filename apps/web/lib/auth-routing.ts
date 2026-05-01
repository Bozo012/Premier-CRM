import type { DbClient } from '@premier/db';

export type MembershipStatus = 'active' | 'missing' | 'pending' | 'rejected';

export async function getMembershipStatus(
  supabase: DbClient,
  userId: string
): Promise<MembershipStatus> {
  const { data, error } = await supabase
    .from('org_members')
    .select('status')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return 'missing';
  }

  if (!data?.status) {
    return 'missing';
  }

  if (
    data.status === 'active' ||
    data.status === 'pending' ||
    data.status === 'rejected'
  ) {
    return data.status;
  }

  return 'missing';
}

export async function getPostAuthRedirectPath(
  supabase: DbClient,
  userId: string,
  activePath = '/today'
): Promise<string> {
  const membershipStatus = await getMembershipStatus(supabase, userId);

  return membershipStatus === 'active' ? activePath : '/pending-approval';
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
