-- Bug fix found during golden-path verification: _apply_triage_decision()
-- never bound a template version to a newly-created site_visits row, so
-- save_site_visit_inspection() always failed with "no valid inspection
-- template version bound". Bind the org's own active published template if
-- one exists, otherwise the platform default, at visit-creation time (set
-- once, never updated for the life of the visit — matches the approved
-- template-versioning design).
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
  v_template_version_id uuid;
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
    -- Prefer this org's own published template; fall back to the platform default.
    select itv.id into v_template_version_id
    from public.inspection_template_versions itv
    join public.inspection_templates it on it.id = itv.inspection_template_id
    where itv.publication_status = 'published' and it.org_id = p_org_id
    order by itv.version desc limit 1;

    if v_template_version_id is null then
      select itv.id into v_template_version_id
      from public.inspection_template_versions itv
      join public.inspection_templates it on it.id = itv.inspection_template_id
      where itv.publication_status = 'published' and it.org_id is null
      order by itv.version desc limit 1;
    end if;

    insert into public.site_visits (org_id, service_request_id, status, created_by, inspection_template_version_id)
    values (p_org_id, p_request_id, 'awaiting_scheduling', p_actor_id, v_template_version_id)
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
