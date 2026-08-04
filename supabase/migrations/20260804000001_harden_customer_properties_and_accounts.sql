-- Forge V1.0.2 security patch, Batch CP-B. Closes the relationship-
-- integrity gap documented in
-- docs/security/customers-properties-authorization-audit.md (CP-2, CP-3),
-- and extends the CP-A direct-write revoke
-- (20260804000000_harden_customers_and_properties.sql) to
-- customer_properties and customer_accounts, which share the identical
-- broad-`FOR ALL`/org-membership-only direct-write exposure.
--
-- customer_properties_isolation previously validated only the *customer*
-- side of the customer<->property link (`EXISTS customers WHERE
-- customers.id = customer_properties.customer_id AND
-- user_is_in_org(customers.org_id)`) — it never checked the property's
-- org at all. Any signed-in org member could INSERT a row linking one of
-- their own org's customers directly to another organization's property,
-- with no RLS or constraint blocking it.
--
-- internal_org_customer_accounts had the identical asymmetric shape: it
-- validated only the row's own `org_id` (`user_is_in_org(org_id)`), never
-- that the referenced `customer_id` actually belongs to that org. Combined
-- with the narrow customer-portal SELECT policies
-- (customer_select_own_customer / customer_select_own_properties /
-- customer_select_own_customer_properties), all of which join only on
-- `customer_id` and never re-verify org, an org-A member could INSERT a
-- customer_accounts row with org_id = org_A but customer_id belonging to
-- org B — a genuine cross-tenant data-exposure path into another
-- organization's customer, property, and (via the marketing site's
-- portal-dashboard invoice query) financial data, not merely a tampering
-- risk.
--
-- Confirmed via the audit's write-path inventory (§5) that
-- createPropertyForCustomer() (service-role) already verifies customerId
-- belongs to orgId before creating the link, and ensureCustomerAccount() /
-- the portal link-account bridge (both service-role) already scope
-- customer_accounts creation to a single hardcoded, already-validated org
-- — so no legitimate write depends on the broad authenticated grant or the
-- asymmetric policy shape being open.
--
-- Same two-layer pattern as CP-A:
--   1. REVOKE the INSERT/UPDATE/DELETE table privilege from `authenticated`.
--   2. Replace the broad `FOR ALL` policy with a SELECT-only policy whose
--      USING clause validates *both* sides of the relationship — kept as
--      defense-in-depth (not merely redundant with the revoke) for any
--      future RPC context that might still rely on RLS with `authenticated`.
--
-- No data rewrite: this migration only changes grants and policy
-- definitions, never touches existing rows. Pre-existing E2E rows were
-- confirmed free of any cross-org mismatch immediately before this
-- migration was applied (see the implementation addendum in
-- docs/security/customers-properties-authorization-audit.md).

-- customer_properties -------------------------------------------------------

revoke insert, update, delete on public.customer_properties from authenticated;

drop policy if exists "customer_properties_isolation" on public.customer_properties;

create policy "customer_properties_select_org_members" on public.customer_properties
  for select using (
    exists (
      select 1 from public.customers c
      where c.id = customer_properties.customer_id
        and user_is_in_org(c.org_id)
    )
    and exists (
      select 1 from public.properties p
      where p.id = customer_properties.property_id
        and user_is_in_org(p.org_id)
    )
  );

-- customer_select_own_customer_properties (portal customers' own-link
-- SELECT) is untouched — separate, already-narrow policy, not part of
-- customer_properties_isolation.

-- customer_accounts -----------------------------------------------------

revoke insert, update, delete on public.customer_accounts from authenticated;

drop policy if exists "internal_org_customer_accounts" on public.customer_accounts;

create policy "customer_accounts_select_org_members" on public.customer_accounts
  for select using (
    user_is_in_org(org_id)
    and exists (
      select 1 from public.customers c
      where c.id = customer_accounts.customer_id
        and c.org_id = customer_accounts.org_id
    )
  );

-- customer_select_own_account (portal customers' own-account SELECT via
-- auth_user_id = auth.uid()) is untouched, same reasoning.
