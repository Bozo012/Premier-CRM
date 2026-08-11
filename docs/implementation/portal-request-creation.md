# Portal request creation: a guarded RPC, not a restored policy

Branch: `feature/portal-request-creation-rpc`. Closes the product gap
`apps/web/app/portal/requests/page.tsx` left explicitly open in
`rebuild/base44-customer-portal-completion` (PR #136): a signed-in portal
customer had no way to create a real `service_requests` row.

## The revoked-policy audit, and why this is the correct follow-up

`supabase/migrations/20260803080000_harden_service_requests_estimates_site_visits.sql`
closed a real authorization defect: `service_requests`, `estimates`, and
`site_visits` all carried a single broad `FOR ALL` RLS policy gated only by
org membership, with no role distinction and no `WITH CHECK` — any signed-in
org member (including `viewer`, which holds zero write capabilities in the
TypeScript model) could `INSERT`/`UPDATE`/`DELETE` these tables directly via
the REST API, bypassing every server action and guarded RPC.

As part of that hardening, the migration also revoked
`INSERT, UPDATE, DELETE` on `service_requests` from `authenticated` and
dropped `customer_insert_own_portal_service_requests` — the customer-portal
INSERT policy. Its own comments are explicit about why: no application code
in either this repository or the separate marketing-site repository
submitted a request through that policy — it was live at the database layer
with no corresponding product feature. Per Kevin's explicit decision, an
unused authorization path is not preserved merely because it already exists;
a portal-submission feature, if built later, "should be designed and
reviewed as a deliberate addition, not inherited from a policy nobody
currently exercises."

This slice is that deliberate addition. It does **not** restore the dropped
policy and does **not** re-grant `INSERT` on `service_requests` to
`authenticated`. The hardening migration is untouched. The only new grant is
`EXECUTE` on `create_portal_service_request(...)`, to `authenticated` only.

## The RPC

Migration: `supabase/migrations/20260810120000_create_portal_service_request_rpc.sql`
(additive only — no other migration touched).

```sql
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
  v_property record;
  v_request_id uuid;
  v_title text := trim(coalesce(p_service_title, ''));
  v_description text := trim(coalesce(p_service_description, ''));
  v_contact_name text;
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
      into v_property
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
    v_property.address_line_1, v_property.address_line_2, v_property.city, v_property.state, v_property.zip,
    coalesce(v_property.country, 'US'), v_property.property_type,
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

revoke all on function public.create_portal_service_request(text, text, uuid) from public;
grant execute on function public.create_portal_service_request(text, text, uuid) to authenticated;
```

### Inputs accepted

| Param | Type | Required | Notes |
|---|---|---|---|
| `p_service_title` | text | yes | trimmed, 1–200 chars |
| `p_service_description` | text | yes | trimmed, 1–5000 chars |
| `p_property_id` | uuid | no | must resolve to a `customer_properties` row for the caller's own `customer_id`, or the call is rejected |

### Fields derived server-side, never accepted as input

- `org_id`, `customer_id` — resolved from the caller's own `customer_accounts`
  row via `auth.uid()`. `customer_accounts_auth_user_unique` guarantees
  exactly one row per `auth.users` row, so there is no multiplicity
  ambiguity to resolve.
- `contact_name` / `contact_email` / `contact_phone` /
  `contact_preferred_channel` — snapshotted from the real `customers` row for
  that `customer_id` (company name > display name > first+last name >
  `'Portal customer'` fallback), never retyped by the customer.
- `property_address_line_1/_2/city/state/zip/country/property_type` — when
  `p_property_id` is supplied and ownership-verified, snapshotted from the
  real `properties` row, matching the snapshot pattern
  `createServiceRequest()` (`packages/db/queries/service-requests.ts`) already
  uses for the website intake path. When no property is supplied, these stay
  `null`.
- `source` — hardcoded to `'portal'`.
- `status` — left to the table default (`'new'`); never accepted as input, so
  a portal customer cannot self-approve, self-schedule, or otherwise set a
  non-`'new'` status.
- `request_number` — assigned by the existing
  `next_service_request_number()` column default, unchanged.
- `submitted_at` — table default (`now()`).

### Fields explicitly rejected / never exposed

`priority`, `internal_notes`, `job_id`, `estimate_id`, `reviewed_at`,
`converted_at`, `triage_decision` and every other staff-only/lifecycle field
have no corresponding parameter — they are structurally impossible to set
through this RPC. In particular, **priority is not a parameter at all**: the
table default (`'normal'`) applies unconditionally. This was a deliberate
design choice over the alternative of accepting `priority` and clamping/
rejecting `'emergency'` — omitting the parameter entirely is a stronger
guarantee than any runtime check, and a portal customer self-declaring
urgency was explicitly out of scope for this slice.

### Customer-account and property-ownership resolution

```sql
select ca.customer_id, ca.org_id
  into v_customer_id, v_org_id
  from public.customer_accounts ca
 where ca.auth_user_id = auth.uid()
   and ca.status = 'active';

if v_customer_id is null then
  raise exception 'No active customer account linked to this session.';
end if;
```

This mirrors `resolveActivePortalAccount()`
(`apps/web/app/portal/_lib/portal-session.ts`) at the SQL layer — the same
authentication outcome, re-derived independently inside the SECURITY DEFINER
boundary rather than trusted from the caller.

Property ownership is verified with a join against `customer_properties`
(the same table `apps/web/app/portal/properties/page.tsx` already reads
through), scoped to the resolved `customer_id` and `org_id`:

```sql
select p.address_line_1, ...
  into v_property
  from public.properties p
  join public.customer_properties cp on cp.property_id = p.id
 where p.id = p_property_id
   and cp.customer_id = v_customer_id
   and p.org_id = v_org_id;

if not found then
  raise exception 'The selected property does not belong to your account.';
end if;
```

Supplying another customer's `property_id` raises a clear exception — it is
never silently ignored or silently accepted with a null property.

## Grants model

- `revoke all on function ... from public` then
  `grant execute ... to authenticated` — the same discipline used throughout
  `20260802020200_site_visit_lifecycle_rpcs.sql` (revoking from `PUBLIC` also
  strips the implicit inherited access every role gets from it, so it must be
  re-granted explicitly to the one role that should have it).
- **No grant to `anon`.** An unauthenticated caller is rejected at the
  `auth.uid() is null` check inside the function as defense-in-depth, but the
  grant boundary is the primary control.
- `service_requests` itself still has **no** `INSERT` grant and **no**
  `INSERT` RLS policy for `authenticated` — confirmed by E2E test 6 (below),
  which asserts a direct `.from('service_requests').insert(...)` call still
  fails.

## Application layers

- **Query wrapper**: `createPortalServiceRequest()` in
  `packages/db/queries/service-requests.ts` — thin `client.rpc(...)` call
  returning `Result<CreatePortalServiceRequestResult>`, following the same
  pattern as `startSiteVisit`/`undoSiteVisitStart` in
  `packages/db/queries/site-visits.ts`. Exported from `packages/db/index.ts`.
- **Server action**: `createPortalServiceRequestAction()` in
  `apps/web/app/portal/requests/actions.ts` (new file) — resolves
  `resolveActivePortalAccount()`, runs a thin Zod schema (title 1–200 chars,
  description 1–5000 chars, optional uuid `propertyId`) purely for fast
  client-facing errors, then calls the query wrapper **with the RLS-scoped
  `portalClient`** (not the service-role client) so `auth.uid()` resolves
  correctly inside the SECURITY DEFINER function. Calls
  `revalidatePath('/portal/requests')` on success.
- **UI**: `PortalNewRequestSheet`
  (`apps/web/app/portal/requests/_components/portal-new-request-sheet.tsx`) —
  a modal form matching `PortalContactSheet`'s existing dialog pattern
  (`apps/web/app/portal/_components/portal-contact-sheet.tsx`): a `<select>`
  populated only from the customer's own `customer_properties` (fetched
  server-side in `apps/web/app/portal/requests/page.tsx`, never an arbitrary
  property-id input), a title input, a description textarea, and a submit
  button. Uses `useActionState` + `router.refresh()` on success — the same
  pattern already established by
  `apps/web/app/portal/_components/add-change-order-comment-form.tsx` and
  siblings — so the underlying server-rendered list picks up the new row
  immediately, not via client-side-only state. No attachment, priority,
  scheduling, technician, or quote-amount UI exists anywhere in this form.

## Staff-workflow compatibility

The created row is a completely normal `service_requests` row: same table,
same columns, `status = 'new'`, `source = 'portal'`. Staff triage it exactly
like a website- or phone-sourced request — `record_request_triage()` and
every other request-lifecycle RPC operate on `service_requests` rows
generically and have no special-casing for `source`. No staff-facing code
needed to change.

## Test coverage

- **Unit** (`apps/web/app/portal/requests/actions.test.ts`, 8 tests): no
  linked account rejected before the RPC wrapper is called; missing title;
  missing description; title over 200 chars; malformed (non-uuid)
  `propertyId`; empty `propertyId` normalizes to `null`; a valid `propertyId`
  passes through unchanged; a failure `Result` from the RPC wrapper passes
  through without calling `revalidatePath`. Mocks the RPC wrapper — does not
  attempt to re-test SQL behavior with a mocked database.
- **E2E** (`tests/e2e/portal-request-creation-bot.spec.ts`, new spec, 7
  tests, self-contained service-role fixture per
  `createGuardedServiceClient`/`portal-completion-base44-shell-bot.spec.ts`
  conventions):
  1. a linked customer creates a request with no property → `status='new'`,
     correct `org_id`/`customer_id`/`source`/`priority`, `internal_notes`
     stays null (verified via a direct service-role read).
  2. an owned property succeeds and its address is snapshotted onto the
     request.
  3. another customer's `property_id` is rejected with a clear error.
  4. missing title/description are rejected by the RPC itself.
  5. unauthenticated RPC execution is rejected.
  6. direct authenticated `.from('service_requests').insert(...)` still
     fails — the single most important regression proof that this slice did
     not reopen the hardening migration.
  7. the created request appears in `/portal/requests` after creation, via a
     real browser render through `loginAsPortalCustomer`.

  Written and typechecked only (`npx tsc --noEmit -p tests/e2e/tsconfig.json`
  — zero new errors), not run live, per this program's standing workflow:
  Kevin applies the migration to `premier-crm-e2e` after his own independent
  audit and runs the suite himself.

## Known limitations / deliberate non-goals

- **No request-level dedup.** The staff/website creation path
  (`createServiceRequest` in `packages/db/queries/service-requests.ts`) has
  no uniqueness constraint on `service_requests` itself — its dedup logic
  targets the *customer* record for anonymous submissions, which doesn't
  apply here since the portal customer is already a known, authenticated
  `customer_id`. Multiple real requests from the same customer (two
  different issues) are legitimate, so none is invented for the portal path
  either. The only double-submit protection is client-side (the submit
  button disables while the action is pending) — not relied on for
  correctness, since nothing downstream assumes requests are unique per
  customer.
- **No attachments.** Out of scope, matching the instruction not to invent
  capability beyond the minimal field set.
- **No self-declared priority/urgency.** See "Fields explicitly rejected"
  above — `priority` always defaults to `'normal'` at the table level; the
  RPC has no parameter for it at all.
- **No scheduling/technician/quote-amount UI.** Out of scope.
