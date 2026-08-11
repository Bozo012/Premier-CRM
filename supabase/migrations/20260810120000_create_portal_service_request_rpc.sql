-- Adds the deliberate, reviewed follow-up that
-- 20260803080000_harden_service_requests_estimates_site_visits.sql itself
-- called for: a real portal-submission path for service_requests, built as
-- a guarded SECURITY DEFINER RPC instead of restoring the broad
-- customer_insert_own_portal_service_requests INSERT policy that migration
-- dropped.
--
-- That migration revoked INSERT/UPDATE/DELETE on service_requests from
-- `authenticated` and replaced the customer-portal write policy with
-- nothing, explicitly reasoning that an unused authorization path (no
-- application code submitted through it) should not be preserved just
-- because it existed, and that "a portal-submission feature, if built
-- later, should be designed and reviewed as a deliberate addition, not
-- inherited from a policy nobody currently exercises." This migration is
-- that deliberate addition. It does NOT re-grant INSERT on
-- service_requests to `authenticated`, and does NOT restore any INSERT RLS
-- policy on that table — the hardening stays fully intact. The only new
-- grant is EXECUTE on the function below, to `authenticated` only (never
-- `anon`).
--
-- create_portal_service_request() derives every field of authority
-- server-side from auth.uid():
--   - customer_id/org_id come from the caller's own active customer_accounts
--     row (one-to-one with auth.users via
--     customer_accounts_auth_user_unique) — never accepted as input.
--   - contact_name/contact_email/contact_phone/contact_preferred_channel are
--     snapshotted from the real customers row for that customer_id, matching
--     the "derive, don't ask the customer to retype it" instruction.
--   - If a property_id is supplied, its ownership is verified via a real
--     customer_properties row for the resolved customer_id (the same
--     ownership model apps/web/app/portal/properties/page.tsx already reads
--     through) before its address is snapshotted onto the request row.
--     Supplying another customer's property_id raises a clear exception —
--     it is never silently ignored or silently accepted.
--   - source is hardcoded to 'portal'; status/priority are left to their
--     table defaults ('new' / 'normal') and are not accepted as input, so a
--     portal customer can never self-declare 'emergency' priority or any
--     non-'new' status. internal_notes, job_id, reviewed_at, converted_at
--     are never set here — this function has no parameter for any of them.
--   - request_number is assigned by the existing
--     next_service_request_number() default, unchanged.
--
-- No request-level dedup/uniqueness is added: the same audit performed for
-- this slice confirmed staff/website request creation
-- (createServiceRequest in packages/db/queries/service-requests.ts) has no
-- uniqueness constraint on service_requests itself either (its dedup logic
-- targets the *customer* record for anonymous submissions, not requests) —
-- multiple real requests from the same known customer_id are a legitimate
-- scenario, so none is invented here. Client-side double-submit protection
-- is a UI concern (disabled submit button while pending), not enforced at
-- this layer.
--
-- See docs/implementation/portal-request-creation.md for the full design
-- writeup.

create or replace function public.create_portal_service_request(
  p_service_title text,
  p_service_description text,
  p_property_id uuid default null
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
  v_contact_name text;
  -- Individual scalar variables, not a `record` — a record type raises
  -- "record is not assigned yet" when its fields are read before any
  -- SELECT INTO has populated it, which always happens on the (fully
  -- legitimate) no-property path. Scalars default to NULL safely instead.
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

  insert into public.service_requests (
    org_id, source, customer_id, property_id,
    contact_name, contact_email, contact_phone, contact_preferred_channel,
    property_address_line_1, property_address_line_2, property_city, property_state, property_zip, property_country, property_type,
    service_title, service_description
  ) values (
    v_org_id, 'portal', v_customer_id, p_property_id,
    v_contact_name, v_customer.email, v_customer.phone_primary, v_customer.preferred_channel,
    v_property_address_line_1, v_property_address_line_2, v_property_city, v_property_state, v_property_zip,
    coalesce(v_property_country, 'US'), v_property_type,
    v_title, v_description
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

-- Revoking from PUBLIC also strips the implicit access every role inherits
-- from it; grant EXECUTE back only to `authenticated`, matching the
-- EXECUTE-grant discipline used throughout
-- 20260802020200_site_visit_lifecycle_rpcs.sql. `anon` is never granted
-- EXECUTE — an unauthenticated caller gets 'Authentication required.' from
-- the auth.uid() check above as defense-in-depth, but the grant itself is
-- the primary boundary.
revoke all on function public.create_portal_service_request(text, text, uuid) from public;
grant execute on function public.create_portal_service_request(text, text, uuid) to authenticated;
