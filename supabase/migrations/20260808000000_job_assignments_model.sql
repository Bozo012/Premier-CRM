-- First-class job-crew assignment. Designed after an audit
-- (design/job-crew-assignment-model) found NO existing table represents
-- "which staff are assigned to this job": jobs has no assignee column at
-- all; site_visit_appointments.assigned_user_id is single-person and scoped
-- to a site-visit *appointment*, not a job; team_member_availability is a
-- status/skills row, not an assignment; scheduling_slots/bookings is
-- customer-portal capacity booking, unrelated. This closes that gap with a
-- new, additive-only table — no existing table is repurposed, no destructive
-- change to jobs.
--
-- Reuses the existing 'canScheduleJobs' capability (packages/shared/
-- permissions.ts + role_has_capability()) rather than inventing a new one —
-- assigning/unassigning/leading a job's crew is a scheduling decision, the
-- same capability that already gates apply_job_scheduling.
--
-- Follows the same hardened pattern jobs/quotes were locked into
-- (20260803070000_harden_jobs_and_quote_creation_boundary.sql) rather than
-- team_member_availability's direct-RLS-write pattern: authenticated gets
-- SELECT only; every mutation goes through a SECURITY DEFINER RPC that
-- independently re-validates actor/org/capability/state (matching
-- 20260802020200_site_visit_lifecycle_rpcs.sql's style exactly) and writes
-- an activity_log entry, since job_assignments has no other audit trail and
-- direct-RLS writes can't also log to activity_log (which itself has no
-- authenticated INSERT policy, by design).

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_lead boolean not null default false,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No duplicate assignment of the same person to the same job.
  unique (job_id, user_id),
  -- Structurally enforces the assigned user is actually an org member of
  -- the same org the job belongs to — same composite-FK pattern
  -- team_member_availability uses against org_members(org_id, user_id).
  foreign key (org_id, user_id)
    references public.org_members (org_id, user_id)
    on delete cascade
);

-- At most one lead per job — same partial-unique-index pattern
-- site_visit_appointments uses to enforce "at most one active appointment".
create unique index job_assignments_one_lead_per_job
  on public.job_assignments (job_id)
  where is_lead = true;

create index job_assignments_org_job_idx on public.job_assignments (org_id, job_id);
create index job_assignments_user_idx on public.job_assignments (user_id);

create trigger job_assignments_updated_at
  before update on public.job_assignments
  for each row execute function public.set_updated_at();

alter table public.job_assignments enable row level security;

-- Any active org member can see who's assigned to a job in their org —
-- matches jobs_select_org_members / activity_log's own SELECT policy.
-- Viewing crew assignments is not privileged; changing them is.
create policy "job_assignments_select_org_members" on public.job_assignments
  for select using (public.user_is_in_org(org_id));

-- No INSERT/UPDATE/DELETE policy and no table grant for `authenticated` —
-- every mutation goes through the three RPCs below, each independently
-- re-checking canScheduleJobs. Matches the jobs/quotes hardening precedent:
-- hiding the button is not sufficient, the base table must not be directly
-- writable either.
grant select on public.job_assignments to authenticated;

-- ---------------------------------------------------------------------------
-- assign_member_to_job — adds one crew member to a job. Optionally makes
-- them lead (clearing any existing lead first, since at most one lead is
-- allowed per job — matches the unique partial index above).
-- ---------------------------------------------------------------------------
create or replace function public.assign_member_to_job(
  p_job_id uuid, p_user_id uuid, p_is_lead boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_role public.user_role;
  v_assignment_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job is null then raise exception 'Job not found'; end if;

  v_role := public.get_actor_org_role(v_job.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;

  if not exists (
    select 1 from public.org_members
    where org_id = v_job.org_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Target user is not an active member of this organization';
  end if;

  if exists (select 1 from public.job_assignments where job_id = p_job_id and user_id = p_user_id) then
    raise exception 'This person is already assigned to this job';
  end if;

  if p_is_lead then
    update public.job_assignments set is_lead = false, updated_at = now()
    where job_id = p_job_id and is_lead = true;
  end if;

  insert into public.job_assignments (org_id, job_id, user_id, is_lead, assigned_by)
  values (v_job.org_id, p_job_id, p_user_id, p_is_lead, auth.uid())
  returning id into v_assignment_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_job.org_id, 'job', p_job_id, 'job_crew_assigned',
          case when p_is_lead then 'Assigned as lead technician.' else 'Assigned to crew.' end,
          auth.uid(), jsonb_build_object('user_id', p_user_id, 'is_lead', p_is_lead));

  return v_assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_member_from_job — unassigns one crew member. If they were lead,
-- the job simply has no lead afterward (caller must explicitly set a new
-- one via set_job_lead — no automatic promotion, to avoid a surprising
-- silent leadership change).
-- ---------------------------------------------------------------------------
create or replace function public.remove_member_from_job(p_job_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_role public.user_role;
  v_deleted_count int;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job is null then raise exception 'Job not found'; end if;

  v_role := public.get_actor_org_role(v_job.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;

  delete from public.job_assignments where job_id = p_job_id and user_id = p_user_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'This person is not assigned to this job';
  end if;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_job.org_id, 'job', p_job_id, 'job_crew_removed', 'Removed from crew.',
          auth.uid(), jsonb_build_object('user_id', p_user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- set_job_lead — promotes an already-assigned crew member to lead,
-- atomically clearing any previous lead. Does NOT assign the person if
-- they aren't already on the job — call assign_member_to_job first (or
-- with p_is_lead := true directly).
-- ---------------------------------------------------------------------------
create or replace function public.set_job_lead(p_job_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_role public.user_role;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job is null then raise exception 'Job not found'; end if;

  v_role := public.get_actor_org_role(v_job.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;

  if not exists (select 1 from public.job_assignments where job_id = p_job_id and user_id = p_user_id) then
    raise exception 'This person must be assigned to the job before becoming lead';
  end if;

  update public.job_assignments set is_lead = false, updated_at = now()
  where job_id = p_job_id and is_lead = true and user_id != p_user_id;

  update public.job_assignments set is_lead = true, updated_at = now()
  where job_id = p_job_id and user_id = p_user_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_job.org_id, 'job', p_job_id, 'job_crew_lead_set', 'Set as lead technician.',
          auth.uid(), jsonb_build_object('user_id', p_user_id));
end;
$$;

grant execute on function public.assign_member_to_job(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_member_from_job(uuid, uuid) to authenticated;
grant execute on function public.set_job_lead(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
