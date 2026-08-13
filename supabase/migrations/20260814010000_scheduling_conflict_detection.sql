-- V1 scheduling reliability (docs/implementation/v1-known-gaps-audit.md §4;
-- product decision: warning + explicit override, not a hard block — no
-- existing DB-level uniqueness invariant governs a *person's* overlapping
-- work across jobs/site-visits today, unlike site_visit_appointments' own
-- "one active appointment per visit" partial-unique-index, so this does not
-- fabricate a hard constraint the business has never actually had).
--
-- Two gaps closed together because both concern the same authoritative
-- scheduling transaction boundary:
--   1. No real double-booking/scheduling-conflict detection anywhere.
--   2. createJobWithScheduleAction was a non-atomic 3-step sequence
--      (insert job -> optionally schedule -> optionally assign crew) that
--      could partially succeed, surfacing failures only as a `warning`
--      string with no rollback.
--
-- Audit finding worth recording here since it directly shaped this
-- migration: apply_job_scheduling (20260731160000_scheduling_and_portal_
-- boundary.sql) requires the job's CURRENT status to be exactly 'approved'
-- before it will schedule it. createJobWithScheduleAction's job insert
-- never set status, so it always defaulted to 'lead' — meaning
-- scheduling-at-creation was ALWAYS rejected by apply_job_scheduling
-- ("Only an approved (unscheduled) job can be scheduled (current
-- status=lead)"), silently swallowed into the `warning` string. This was a
-- real, live defect, not hypothetical. create_job_with_schedule below does
-- not reuse apply_job_scheduling for this reason — that RPC's precondition
-- is written for the quote-accepted pipeline (which legitimately starts
-- jobs at 'approved'), not this standalone "second door" creation path,
-- which has no approval milestone to pass through first. Reusing it here
-- would keep scheduling-at-creation permanently broken.

-- ============================================================================
-- get_scheduling_conflicts — the one centralized, reusable conflict query.
-- Checks a single person's assigned jobs AND site-visit appointments for
-- time overlap against a proposed window. Not merged with team_member_
-- availability (a distinct, separately-surfaced concept — general
-- availability vs. already-booked time).
--
-- Terminal/inactive statuses are excluded so finished or dead work never
-- blocks new scheduling: jobs — cancelled/completed/invoiced/paid; site
-- visits — anything other than status='scheduled' (site_visit_appointments
-- only ever has scheduled/cancelled/completed, and reschedule already
-- supersedes-and-replaces rather than mutating in place, so exactly one
-- 'scheduled' row per visit is ever live).
--
-- Duration derivation for jobs (jobs.scheduled_end is nullable, unlike
-- site_visit_appointments.scheduled_end which is NOT NULL + DB-checked):
-- effective end = scheduled_end, falling back to
-- scheduled_start + estimated_duration_minutes, falling back to
-- scheduled_start itself (a zero-length point) when neither is set — the
-- smallest honest model per the audit instruction, not a fabricated
-- default duration. A zero-length window only ever registers as a
-- conflict if the proposed window strictly contains that instant, which
-- is exactly what the standard overlap formula does with no special-casing.
-- ============================================================================

create or replace function public.get_scheduling_conflicts(
  p_org_id uuid,
  p_user_id uuid,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_exclude_job_id uuid default null,
  p_exclude_site_visit_appointment_id uuid default null
)
returns table (
  record_type text,
  record_id uuid,
  title text,
  conflict_start timestamptz,
  conflict_end timestamptz,
  customer_name text,
  property_address text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := public.get_actor_org_role(p_org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;
  if p_proposed_end <= p_proposed_start then
    raise exception 'Proposed end must be after proposed start.';
  end if;

  return query
  select
    'job'::text,
    j.id,
    j.title,
    j.scheduled_start,
    coalesce(j.scheduled_end, j.scheduled_start + (coalesce(j.estimated_duration_minutes, 0) * interval '1 minute')),
    coalesce(nullif(c.company_name, ''), nullif(c.display_name, ''), nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')),
    p.address_line_1
  from public.jobs j
  join public.job_assignments ja on ja.job_id = j.id and ja.user_id = p_user_id
  left join public.customers c on c.id = j.customer_id
  left join public.properties p on p.id = j.property_id
  where j.org_id = p_org_id
    and j.status not in ('cancelled', 'completed', 'invoiced', 'paid')
    and j.scheduled_start is not null
    and (p_exclude_job_id is null or j.id != p_exclude_job_id)
    and j.scheduled_start < p_proposed_end
    and coalesce(j.scheduled_end, j.scheduled_start + (coalesce(j.estimated_duration_minutes, 0) * interval '1 minute')) > p_proposed_start

  union all

  select
    'site_visit'::text,
    sva.id,
    coalesce(sr.service_category, sr.service_title),
    sva.scheduled_start,
    sva.scheduled_end,
    coalesce(nullif(c2.company_name, ''), nullif(c2.display_name, ''), nullif(trim(concat_ws(' ', c2.first_name, c2.last_name)), '')),
    sr.property_address_line_1
  from public.site_visit_appointments sva
  join public.site_visits sv on sv.id = sva.site_visit_id
  join public.service_requests sr on sr.id = sv.service_request_id
  left join public.customers c2 on c2.id = sr.customer_id
  where sva.org_id = p_org_id
    and sva.assigned_user_id = p_user_id
    and sva.status = 'scheduled'
    and (p_exclude_site_visit_appointment_id is null or sva.id != p_exclude_site_visit_appointment_id)
    and sva.scheduled_start < p_proposed_end
    and sva.scheduled_end > p_proposed_start

  order by 4;
end;
$$;

revoke all on function public.get_scheduling_conflicts(uuid, uuid, timestamptz, timestamptz, uuid, uuid) from public;
grant execute on function public.get_scheduling_conflicts(uuid, uuid, timestamptz, timestamptz, uuid, uuid) to authenticated;

-- ============================================================================
-- create_job_with_schedule — the single transactional replacement for
-- createJobWithScheduleAction's old 3-step sequence. Base job creation
-- keeps the same authority as before (any active org member — matches
-- createStandaloneJobAction, unchanged); scheduling and crew assignment
-- both still require canScheduleJobs, re-checked here rather than trusted
-- from the caller, matching every other scheduling RPC's own-boundary
-- discipline.
--
-- Warning + explicit override, not a hard block: if any proposed crew
-- member has a conflict and p_override_conflicts is not true, the whole
-- function raises and the transaction rolls back before any row is
-- written — the app layer is expected to have already shown the conflict
-- list (via get_scheduling_conflicts) and obtained confirmation before
-- calling this with p_override_conflicts := true. The conflict check is
-- re-run here, inside the same transaction, immediately before any write —
-- not merely trusted from a separate, possibly-stale UI pre-check — so two
-- concurrent scheduling attempts cannot both proceed on stale information.
-- Once override is given, though, this function does not re-block on
-- whatever the live conflict set happens to be at that moment — that is
-- the nature of a warning model, not a hard invariant; it is recorded via
-- a dedicated activity_log event, never silently allowed through.
-- ============================================================================

create or replace function public.create_job_with_schedule(
  p_customer_id uuid,
  p_property_id uuid,
  p_title text,
  p_description text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_crew_user_ids uuid[] default '{}',
  p_lead_user_id uuid default null,
  p_override_conflicts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role public.user_role;
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_has_schedule boolean := p_scheduled_start is not null;
  v_has_crew boolean := p_crew_user_ids is not null and array_length(p_crew_user_ids, 1) > 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_member uuid;
  v_linked_request_id uuid;
  v_effective_end timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication required.';
  end if;

  select c.org_id into v_org_id from public.customers c where c.id = p_customer_id;
  if v_org_id is null then
    raise exception 'Customer not found.';
  end if;

  v_role := public.get_actor_org_role(v_org_id);
  if v_role is null then
    raise exception 'Not an active member of this organization.';
  end if;

  if v_title = '' then
    raise exception 'A title is required.';
  end if;

  if not exists (
    select 1 from public.customer_properties cp
    where cp.customer_id = p_customer_id and cp.property_id = p_property_id
  ) then
    raise exception 'The selected property is not linked to this customer.';
  end if;

  if p_scheduled_end is not null and p_scheduled_end <= p_scheduled_start then
    raise exception 'Scheduled end must be after scheduled start.';
  end if;

  if p_lead_user_id is not null and not (p_lead_user_id = any(p_crew_user_ids)) then
    raise exception 'Lead must be one of the assigned crew members.';
  end if;

  -- Scheduling/crew assignment require canScheduleJobs; base job creation
  -- does not (matches createStandaloneJobAction's existing, unchanged
  -- authority for a bare job with no schedule/crew).
  if (v_has_schedule or v_has_crew) and not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;

  if v_has_crew then
    foreach v_member in array p_crew_user_ids loop
      if not exists (
        select 1 from public.org_members om
        where om.org_id = v_org_id and om.user_id = v_member and om.status = 'active'
      ) then
        raise exception 'Crew member is not an active member of this organization.';
      end if;
    end loop;
  end if;

  -- Conflict check — before any write. Only meaningful with both a
  -- proposed window and at least one crew member.
  if v_has_schedule and v_has_crew and not p_override_conflicts then
    v_effective_end := coalesce(p_scheduled_end, p_scheduled_start + interval '1 hour');
    select coalesce(jsonb_agg(to_jsonb(gc)), '[]'::jsonb) into v_conflicts
    from unnest(p_crew_user_ids) as crew_member
    cross join lateral public.get_scheduling_conflicts(
      v_org_id, crew_member, p_scheduled_start, v_effective_end
    ) as gc;

    if jsonb_array_length(v_conflicts) > 0 then
      raise exception 'SCHEDULING_CONFLICT:%', v_conflicts::text;
    end if;
  end if;

  -- Job creation. Status goes straight to 'scheduled' when a schedule is
  -- supplied — see the migration-level comment above for why this does
  -- not go through apply_job_scheduling's 'approved'-only precondition.
  insert into public.jobs (
    org_id, customer_id, property_id, title, description, created_by,
    status, scheduled_start, scheduled_end
  ) values (
    v_org_id, p_customer_id, p_property_id, v_title, v_description, v_actor,
    (case when v_has_schedule then 'scheduled' else 'lead' end)::public.job_status,
    p_scheduled_start, p_scheduled_end
  )
  returning * into v_job;

  if v_has_schedule then
    select id into v_linked_request_id from public.service_requests
    where job_id = v_job.id and org_id = v_org_id;
    if v_linked_request_id is not null then
      update public.service_requests set status = 'scheduled' where id = v_linked_request_id;
    end if;

    -- Mirrors apply_job_scheduling's own working-invoice activation —
    -- scheduling and working-invoice activation happen together
    -- everywhere else in this codebase; this path keeps that invariant.
    insert into public.invoices (org_id, job_id, kind, status, title)
    values (v_org_id, v_job.id, 'working', 'draft', 'Working invoice');

    insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
    values (v_org_id, 'job', v_job.id, 'job_scheduled', format('Job scheduled for %s.', p_scheduled_start), v_actor);
  end if;

  if v_has_crew then
    foreach v_member in array p_crew_user_ids loop
      insert into public.job_assignments (org_id, job_id, user_id, is_lead, assigned_by)
      values (v_org_id, v_job.id, v_member, coalesce(v_member = p_lead_user_id, false), v_actor);

      insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
      values (
        v_org_id, 'job', v_job.id,
        case when v_member = p_lead_user_id then 'job_crew_assigned_lead' else 'job_crew_assigned' end,
        case when v_member = p_lead_user_id then 'Assigned as lead technician.' else 'Assigned to crew.' end,
        v_actor, jsonb_build_object('user_id', v_member)
      );
    end loop;

    if p_override_conflicts and v_has_schedule then
      insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
      values (v_org_id, 'job', v_job.id, 'job_scheduling_conflict_overridden',
              'Staff confirmed scheduling despite an overlap warning.', v_actor);
    end if;
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'scheduled', v_has_schedule,
    'crewAssignedCount', coalesce(array_length(p_crew_user_ids, 1), 0)
  );
end;
$$;

revoke all on function public.create_job_with_schedule(uuid, uuid, text, text, timestamptz, timestamptz, uuid[], uuid, boolean) from public;
grant execute on function public.create_job_with_schedule(uuid, uuid, text, text, timestamptz, timestamptz, uuid[], uuid, boolean) to authenticated;
