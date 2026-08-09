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

export interface AssignableTeamMember {
  userId: string;
  displayName: string;
  role: string;
  availabilityStatus: Database['public']['Enums']['team_availability_status'] | null;
}

/**
 * Active org members eligible for job-crew assignment — the same
 * org_members (status='active') + user_profiles + team_member_availability
 * shape the Team list page already queries inline
 * (apps/web/app/(app)/(forge)/team/page.tsx), extracted here as a reusable
 * query so the Job Detail crew-assignment picker (design/
 * job-crew-assignment-model's UI slice) doesn't hand-roll a second copy of
 * the same three-table join. Real data only — no fabricated "availability"
 * default beyond the same resolveDisplayedTeamAvailability the Team page
 * itself uses, which callers can apply to `availabilityStatus` alongside a
 * real assignment count if they have one.
 */
export async function listActiveTeamMembers(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<AssignableTeamMember[]>> {
  const { data: members, error: membersError } = await client
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', args.orgId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (membersError) {
    return err(ErrorCode.DB_ERROR, membersError.message);
  }

  const rows = members ?? [];
  if (rows.length === 0) return ok([]);

  const userIds = rows.map((row) => row.user_id);

  const [profilesResult, availabilityResult] = await Promise.all([
    client.from('user_profiles').select('id, full_name').in('id', userIds),
    client.from('team_member_availability').select('user_id, availability_status').eq('org_id', args.orgId).in('user_id', userIds),
  ]);

  if (profilesResult.error) {
    return err(ErrorCode.DB_ERROR, profilesResult.error.message);
  }
  if (availabilityResult.error) {
    return err(ErrorCode.DB_ERROR, availabilityResult.error.message);
  }

  const nameByUserId = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name]));
  const availabilityByUserId = new Map(
    (availabilityResult.data as Pick<TeamAvailability, 'user_id' | 'availability_status'>[] | null ?? []).map((a) => [
      a.user_id,
      a.availability_status,
    ])
  );

  return ok(
    rows.map((row) => ({
      userId: row.user_id,
      displayName: nameByUserId.get(row.user_id) ?? 'Unknown',
      role: row.role,
      availabilityStatus: availabilityByUserId.get(row.user_id) ?? null,
    }))
  );
}
