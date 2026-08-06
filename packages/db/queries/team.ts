import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type OrgMember = Database['public']['Tables']['org_members']['Row'];
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type TeamAvailability = Database['public']['Tables']['team_member_availability']['Row'];

export interface TeamMemberRecord {
  member: OrgMember;
  profile: Pick<UserProfile, 'full_name' | 'phone'> | null;
  availability: TeamAvailability | null;
}

/**
 * Single-member fetch backing the new Team Member Detail route
 * (apps/web/app/(app)/(forge)/team/[memberId]/page.tsx). Additive — the
 * existing Team list page (packages nothing changed) fetches the whole
 * `org_members` page at once via its own inline query; this is the same
 * three-table shape (org_members + user_profiles + team_member_availability)
 * scoped to one member id, for the detail route.
 *
 * `memberId` is `org_members.id` (matching the `id` field of the list
 * page's `TeamMemberView`, not `user_id`) — org-scoped by `org_id` the same
 * way every other detail query in this codebase scopes by org, so a member
 * id from another org resolves to NOT_FOUND rather than leaking data.
 */
export async function getTeamMemberById(
  client: DbClient,
  args: { memberId: string; orgId: string }
): Promise<Result<TeamMemberRecord>> {
  const { memberId, orgId } = args;

  const { data: member, error: memberError } = await client
    .from('org_members')
    .select('*')
    .eq('id', memberId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (memberError) {
    return err(ErrorCode.DB_ERROR, memberError.message);
  }
  if (!member) {
    return err(ErrorCode.NOT_FOUND, 'Team member not found.');
  }

  const [profileResult, availabilityResult] = await Promise.all([
    client.from('user_profiles').select('full_name, phone').eq('id', member.user_id).maybeSingle(),
    client.from('team_member_availability').select('*').eq('org_id', orgId).eq('user_id', member.user_id).maybeSingle(),
  ]);

  if (profileResult.error) {
    return err(ErrorCode.DB_ERROR, profileResult.error.message);
  }
  if (availabilityResult.error) {
    return err(ErrorCode.DB_ERROR, availabilityResult.error.message);
  }

  return ok({
    member,
    profile: profileResult.data ?? null,
    availability: (availabilityResult.data as TeamAvailability | null) ?? null,
  });
}
