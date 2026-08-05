import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { Database } from '../types';
import type { DbClient } from '../client';

export type TeamAvailabilityRecord = Database['public']['Tables']['team_member_availability']['Row'];
export type TeamAvailabilityStatus = Database['public']['Enums']['team_availability_status'];

export const TEAM_AVAILABILITY_STATUSES = [
  'available',
  'on_job',
  'off_shift',
  'on_leave',
] as const satisfies readonly TeamAvailabilityStatus[];

const TEAM_AVAILABILITY_LABELS: Record<TeamAvailabilityStatus, string> = {
  available: 'Available',
  off_shift: 'Off shift',
  on_job: 'On job',
  on_leave: 'On leave',
};

export function isTeamAvailabilityStatus(value: unknown): value is TeamAvailabilityStatus {
  return typeof value === 'string' && TEAM_AVAILABILITY_STATUSES.includes(value as TeamAvailabilityStatus);
}

export function formatTeamAvailabilityLabel(status: TeamAvailabilityStatus): string {
  return TEAM_AVAILABILITY_LABELS[status];
}

export function resolveDisplayedTeamAvailability(args: {
  activeAssignmentCount: number;
  manualStatus: TeamAvailabilityStatus | null | undefined;
}): TeamAvailabilityStatus {
  const manualStatus = args.manualStatus ?? 'available';

  if (manualStatus === 'off_shift' || manualStatus === 'on_leave' || manualStatus === 'on_job') {
    return manualStatus;
  }

  return args.activeAssignmentCount > 0 ? 'on_job' : 'available';
}

export async function upsertTeamMemberAvailability(
  client: DbClient,
  args: {
    actorUserId: string;
    orgId: string;
    status: TeamAvailabilityStatus;
    userId: string;
  }
): Promise<Result<TeamAvailabilityRecord>> {
  const payload: Database['public']['Tables']['team_member_availability']['Insert'] = {
    availability_status: args.status,
    org_id: args.orgId,
    updated_by: args.actorUserId,
    user_id: args.userId,
  };

  if (args.actorUserId === args.userId) {
    payload.last_seen_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from('team_member_availability')
    .upsert(payload, { onConflict: 'org_id,user_id' })
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data as TeamAvailabilityRecord);
}
