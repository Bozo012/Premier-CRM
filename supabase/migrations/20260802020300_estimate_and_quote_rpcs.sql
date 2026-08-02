create or replace function public.generate_estimate_from_site_visit(p_site_visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit record;
  v_role public.user_role;
  v_request record;
  v_existing_estimate_id uuid;
  v_new_estimate_id uuid;
  v_field jsonb;
  v_fields jsonb;
  v_qty jsonb;
  v_mat jsonb;
  v_description text := '';
begin
  select * into v_visit from public.site_visits where id = p_site_visit_id for update;
  if v_visit is null then raise exception 'Site visit not found'; end if;

  v_role := public.get_actor_org_role(v_visit.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canEditEstimate') then
    raise exception 'Role does not have canEditEstimate';
  end if;
  if v_visit.status != 'completed' then
    raise exception 'Site visit must be completed before generating an estimate (current: %)', v_visit.status;
  end if;

  -- Idempotency: look up by the inverse relationship (no generated_estimate_id
  -- column exists on site_visits — estimates.source_site_visit_id is the sole
  -- link, per the approved correction).
  select id into v_existing_estimate_id from public.estimates where source_site_visit_id = p_site_visit_id;
  if v_existing_estimate_id is not null then
    return v_existing_estimate_id;
  end if;

  select * into v_request from public.service_requests where id = v_visit.service_request_id;
  if v_request is null then raise exception 'Source service request not found'; end if;

  v_fields := (select field_definitions from public.inspection_template_versions where id = v_visit.inspection_template_version_id);

  -- Synthesize a human-readable description from every description_text-mapped field.
  for v_field in select * from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb))
  loop
    if v_field->>'estimateMappingHint' = 'description_text' then
      declare v_val text := v_visit.inspection_responses ->> (v_field->>'key');
      begin
        if v_val is not null and length(trim(v_val)) > 0 then
          v_description := v_description || (v_field->>'label') || ': ' || v_val || E'\n\n';
        end if;
      end;
    end if;
  end loop;

  begin
    insert into public.estimates (org_id, customer_id, property_id, service_request_id, source_site_visit_id, title, description, status, created_by)
    values (
      v_visit.org_id, v_request.customer_id, v_request.property_id, v_visit.service_request_id, p_site_visit_id,
      coalesce(v_request.service_category, v_request.service_title), nullif(trim(v_description), ''), 'draft', auth.uid()
    )
    returning id into v_new_estimate_id;
  exception when unique_violation then
    -- Lost a concurrent race to another call — the other transaction's row is authoritative.
    select id into v_new_estimate_id from public.estimates where source_site_visit_id = p_site_visit_id;
    return v_new_estimate_id;
  end;

  -- Suggested line items from quantity/material fields, all system-suggested.
  for v_qty in select * from jsonb_array_elements(coalesce(v_visit.inspection_responses -> 'quantities', '[]'::jsonb))
  loop
    insert into public.estimate_line_items (org_id, estimate_id, description, quantity, unit_price, is_system_suggested)
    values (v_visit.org_id, v_new_estimate_id, coalesce(v_qty->>'item', 'Item'), coalesce((v_qty->>'quantity')::numeric, 1), 0, true);
  end loop;

  for v_mat in select * from jsonb_array_elements(coalesce(v_visit.inspection_responses -> 'materialsNeeded', '[]'::jsonb))
  loop
    insert into public.estimate_line_items (org_id, estimate_id, description, quantity, unit_price, is_system_suggested)
    values (v_visit.org_id, v_new_estimate_id, coalesce(v_mat->>'material', 'Material'), 1, 0, true);
  end loop;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_visit.org_id, 'estimate', v_new_estimate_id, 'estimate_generated_from_site_visit', 'Draft estimate generated from completed site visit.', auth.uid(),
          jsonb_build_object('service_request_id', v_visit.service_request_id, 'site_visit_id', p_site_visit_id));

  return v_new_estimate_id;
end;
$$;

create or replace function public.approve_estimate_pricing(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
  v_role public.user_role;
begin
  select * into v_estimate from public.estimates where id = p_estimate_id;
  if v_estimate is null then raise exception 'Estimate not found'; end if;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canApproveEstimatePricing') then
    raise exception 'Role does not have canApproveEstimatePricing';
  end if;
  if v_estimate.pricing_reviewed_at is not null then
    return; -- idempotent no-op
  end if;
  if not exists (select 1 from public.estimate_line_items where estimate_id = p_estimate_id) then
    raise exception 'Cannot approve pricing with zero line items';
  end if;

  update public.estimates set pricing_reviewed_at = now(), pricing_reviewed_by = auth.uid() where id = p_estimate_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_approved', 'Estimate pricing approved.', auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
end;
$$;

create or replace function public.reopen_estimate_for_edit(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
  v_role public.user_role;
begin
  select * into v_estimate from public.estimates where id = p_estimate_id;
  if v_estimate is null then raise exception 'Estimate not found'; end if;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canApproveEstimatePricing') then
    raise exception 'Role does not have canApproveEstimatePricing';
  end if;
  if v_estimate.pricing_reviewed_at is null then
    return; -- idempotent no-op
  end if;
  if exists (select 1 from public.quotes where estimate_id = p_estimate_id and status != 'declined') then
    raise exception 'Cannot reopen: an active quote already exists for this estimate';
  end if;

  update public.estimates set pricing_reviewed_at = null, pricing_reviewed_by = null where id = p_estimate_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_reopened', 'Estimate pricing approval reopened for edit.', auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
end;
$$;

-- DB-enforced quote eligibility, layer 1: the RPC's own check.
create or replace function public.create_quote_from_estimate(p_estimate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
  v_role public.user_role;
  v_new_quote_id uuid;
  v_line record;
begin
  select * into v_estimate from public.estimates where id = p_estimate_id;
  if v_estimate is null then raise exception 'Estimate not found'; end if;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canCreateQuote') then
    raise exception 'Role does not have canCreateQuote';
  end if;

  -- Redundant with the quotes BEFORE INSERT trigger (defense in depth, not
  -- "trust the RPC alone") — checked here too so the RPC fails with a clear
  -- message before even attempting the insert.
  if v_estimate.pricing_reviewed_at is null or v_estimate.pricing_reviewed_by is null then
    raise exception 'Estimate pricing must be reviewed and approved before a quote can be created';
  end if;
  if v_estimate.source_site_visit_id is not null
     and (select status from public.site_visits where id = v_estimate.source_site_visit_id) != 'completed' then
    raise exception 'The source site visit must be completed before a quote can be created';
  end if;
  if exists (select 1 from public.quotes where estimate_id = p_estimate_id and status != 'declined') then
    raise exception 'An active quote already exists for this estimate';
  end if;

  insert into public.quotes (org_id, estimate_id, type, status, quote_number, created_by)
  values (v_estimate.org_id, p_estimate_id, 'standard', 'draft', 'QUO-' || to_char(now(), 'YYYYMMDDHH24MISSMS'), auth.uid())
  returning id into v_new_quote_id;

  -- Snapshot approved line items — later estimate edits can never retroactively alter this quote.
  for v_line in select * from public.estimate_line_items where estimate_id = p_estimate_id order by sort_order
  loop
    insert into public.quote_line_items (org_id, quote_id, name, description, unit, quantity, unit_price)
    values (v_estimate.org_id, v_new_quote_id, v_line.description, v_line.description, 'ea', v_line.quantity, v_line.unit_price);
  end loop;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_estimate.org_id, 'quote', v_new_quote_id, 'quote_created', 'Draft quote created from estimate.', auth.uid(),
          jsonb_build_object('estimate_id', p_estimate_id, 'service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));

  return v_new_quote_id;
end;
$$;

-- DB-enforced quote eligibility, layer 2: a BEFORE INSERT trigger on quotes
-- itself, firing for every role including service_role — so the invariant
-- holds structurally regardless of insert path, not just "there is currently
-- no other insert path."
create or replace function public.enforce_quote_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
begin
  if new.estimate_id is not null then
    select * into v_estimate from public.estimates where id = new.estimate_id;
    if v_estimate is null then
      raise exception 'Referenced estimate does not exist';
    end if;
    if v_estimate.pricing_reviewed_at is null or v_estimate.pricing_reviewed_by is null then
      raise exception 'Estimate pricing must be reviewed and approved before a quote can be created';
    end if;
    if v_estimate.source_site_visit_id is not null then
      if (select status from public.site_visits where id = v_estimate.source_site_visit_id) != 'completed' then
        raise exception 'The source site visit must be completed before a quote can be created';
      end if;
    end if;
    if new.org_id != v_estimate.org_id then
      raise exception 'Quote org must match the source estimate org';
    end if;
    if exists (select 1 from public.quotes where estimate_id = new.estimate_id and status != 'declined') then
      raise exception 'An active quote already exists for this estimate';
    end if;
  end if;
  return new;
end;
$$;

create trigger quotes_enforce_eligibility
  before insert on public.quotes
  for each row execute function public.enforce_quote_eligibility();

grant execute on function public.generate_estimate_from_site_visit(uuid) to authenticated;
grant execute on function public.approve_estimate_pricing(uuid) to authenticated;
grant execute on function public.reopen_estimate_for_edit(uuid) to authenticated;
grant execute on function public.create_quote_from_estimate(uuid) to authenticated;
