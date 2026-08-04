-- Forge V1.0.2 security patch, Batch CP-A. Closes the direct-authenticated-
-- REST bypass on customers and properties documented in
-- docs/security/customers-properties-authorization-audit.md (CP-1, CP-5) —
-- the same defect class already closed for jobs/quotes
-- (20260803070000_harden_jobs_and_quote_creation_boundary.sql) and for
-- service_requests/estimates/site_visits
-- (20260803080000_harden_service_requests_estimates_site_visits.sql).
--
-- customers and properties previously carried a single, broad `FOR ALL`
-- policy (org_isolation_customers / org_isolation_properties) gated only by
-- organization membership (`user_is_in_org(org_id)`), with no role
-- distinction and no WITH CHECK — any signed-in org member, including
-- `viewer` (zero write capabilities in the TypeScript model), could
-- directly INSERT/UPDATE/DELETE these tables via the REST API, bypassing
-- createCustomerAction/createPropertyForCustomerAction entirely: forging
-- contact details, billing terms (payment_terms_days,
-- standing_approval_threshold, consolidate_invoices_monthly), archive
-- state, or system-managed denormalized fields (total_jobs, total_revenue).
--
-- Confirmed via the audit's exhaustive write-path inventory (§5) that every
-- legitimate write to customers/properties already goes through a
-- service-role server action (createCustomer(), createPropertyForCustomer())
-- or an offline service-role script — zero legitimate authenticated-client
-- write dependency exists. Public intake (createServiceRequest) and portal
-- account linking (ensureCustomerAccount, /api/v1/portal/link-account) are
-- also already service-role and unaffected.
--
-- Two independent layers are applied per table, matching the established
-- pattern, so a future accidental re-GRANT alone cannot silently reopen
-- this bypass:
--   1. REVOKE the INSERT/UPDATE/DELETE table privilege from `authenticated`.
--   2. Replace the broad `FOR ALL` RLS policy with a SELECT-only policy —
--      even if a write privilege were re-granted later, no permissive RLS
--      policy would exist to allow the write through.
--
-- customer_properties and customer_accounts share this same broad-policy
-- pattern and are addressed separately in the CP-B migration
-- (20260804000001_harden_customer_properties_and_accounts.sql), since they
-- also carry the distinct relationship-integrity gap (CP-2, CP-3) that
-- deserves independent reviewability.

-- customers ---------------------------------------------------------------

revoke insert, update, delete on public.customers from authenticated;

drop policy if exists "org_isolation_customers" on public.customers;
create policy "customers_select_org_members" on public.customers
  for select using (user_is_in_org(org_id));

-- customer_select_own_customer (portal customers' own-record SELECT) is
-- untouched — it is a separate, already-narrow policy, not part of
-- org_isolation_customers, and is not affected by this migration's
-- INSERT/UPDATE/DELETE revoke.

-- properties ----------------------------------------------------------------

revoke insert, update, delete on public.properties from authenticated;

drop policy if exists "org_isolation_properties" on public.properties;
create policy "properties_select_org_members" on public.properties
  for select using (user_is_in_org(org_id));

-- customer_select_own_properties (portal customers' own-property SELECT via
-- customer_accounts ⋈ customer_properties) is untouched, same reasoning.
