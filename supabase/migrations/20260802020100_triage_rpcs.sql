-- Internal helper shared by record_request_triage and correct_request_triage
-- (both perform the identical "create the downstream row for this decision"
-- logic — factored out to avoid duplicating it). Not exposed to
-- `authenticated` directly.
create or replace function public._apply_triage_decision(
  p_request_id uuid,
  p_org_id uuid,
  p_decision text,
  p_actor_id uuid,
  p_authorization_type text,
  p_authorized_customer_contact text,
  p_authorized_at timestamptz,
  p_authorization_note text,
  p_not_to_exceed_amount numeric,
  p_authorization_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_property_id uuid;
  v_title text;
  v_new_estimate_id uuid;
  v_new_site_visit_id uuid;
  v_new_job_id uuid;
begin
  select * into v_request from public.service_requests where id = p_request_id and org_id = p_org_id;
  if v_request is null then
    raise exception 'Request not found in this organization';
  end if;

  v_property_id := v_request.property_id;
  if v_property_id is null then
    select property_id into v_property_id from public.customer_properties
    where customer_id = v_request.customer_id limit 1;
  end if;

  v_title := coalesce(v_request.service_category, v_request.service_title);

  if p_decision = 'remote_estimate' then
    if v_property_id is null then
      raise exception 'No property on file for this customer — add one before creating a remote estimate.';
    end if;

    insert into public.estimates (org_id, customer_id, property_id, service_request_id, title, description, status, created_by)
    values (p_org_id, v_request.customer_id, v_property_id, p_request_id, v_title, v_request.service_description, 'draft', p_actor_id)
    returning id into v_new_estimate_id;

    update public.service_requests
    set estimate_id = v_new_estimate_id, status = 'estimate_created', converted_at = now()
    where id = p_request_id;

  elsif p_decision = 'site_visit_required' then
    insert into public.site_visits (org_id, service_request_id, status, created_by)
    values (p_org_id, p_request_id, 'awaiting_scheduling', p_actor_id)
    returning id into v_new_site_visit_id;

    insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
    values (p_org_id, 'site_visit', v_new_site_visit_id, 'site_visit_requested', 'Site visit requested from service request.', p_actor_id,
            jsonb_build_object('service_request_id', p_request_id));

  elsif p_decision = 'direct_work_order' then
    if p_authorization_type is null then
      raise exception 'authorization_type is required for a direct work order';
    end if;
    if p_authorization_type in ('written_customer_authorization','verbal_customer_authorization')
       and (p_authorized_customer_contact is null or p_authorized_at is null) then
      raise exception 'authorized_customer_contact and authorized_at are required for %', p_authorization_type;
    end if;
    if p_authorization_type = 'verbal_customer_authorization' and p_authorization_note is null then
      raise exception 'authorization_note is required for verbal_customer_authorization';
    end if;
    if p_authorization_type = 'standing_agreement' and p_authorization_reference is null then
      raise exception 'authorization_reference is required for standing_agreement';
    end if;
    if v_property_id is null then
      raise exception 'No property on file for this customer — add one before creating a direct work order.';
    end if;

    insert into public.jobs (
      org_id, customer_id, property_id, title, description, status, created_by,
      authorization_type, authorized_customer_contact, authorized_at, authorization_note,
      not_to_exceed_amount, authorization_reference
    )
    values (
      p_org_id, v_request.customer_id, v_property_id, v_title, v_request.service_description, 'approved', p_actor_id,
      p_authorization_type, p_authorized_customer_contact, p_authorized_at, p_authorization_note,
      p_not_to_exceed_amount, p_authorization_reference
    )
    returning id into v_new_job_id;

    update public.service_requests
    set job_id = v_new_job_id, status = 'approved', converted_at = now()
    where id = p_request_id;

    insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
    values (p_org_id, 'job', v_new_job_id, 'direct_work_order_created', 'Job created directly from request without a quote.', p_actor_id,
            jsonb_build_object('service_request_id', p_request_id));
  else
    raise exception 'Unknown triage decision: %', p_decision;
  end if;

  return jsonb_build_object(
    'estimateId', v_new_estimate_id,
    'siteVisitId', v_new_site_visit_id,
    'jobId', v_new_job_id
  );
end;
$$;
revoke execute on function public._apply_triage_decision(uuid, uuid, text, uuid, text, text, timestamptz, text, numeric, text) from public;

create or replace function public.record_request_triage(
  p_request_id uuid,
  p_decision text,
  p_reason text,
  p_authorization_type text default null,
  p_authorized_customer_contact text default null,
  p_authorized_at timestamptz default null,
  p_authorization_note text default null,
  p_not_to_exceed_amount numeric default null,
  p_authorization_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role public.user_role;
  v_result jsonb;
begin
  select org_id into v_org_id from public.service_requests where id = p_request_id;
  if v_org_id is null then
    raise exception 'Request not found';
  end if;

  v_role := public.get_actor_org_role(v_org_id);
  if v_role is null then
    raise exception 'Not an active member of this organization';
  end if;
  if not public.role_has_capability(v_role, 'canTriageRequests') then
    raise exception 'Role % does not have canTriageRequests', v_role;
  end if;
  if p_decision = 'direct_work_order' and not public.role_has_capability(v_role, 'canCreateDirectWorkOrder') then
    raise exception 'Role % does not have canCreateDirectWorkOrder', v_role;
  end if;
  if p_decision not in ('remote_estimate','site_visit_required','direct_work_order') then
    raise exception 'Invalid triage decision: %', p_decision;
  end if;
  if p_decision = 'direct_work_order' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'A reason is required for a direct work order';
  end if;

  if exists (select 1 from public.service_requests where id = p_request_id and triage_decision is not null) then
    raise exception 'This request has already been triaged — use correct_request_triage to change it';
  end if;

  v_result := public._apply_triage_decision(
    p_request_id, v_org_id, p_decision, auth.uid(),
    p_authorization_type, p_authorized_customer_contact, p_authorized_at,
    p_authorization_note, p_not_to_exceed_amount, p_authorization_reference
  );

  update public.service_requests
  set triage_decision = p_decision, triage_reason = p_reason, triaged_by = auth.uid(), triaged_at = now()
  where id = p_request_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_org_id, 'service_request', p_request_id, 'triage_decision_recorded',
          format('Triaged as %s.%s', p_decision, case when p_reason is not null then ' Reason: ' || p_reason else '' end),
          auth.uid(), jsonb_build_object('service_request_id', p_request_id));

  return v_result;
end;
$$;

create or replace function public.correct_request_triage(
  p_request_id uuid,
  p_new_decision text,
  p_reason text,
  p_authorization_type text default null,
  p_authorized_customer_contact text default null,
  p_authorized_at timestamptz default null,
  p_authorization_note text default null,
  p_not_to_exceed_amount numeric default null,
  p_authorization_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role public.user_role;
  v_request record;
  v_estimate record;
  v_site_visit record;
  v_job record;
  v_result jsonb;
begin
  select * into v_request from public.service_requests where id = p_request_id;
  if v_request is null then raise exception 'Request not found'; end if;
  v_org_id := v_request.org_id;

  v_role := public.get_actor_org_role(v_org_id);
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Only owner/admin may correct a triage decision';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to correct a triage decision';
  end if;
  if v_request.triage_decision is null then
    raise exception 'This request has not been triaged yet';
  end if;

  if v_request.triage_decision = 'remote_estimate' then
    select * into v_estimate from public.estimates where service_request_id = p_request_id;
    if v_estimate is not null then
      if v_estimate.pricing_reviewed_at is not null
         or exists (select 1 from public.quotes where estimate_id = v_estimate.id and status != 'declined') then
        raise exception 'Cannot correct: pricing has been approved or a quote already exists for this estimate';
      end if;
      delete from public.estimate_line_items where estimate_id = v_estimate.id;
      delete from public.estimates where id = v_estimate.id;
    end if;

  elsif v_request.triage_decision = 'site_visit_required' then
    select * into v_site_visit from public.site_visits where service_request_id = p_request_id;
    if v_site_visit is not null then
      if not (v_site_visit.status = 'awaiting_scheduling'
              or (v_site_visit.status = 'scheduled' and v_site_visit.inspection_responses is null and v_site_visit.started_at is null)) then
        raise exception 'Cannot correct: this site visit has already been started or has findings recorded';
      end if;
      delete from public.site_visit_appointments where site_visit_id = v_site_visit.id;
      delete from public.site_visits where id = v_site_visit.id;
    end if;

  elsif v_request.triage_decision = 'direct_work_order' then
    select * into v_job from public.jobs where id = v_request.job_id;
    if v_job is not null then
      if v_job.scheduled_start is not null
         or exists (select 1 from public.job_deposits where job_id = v_job.id)
         or exists (select 1 from public.invoices where job_id = v_job.id)
         or exists (select 1 from public.payments p join public.invoices i on i.id = p.invoice_id where i.job_id = v_job.id) then
        raise exception 'Cannot correct: this job already has scheduling, deposit, invoice, or payment activity';
      end if;
      delete from public.jobs where id = v_job.id;
    end if;
  end if;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_org_id, 'service_request', p_request_id, 'triage_decision_corrected',
          format('Triage corrected from %s to %s. Reason: %s', v_request.triage_decision, p_new_decision, p_reason),
          auth.uid(), jsonb_build_object('service_request_id', p_request_id));

  update public.service_requests
  set triage_corrected_from = triage_decision, triage_corrected_at = now(), triage_corrected_by = auth.uid(),
      triage_correction_reason = p_reason,
      triage_decision = null, triage_reason = null, triaged_by = null, triaged_at = null,
      estimate_id = null, job_id = null
  where id = p_request_id;

  v_result := public._apply_triage_decision(
    p_request_id, v_org_id, p_new_decision, auth.uid(),
    p_authorization_type, p_authorized_customer_contact, p_authorized_at,
    p_authorization_note, p_not_to_exceed_amount, p_authorization_reference
  );

  update public.service_requests
  set triage_decision = p_new_decision, triage_reason = p_reason, triaged_by = auth.uid(), triaged_at = now()
  where id = p_request_id;

  return v_result;
end;
$$;

grant execute on function public.record_request_triage(uuid, text, text, text, text, timestamptz, text, numeric, text) to authenticated;
grant execute on function public.correct_request_triage(uuid, text, text, text, text, timestamptz, text, numeric, text) to authenticated;
