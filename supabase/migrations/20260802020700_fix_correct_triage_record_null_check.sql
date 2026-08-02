-- Real bug found by E2E testing: `IS NOT NULL` on a `record` variable is a
-- row-wise test that requires EVERY field to be non-null, not "was a row
-- found." site_visits/estimates/jobs rows always have several legitimately
-- nullable columns (started_at, cancellation_reason, etc.), so
-- `v_site_visit IS NOT NULL` silently evaluated false even when a row
-- existed — the old-downstream-row cleanup inside a triage correction never
-- actually ran. Fixed by testing the primary key column specifically
-- (`.id IS NOT NULL`), which is reliably non-null exactly when a row was
-- found and null exactly when it wasn't — no `record`-null-test pitfall.
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
    if v_estimate.id is not null then
      if v_estimate.pricing_reviewed_at is not null
         or exists (select 1 from public.quotes where estimate_id = v_estimate.id and status != 'declined') then
        raise exception 'Cannot correct: pricing has been approved or a quote already exists for this estimate';
      end if;
      delete from public.estimate_line_items where estimate_id = v_estimate.id;
      delete from public.estimates where id = v_estimate.id;
    end if;

  elsif v_request.triage_decision = 'site_visit_required' then
    select * into v_site_visit from public.site_visits where service_request_id = p_request_id;
    if v_site_visit.id is not null then
      if not (v_site_visit.status = 'awaiting_scheduling'
              or (v_site_visit.status = 'scheduled' and v_site_visit.inspection_responses is null and v_site_visit.started_at is null)) then
        raise exception 'Cannot correct: this site visit has already been started or has findings recorded';
      end if;
      delete from public.site_visit_appointments where site_visit_id = v_site_visit.id;
      delete from public.site_visits where id = v_site_visit.id;
    end if;

  elsif v_request.triage_decision = 'direct_work_order' then
    select * into v_job from public.jobs where id = v_request.job_id;
    if v_job.id is not null then
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
