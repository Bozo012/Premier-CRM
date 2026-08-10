/**
 * Job-crew assignment — query/action layer for the new `job_assignments`
 * table + `assign_member_to_job`/`remove_member_from_job`/`set_job_lead`
 * RPCs (see supabase/migrations/20260808000000_job_assignments_model.sql).
 *
 * TEMPORARY TYPING NOTE: this migration has not been applied yet (design/
 * job-crew-assignment-model — the audit/design pass, migration application
 * is a separate, explicitly-authorized follow-up). `packages/db/types.ts`
 * is generated from the live schema via `pnpm db:types`, so it has no
 * knowledge of `job_assignments` or the three new RPCs yet — every call
 * site below is narrowly cast past `DbClient`'s strict `Database` typing.
 * Once the migration is applied and `pnpm db:types` is re-run, these casts
 * should be removed and the hand-written `JobAssignmentRow` type replaced
 * with `Database['public']['Tables']['job_assignments']['Row']`.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';

/**
 * Escapes DbClient's strict, generated `Database` typing for the one table
 * and three RPCs this file calls that don't exist in packages/db/types.ts
 * yet (see the file-level TEMPORARY TYPING NOTE above). Narrowed to exactly
 * the two methods used here rather than a bare `any` client, so everything
 * else in this file still gets full type safety.
 */
interface UntypedDbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

function untyped(client: DbClient): UntypedDbClient {
  return client as unknown as UntypedDbClient;
}

export interface JobAssignmentRow {
  id: string;
  org_id: string;
  job_id: string;
  user_id: string;
  is_lead: boolean;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobAssignment {
  id: string;
  jobId: string;
  userId: string;
  displayName: string;
  isLead: boolean;
  assignedAt: string;
}

export interface MemberJobAssignment {
  id: string;
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  jobNumber: string | null;
  isLead: boolean;
  assignedAt: string;
}

/**
 * Every crew member assigned to a job, most-recently-assigned first
 * (created_at desc, id asc as a tiebreaker for full determinism).
 *
 * Two-step fetch rather than a PostgREST embed: job_assignments.user_id
 * references auth.users(id), not user_profiles — there is no direct FK
 * from job_assignments to user_profiles for PostgREST to auto-embed
 * through, so this follows getTeamMemberById's established two-query
 * pattern (packages/db/queries/team.ts) instead.
 */
export async function listJobAssignments(
  client: DbClient,
  args: { orgId: string; jobId: string }
): Promise<Result<JobAssignment[]>> {
  const { data, error } = await untyped(client)
    .from('job_assignments')
    .select('id, job_id, user_id, is_lead, created_at')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as JobAssignmentRow[];
  if (rows.length === 0) return ok([]);

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = await client
    .from('user_profiles')
    .select('id, full_name')
    .in('id', userIds);
  if (profilesError) return err(ErrorCode.DB_ERROR, profilesError.message);

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return ok(
    rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      userId: row.user_id,
      displayName: nameByUserId.get(row.user_id) ?? 'Unknown',
      isLead: row.is_lead,
      assignedAt: row.created_at,
    }))
  );
}

/**
 * Every job a given team member is currently assigned to, most-recently-
 * assigned first (created_at desc, id asc as a tiebreaker). Feeds Team
 * Member Detail's "assigned jobs" section. The `jobs!...` embed is valid
 * here (unlike listJobAssignments' user_profiles case) — job_assignments
 * has a real, direct FK to jobs(id).
 */
export async function listMemberJobAssignments(
  client: DbClient,
  args: { orgId: string; userId: string }
): Promise<Result<MemberJobAssignment[]>> {
  const { data, error } = await untyped(client)
    .from('job_assignments')
    .select('id, job_id, is_lead, created_at, jobs!job_assignments_job_id_fkey(title, status, job_number)')
    .eq('org_id', args.orgId)
    .eq('user_id', args.userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as unknown as Array<
    JobAssignmentRow & { jobs: { title: string; status: string; job_number: string | null } | null }
  >;

  return ok(
    rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      jobTitle: row.jobs?.title ?? 'Untitled job',
      jobStatus: row.jobs?.status ?? 'unknown',
      jobNumber: row.jobs?.job_number ?? null,
      isLead: row.is_lead,
      assignedAt: row.created_at,
    }))
  );
}

export interface JobCrewRow {
  jobId: string;
  userId: string;
  displayName: string;
  isLead: boolean;
}

/**
 * Every crew member (not just the lead) for a batch of jobs — additive
 * sibling to listJobLeadsForJobs, needed by Route Planning's crew filter
 * (Phase 9: jobs filtered via the full job_assignments roster, not just the
 * lead) and the route stop's full crew display. Same two-step fetch and
 * untyped() escape as the rest of this file.
 */
export async function listJobAssignmentsForJobs(
  client: DbClient,
  args: { orgId: string; jobIds: string[] }
): Promise<Result<JobCrewRow[]>> {
  if (args.jobIds.length === 0) return ok([]);

  const { data, error } = await untyped(client)
    .from('job_assignments')
    .select('job_id, user_id, is_lead')
    .eq('org_id', args.orgId)
    .in('job_id', args.jobIds);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as Array<{ job_id: string; user_id: string; is_lead: boolean }>;
  if (rows.length === 0) return ok([]);

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = await client.from('user_profiles').select('id, full_name').in('id', userIds);
  if (profilesError) return err(ErrorCode.DB_ERROR, profilesError.message);

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return ok(
    rows.map((row) => ({
      jobId: row.job_id,
      userId: row.user_id,
      displayName: nameByUserId.get(row.user_id) ?? 'Unknown',
      isLead: row.is_lead,
    }))
  );
}

export interface JobLeadRow {
  jobId: string;
  userId: string;
  displayName: string;
}

/**
 * Real per-job lead technician for a batch of jobs — backs the Jobs list
 * page's "Lead technician" column and Calendar's per-event technician,
 * matching listJobAssignments' two-step fetch pattern (no direct FK from
 * job_assignments to user_profiles for PostgREST to embed through). Uses
 * the same untyped() escape as the rest of this file (see the file-level
 * TEMPORARY TYPING NOTE) so callers never need their own `.from('job_
 * assignments')` cast.
 */
export async function listJobLeadsForJobs(
  client: DbClient,
  args: { orgId: string; jobIds: string[] }
): Promise<Result<JobLeadRow[]>> {
  if (args.jobIds.length === 0) return ok([]);

  const { data, error } = await untyped(client)
    .from('job_assignments')
    .select('job_id, user_id')
    .eq('org_id', args.orgId)
    .eq('is_lead', true)
    .in('job_id', args.jobIds);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as Array<{ job_id: string; user_id: string }>;
  if (rows.length === 0) return ok([]);

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = await client.from('user_profiles').select('id, full_name').in('id', userIds);
  if (profilesError) return err(ErrorCode.DB_ERROR, profilesError.message);

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return ok(
    rows.map((row) => ({
      jobId: row.job_id,
      userId: row.user_id,
      displayName: nameByUserId.get(row.user_id) ?? 'Unknown',
    }))
  );
}

/**
 * Assigns a team member to a job, optionally as lead. All authorization
 * (canScheduleJobs), org-membership, and duplicate-assignment checks are
 * re-enforced inside assign_member_to_job() itself — this wrapper does not
 * duplicate that logic, matching every other RPC-backed action in this
 * codebase (e.g. scheduleJob/scheduleSiteVisit).
 */
export async function assignMemberToJob(
  client: DbClient,
  args: { jobId: string; userId: string; isLead?: boolean }
): Promise<Result<{ assignmentId: string }>> {
  const { data, error } = await untyped(client).rpc('assign_member_to_job', {
    p_job_id: args.jobId,
    p_user_id: args.userId,
    p_is_lead: args.isLead ?? false,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok({ assignmentId: data as string });
}

export async function removeMemberFromJob(
  client: DbClient,
  args: { jobId: string; userId: string }
): Promise<Result<null>> {
  const { error } = await untyped(client).rpc('remove_member_from_job', {
    p_job_id: args.jobId,
    p_user_id: args.userId,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

/** Promotes an already-assigned crew member to lead, clearing any previous lead. */
export async function setJobLead(client: DbClient, args: { jobId: string; userId: string }): Promise<Result<null>> {
  const { error } = await untyped(client).rpc('set_job_lead', {
    p_job_id: args.jobId,
    p_user_id: args.userId,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}
