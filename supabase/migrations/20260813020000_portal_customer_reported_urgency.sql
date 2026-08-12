-- Portal customer-reported urgency (product decision recorded 2026-08-13,
-- docs/implementation/v1-known-gaps-audit.md §11, Option B).
--
-- create_portal_service_request() deliberately never accepted a priority
-- input at all — "a portal customer can never self-declare 'emergency'
-- priority" (20260810120000_create_portal_service_request_rpc.sql). That
-- stays true here: this migration does NOT touch `priority` or give the
-- portal any way to set it, directly or indirectly. It adds a separate,
-- explicitly-labeled signal instead — what the customer says about how
-- urgent it feels to them — that staff sees as context during triage, not
-- as an instruction. `service_requests.priority` remains 100%
-- staff-authoritative; there is no code path anywhere (this migration
-- included) that copies customer_reported_urgency into priority.
--
-- Nullable, no default: existing rows and every non-portal intake path
-- (manual staff entry, website widget) simply have no customer-reported
-- signal, which is honestly true rather than guessed.

create type public.service_request_customer_urgency as enum ('routine', 'soon', 'urgent');

alter table public.service_requests
  add column customer_reported_urgency public.service_request_customer_urgency;

-- ============================================================================
-- create_portal_service_request — signature change (new trailing optional
-- parameter), so the prior 3-arg overload is dropped explicitly rather than
-- left to coexist; CREATE OR REPLACE alone would not replace it since the
-- parameter list differs.
-- ============================================================================

drop function if exists public.create_portal_service_request(text, text, uuid);

create function public.create_portal_service_request(
  p_service_title text,
  p_service_description text,
  p_property_id uuid default null,
  p_customer_reported_urgency text default null
)
returns table (
  id uuid,
  request_number text,
  status public.service_request_status,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_org_id uuid;
  v_customer record;
  v_request_id uuid;
  v_title text := trim(coalesce(p_service_title, ''));
  v_description text := trim(coalesce(p_service_description, ''));
  v_urgency public.service_request_customer_urgency;
  v_contact_name text;
  v_property_address_line_1 text;
  v_property_address_line_2 text;
  v_property_city text;
  v_property_state text;
  v_property_zip text;
  v_property_country text;
  v_property_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select ca.customer_id, ca.org_id
    into v_customer_id, v_org_id
    from public.customer_accounts ca
   where ca.auth_user_id = auth.uid()
     and ca.status = 'active';

  if v_customer_id is null then
    raise exception 'No active customer account linked to this session.';
  end if;

  if v_title = '' then
    raise exception 'A service title is required.';
  end if;
  if length(v_title) > 200 then
    raise exception 'Service title must be 200 characters or fewer.';
  end if;
  if v_description = '' then
    raise exception 'A service description is required.';
  end if;
  if length(v_description) > 5000 then
    raise exception 'Service description must be 5000 characters or fewer.';
  end if;

  if p_customer_reported_urgency is not null then
    begin
      v_urgency := p_customer_reported_urgency::public.service_request_customer_urgency;
    exception when invalid_text_representation then
      raise exception 'Invalid customer_reported_urgency value: %', p_customer_reported_urgency;
    end;
  end if;

  select c.first_name, c.last_name, c.display_name, c.company_name, c.email, c.phone_primary, c.preferred_channel
    into v_customer
    from public.customers c
   where c.id = v_customer_id
     and c.org_id = v_org_id;

  if not found then
    raise exception 'Customer record not found for this account.';
  end if;

  v_contact_name := coalesce(
    nullif(v_customer.company_name, ''),
    nullif(v_customer.display_name, ''),
    nullif(trim(concat_ws(' ', v_customer.first_name, v_customer.last_name)), ''),
    'Portal customer'
  );

  if p_property_id is not null then
    select p.address_line_1, p.address_line_2, p.city, p.state, p.zip, p.country, p.property_type
      into v_property_address_line_1, v_property_address_line_2, v_property_city, v_property_state,
           v_property_zip, v_property_country, v_property_type
      from public.properties p
      join public.customer_properties cp on cp.property_id = p.id
     where p.id = p_property_id
       and cp.customer_id = v_customer_id
       and p.org_id = v_org_id;

    if not found then
      raise exception 'The selected property does not belong to your account.';
    end if;
  end if;

  -- Note: `priority` is intentionally absent from this insert's column list
  -- — it takes the table's own default ('normal'), exactly as before.
  -- customer_reported_urgency is a separate column with no bearing on it.
  insert into public.service_requests (
    org_id, source, customer_id, property_id,
    contact_name, contact_email, contact_phone, contact_preferred_channel,
    property_address_line_1, property_address_line_2, property_city, property_state, property_zip, property_country, property_type,
    service_title, service_description, customer_reported_urgency
  ) values (
    v_org_id, 'portal', v_customer_id, p_property_id,
    v_contact_name, v_customer.email, v_customer.phone_primary, v_customer.preferred_channel,
    v_property_address_line_1, v_property_address_line_2, v_property_city, v_property_state, v_property_zip,
    coalesce(v_property_country, 'US'), v_property_type,
    v_title, v_description, v_urgency
  )
  returning service_requests.id into v_request_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (
    v_org_id, 'service_request', v_request_id, 'service_request_submitted',
    format('Portal request submitted: %s', v_title), auth.uid(),
    jsonb_build_object('customer_id', v_customer_id, 'property_id', p_property_id, 'source', 'portal')
  );

  return query
    select sr.id, sr.request_number, sr.status, sr.submitted_at
      from public.service_requests sr
     where sr.id = v_request_id;
end;
$$;

revoke all on function public.create_portal_service_request(text, text, uuid, text) from public;
grant execute on function public.create_portal_service_request(text, text, uuid, text) to authenticated;
