/**
 * V1 scheduling reliability (20260814010000_scheduling_conflict_detection.sql):
 * the one centralized conflict-detection query, and the transactional
 * job-with-schedule-and-crew creation RPC that replaces
 * createJobWithScheduleAction's old non-atomic 3-step sequence. See the
 * migration's own header comment for the full design rationale.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';

export type SchedulingConflictRecordType = 'job' | 'site_visit';

export interface SchedulingConflict {
  recordType: SchedulingConflictRecordType;
  recordId: string;
  title: string | null;
  conflictStart: string;
  conflictEnd: string;
  customerName: string | null;
  propertyAddress: string | null;
  /** Composed client-side — the RPC returns record type/id, not a URL. */
  routeUrl: string;
}

function toRouteUrl(recordType: SchedulingConflictRecordType, recordId: string): string {
  return recordType === 'job' ? `/jobs/${recordId}` : `/site-visits/${recordId}`;
}

export async function getSchedulingConflicts(
  client: DbClient,
  args: {
    orgId: string;
    userId: string;
    proposedStart: string;
    proposedEnd: string;
    excludeJobId?: string | null;
    excludeSiteVisitAppointmentId?: string | null;
  }
): Promise<Result<SchedulingConflict[]>> {
  const { data, error } = await client.rpc('get_scheduling_conflicts', {
    p_org_id: args.orgId,
    p_user_id: args.userId,
    p_proposed_start: args.proposedStart,
    p_proposed_end: args.proposedEnd,
    p_exclude_job_id: (args.excludeJobId ?? null) as unknown as string,
    p_exclude_site_visit_appointment_id: (args.excludeSiteVisitAppointmentId ?? null) as unknown as string,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);

  const rows = (data ?? []) as Array<{
    record_type: SchedulingConflictRecordType;
    record_id: string;
    title: string | null;
    conflict_start: string;
    conflict_end: string;
    customer_name: string | null;
    property_address: string | null;
  }>;

  return ok(
    rows.map((row) => ({
      recordType: row.record_type,
      recordId: row.record_id,
      title: row.title,
      conflictStart: row.conflict_start,
      conflictEnd: row.conflict_end,
      customerName: row.customer_name,
      propertyAddress: row.property_address,
      routeUrl: toRouteUrl(row.record_type, row.record_id),
    }))
  );
}

/**
 * Discriminated on `status` rather than using Result<T>'s failure branch for
 * the conflicts case — a scheduling conflict is an expected, structured
 * outcome the caller must render (a real conflict list), not a genuine
 * error. The RPC raises 'SCHEDULING_CONFLICT:<json>' specifically so this
 * wrapper can parse it back into structured conflict records; any other
 * RPC error still goes through Result<T>'s normal failure branch.
 */
export type CreateJobWithScheduleOutcome =
  | { status: 'created'; id: string; scheduled: boolean; crewAssignedCount: number }
  | { status: 'conflicts'; conflicts: SchedulingConflict[] };

const SCHEDULING_CONFLICT_PREFIX = 'SCHEDULING_CONFLICT:';

function parseSchedulingConflictError(message: string): SchedulingConflict[] | null {
  if (!message.includes(SCHEDULING_CONFLICT_PREFIX)) return null;
  const jsonStart = message.indexOf(SCHEDULING_CONFLICT_PREFIX) + SCHEDULING_CONFLICT_PREFIX.length;
  try {
    const raw = JSON.parse(message.slice(jsonStart)) as Array<{
      record_type: SchedulingConflictRecordType;
      record_id: string;
      title: string | null;
      conflict_start: string;
      conflict_end: string;
      customer_name: string | null;
      property_address: string | null;
    }>;
    return raw.map((row) => ({
      recordType: row.record_type,
      recordId: row.record_id,
      title: row.title,
      conflictStart: row.conflict_start,
      conflictEnd: row.conflict_end,
      customerName: row.customer_name,
      propertyAddress: row.property_address,
      routeUrl: toRouteUrl(row.record_type, row.record_id),
    }));
  } catch {
    return null;
  }
}

export async function createJobWithSchedule(
  client: DbClient,
  args: {
    customerId: string;
    propertyId: string;
    title: string;
    description: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    crewUserIds: string[];
    leadUserId: string | null;
    overrideConflicts: boolean;
  }
): Promise<Result<CreateJobWithScheduleOutcome>> {
  const { data, error } = await client.rpc('create_job_with_schedule', {
    p_customer_id: args.customerId,
    p_property_id: args.propertyId,
    p_title: args.title,
    p_description: args.description as unknown as string,
    p_scheduled_start: args.scheduledStart as unknown as string,
    p_scheduled_end: args.scheduledEnd as unknown as string,
    p_crew_user_ids: args.crewUserIds,
    p_lead_user_id: args.leadUserId as unknown as string,
    p_override_conflicts: args.overrideConflicts,
  });

  if (error) {
    const conflicts = parseSchedulingConflictError(error.message);
    if (conflicts) {
      return ok({ status: 'conflicts', conflicts });
    }
    return err(ErrorCode.VALIDATION_ERROR, error.message);
  }

  const result = data as unknown as { id: string; scheduled: boolean; crewAssignedCount: number };
  return ok({ status: 'created', id: result.id, scheduled: result.scheduled, crewAssignedCount: result.crewAssignedCount });
}
