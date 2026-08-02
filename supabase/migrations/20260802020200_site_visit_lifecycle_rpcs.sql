-- Site-visit scheduling and lifecycle RPCs. Every function independently
-- validates: authenticated actor, active org membership, capability, entity
-- org ownership, current state, and required fields. The BEFORE UPDATE
-- trigger from the site_visits/site_visit_appointments migrations remains
-- active as defense-in-depth underneath every one of these.

create or replace function public.schedule_site_visit(
  p_site_visit_id uuid, p_start timestamptz, p_end timestamptz, p_assigned_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
  v_appointment_id uuid;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;
  if v_visit.status != 'awaiting_scheduling' then
    raise exception 'Site visit must be awaiting_scheduling to schedule (current: %)', v_visit.status;
  end if;
  if p_end <= p_start then raise exception 'scheduled_end must be after scheduled_start'; end if;

  insert into public.site_visit_appointments (org_id, site_visit_id, scheduled_start, scheduled_end, assigned_user_id, status, created_by)
  values (v_visit.org_id, p_site_visit_id, p_start, p_end, p_assigned_user_id, 'scheduled', auth.uid())
  returning id into v_appointment_id;

  update public.site_visits set status = 'scheduled', assigned_user_id = coalesce(p_assigned_user_id, assigned_user_id), updated_at = now()
  where id = p_site_visit_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_scheduled',
          format('Scheduled for %s - %s', p_start, p_end), auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id, 'appointment_id', v_appointment_id));

  return v_appointment_id;
end;
$$;

create or replace function public.reschedule_site_visit(
  p_site_visit_id uuid, p_start timestamptz, p_end timestamptz, p_assigned_user_id uuid default null, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
  v_old_appointment record;
  v_new_appointment_id uuid;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;
  if v_visit.status != 'scheduled' then
    raise exception 'Site visit must be scheduled to reschedule (current: %)', v_visit.status;
  end if;
  if p_end <= p_start then raise exception 'scheduled_end must be after scheduled_start'; end if;

  select * into v_old_appointment from public.site_visit_appointments
  where site_visit_id = p_site_visit_id and status = 'scheduled';
  if v_old_appointment is null then raise exception 'No active appointment to reschedule'; end if;

  update public.site_visit_appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = coalesce(p_reason, 'rescheduled')
  where id = v_old_appointment.id;

  insert into public.site_visit_appointments (org_id, site_visit_id, scheduled_start, scheduled_end, assigned_user_id, status, created_by, supersedes_appointment_id)
  values (v_visit.org_id, p_site_visit_id, p_start, p_end, coalesce(p_assigned_user_id, v_old_appointment.assigned_user_id), 'scheduled', auth.uid(), v_old_appointment.id)
  returning id into v_new_appointment_id;

  update public.site_visits set assigned_user_id = coalesce(p_assigned_user_id, assigned_user_id), updated_at = now() where id = p_site_visit_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_rescheduled',
          format('Rescheduled from %s-%s to %s-%s', v_old_appointment.scheduled_start, v_old_appointment.scheduled_end, p_start, p_end),
          auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id, 'appointment_id', v_new_appointment_id, 'superseded_appointment_id', v_old_appointment.id));

  return v_new_appointment_id;
end;
$$;

create or replace function public.cancel_site_visit_appointment(p_appointment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt record;
  v_visit record;
  v_role public.user_role;
begin
  select * into v_appt from public.site_visit_appointments where id = p_appointment_id;
  if v_appt is null then raise exception 'Appointment not found'; end if;
  select * into v_visit from public.site_visits where id = v_appt.site_visit_id;

  v_role := public.get_actor_org_role(v_appt.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;
  if v_appt.status != 'scheduled' then
    return; -- idempotent no-op
  end if;

  update public.site_visit_appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason
  where id = p_appointment_id;

  update public.site_visits set status = 'awaiting_scheduling', updated_at = now()
  where id = v_appt.site_visit_id and status = 'scheduled';
end;
$$;

create or replace function public.cancel_site_visit(p_site_visit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canScheduleJobs') then
    raise exception 'Role does not have canScheduleJobs';
  end if;
  if v_visit.status = 'cancelled' then return; end if; -- idempotent no-op
  if v_visit.status not in ('awaiting_scheduling','scheduled') then
    raise exception 'Cannot cancel a site visit in status %', v_visit.status;
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to cancel a site visit';
  end if;

  update public.site_visit_appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason
  where site_visit_id = p_site_visit_id and status = 'scheduled';

  update public.site_visits
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason, updated_at = now()
  where id = p_site_visit_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_cancelled', p_reason, auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id));
end;
$$;

create or replace function public.start_site_visit(p_site_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null then raise exception 'Not an active member of this organization'; end if;
  if not (public.role_has_capability(v_role, 'canScheduleJobs') or v_visit.assigned_user_id = auth.uid()) then
    raise exception 'Not authorized to start this site visit';
  end if;
  if v_visit.status != 'scheduled' then
    raise exception 'Site visit must be scheduled to start (current: %)', v_visit.status;
  end if;

  update public.site_visits
  set status = 'in_progress', started_at = now(), started_by = auth.uid(),
      assigned_user_id = coalesce(assigned_user_id, auth.uid()), updated_at = now()
  where id = p_site_visit_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_started', 'Site visit started.', auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id));
end;
$$;

create or replace function public.undo_site_visit_start(p_site_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null then raise exception 'Not an active member of this organization'; end if;
  if not (public.role_has_capability(v_role, 'canScheduleJobs') or v_visit.assigned_user_id = auth.uid()) then
    raise exception 'Not authorized to undo the start of this site visit';
  end if;
  if v_visit.status = 'scheduled' then return; end if; -- idempotent no-op
  if v_visit.status != 'in_progress' then
    raise exception 'Site visit is not in_progress (current: %)', v_visit.status;
  end if;
  if v_visit.inspection_responses is not null then
    raise exception 'Cannot undo start: inspection findings have already been saved — complete or cancel instead';
  end if;

  update public.site_visits
  set status = 'scheduled', started_at = null, started_by = null, updated_at = now()
  where id = p_site_visit_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_start_undone', 'Accidental start undone.', auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id));
end;
$$;

create or replace function public.complete_site_visit(p_site_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canEditEstimate') then
    raise exception 'Role does not have canEditEstimate';
  end if;
  if v_visit.status = 'completed' then return; end if; -- idempotent no-op
  if v_visit.status != 'in_progress' then
    raise exception 'Site visit must be in_progress to complete (current: %)', v_visit.status;
  end if;

  update public.site_visits
  set status = 'completed', completed_at = now(), completed_by = auth.uid(), updated_at = now()
  where id = p_site_visit_id;

  update public.site_visit_appointments set status = 'completed'
  where site_visit_id = p_site_visit_id and status = 'scheduled';

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'site_visit', p_site_visit_id, 'site_visit_completed', 'Site visit completed.', auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id));
end;
$$;

-- Trusted, server-action-only save path (see the Storage/inspection
-- validation boundary decision): full template-aware Zod validation happens
-- in the Next.js server action before this is ever called; this function
-- performs only the coarse, DB-appropriate checks. EXECUTE is revoked from
-- `authenticated` below — only service_role (i.e. the server action) can
-- call it, since a malformed-but-size-valid JSON payload could otherwise
-- bypass full validation via a direct client call.
create or replace function public.save_site_visit_inspection(p_site_visit_id uuid, p_responses_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id;
  if v_visit is null then raise exception 'Site visit not found'; end if;
  if v_visit.status != 'in_progress' then
    raise exception 'Site visit must be in_progress to save findings (current: %)', v_visit.status;
  end if;
  if jsonb_typeof(p_responses_patch) != 'object' then
    raise exception 'responses_patch must be a JSON object';
  end if;
  if pg_column_size(p_responses_patch) > 1048576 then
    raise exception 'responses_patch exceeds the maximum allowed size';
  end if;
  if v_visit.inspection_template_version_id is null
     or not exists (select 1 from public.inspection_template_versions where id = v_visit.inspection_template_version_id) then
    raise exception 'Site visit has no valid inspection template version bound';
  end if;

  update public.site_visits
  set inspection_responses = coalesce(inspection_responses, '{}'::jsonb) || p_responses_patch,
      response_schema_version = (select response_schema_version from public.inspection_template_versions where id = v_visit.inspection_template_version_id),
      updated_at = now()
  where id = p_site_visit_id;
end;
$$;
revoke execute on function public.save_site_visit_inspection(uuid, jsonb) from public;
revoke execute on function public.save_site_visit_inspection(uuid, jsonb) from authenticated;
-- Revoking from PUBLIC also strips service_role's implicit access (PUBLIC is
-- the base every role inherits from) — grant it back explicitly, since the
-- server action calls this RPC using the service-role client, not the end
-- user's JWT.
grant execute on function public.save_site_visit_inspection(uuid, jsonb) to service_role;

grant execute on function public.schedule_site_visit(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.reschedule_site_visit(uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.cancel_site_visit_appointment(uuid, text) to authenticated;
grant execute on function public.cancel_site_visit(uuid, text) to authenticated;
grant execute on function public.start_site_visit(uuid) to authenticated;
grant execute on function public.undo_site_visit_start(uuid) to authenticated;
grant execute on function public.complete_site_visit(uuid) to authenticated;
