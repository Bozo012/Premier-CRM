-- Forge V1.0.1 security patch. Closes the direct-authenticated-REST bypass
-- on service_requests, estimates, and site_visits documented in
-- docs/security/service-requests-authorization-audit.md — the same defect
-- class already closed for jobs/quotes in
-- 20260803070000_harden_jobs_and_quote_creation_boundary.sql, discovered
-- adjacent to service_requests during that migration's own writing and
-- confirmed, with a full write-path re-audit, before this migration.
--
-- All three tables previously carried a single, broad `FOR ALL` policy
-- gated only by organization membership (`user_is_in_org(org_id)`), with
-- no role distinction and no WITH CHECK — meaning any signed-in org
-- member, including `viewer` (which holds zero write capabilities in the
-- TypeScript model), could directly INSERT/UPDATE/DELETE these tables via
-- the REST API, bypassing every server action and every guarded RPC:
-- forging `service_requests.triage_decision`/`triaged_by`/`triaged_at`/
-- `job_id`/`estimate_id`/`status` without ever calling
-- record_request_triage()/correct_request_triage(); tampering with
-- `estimates.pricing_reviewed_at`/`pricing_reviewed_by`/line items without
-- the pricing-review handoff; tampering with `site_visits.status`/
-- `inspection_responses` without the guarded lifecycle RPCs.
--
-- Confirmed via an exhaustive write-path audit (both when this was first
-- flagged during Batch A, and again immediately before writing this
-- migration) that zero legitimate application code path depends on a raw
-- authenticated/browser Supabase client writing directly to any of these
-- three tables. Every legitimate write already goes through one of:
--   - a server action using the service-role client (createServiceClient()),
--     which bypasses RLS by design and is entirely unaffected by revoking
--     `authenticated`'s grants (service_role holds its own separate grant);
--   - a SECURITY DEFINER RPC (record_request_triage, correct_request_triage,
--     schedule/reschedule/cancel/start/complete_site_visit,
--     generate_estimate_from_site_visit, approve/reopen/request/return_
--     estimate_pricing_review, create_quote_from_estimate,
--     save_site_visit_inspection — the last of which already had its own
--     `authenticated` EXECUTE grant revoked in
--     20260802020200_site_visit_lifecycle_rpcs.sql, matching this same
--     pattern one layer up).
-- No client-side ('use client') component anywhere in apps/web calls
-- Supabase directly against any of these three tables — confirmed by
-- repository-wide search, including the customer-portal and share-token
-- surfaces, and the separate premier-property-maintenance marketing-site
-- repository (which only ever SELECTs service_requests for its own
-- customer-portal read view, via the unaffected customer_select_own_
-- service_requests policy — read access, never a write).
--
-- Also removes the customer-portal service_requests INSERT policy
-- (customer_insert_own_portal_service_requests): confirmed, by the same
-- exhaustive search, that no application code in either repository
-- currently submits a request through it — it was live at the database
-- layer with no corresponding product feature. Per Kevin's explicit
-- decision, an unused authorization path is not preserved merely because
-- it already exists; a portal-submission feature, if built later, should
-- be designed and reviewed as a deliberate addition, not inherited from a
-- policy nobody currently exercises.
--
-- Two independent layers are applied per table, matching the Batch A
-- pattern, so a future accidental re-GRANT alone cannot silently reopen
-- this bypass:
--   1. REVOKE the INSERT/UPDATE/DELETE table privilege from `authenticated`.
--   2. Replace the broad `FOR ALL` RLS policy with a SELECT-only policy —
--      even if a write privilege were re-granted later, no permissive RLS
--      policy would exist to allow the write through.
--
-- customers and properties share the same broad-policy pattern (confirmed
-- during the audit) but are explicitly out of scope for this patch —
-- recorded as the next focused authorization-audit target, not addressed
-- here.

-- service_requests -----------------------------------------------------

revoke insert, update, delete on public.service_requests from authenticated;

drop policy if exists "internal_org_service_requests" on public.service_requests;
drop policy if exists "customer_insert_own_portal_service_requests" on public.service_requests;

create policy "service_requests_select_org_members" on public.service_requests
  for select using (user_is_in_org(org_id));

-- customer_select_own_service_requests (portal customers' own-request
-- SELECT) is untouched — it is a separate, already-narrow policy, not
-- part of internal_org_service_requests, and is not affected by this
-- migration's INSERT/UPDATE/DELETE revoke.

-- estimates --------------------------------------------------------------

revoke insert, update, delete on public.estimates from authenticated;

drop policy if exists "internal_org_estimates" on public.estimates;
create policy "estimates_select_org_members" on public.estimates
  for select using (user_is_in_org(org_id));

-- site_visits --------------------------------------------------------------

revoke insert, update, delete on public.site_visits from authenticated;

drop policy if exists "internal_org_site_visits" on public.site_visits;
create policy "site_visits_select_org_members" on public.site_visits
  for select using (user_is_in_org(org_id));

-- site_visits has no customer-portal SELECT policy at all (by design —
-- customer access to site-visit data goes exclusively through the narrow
-- get_my_site_visit_summary() SECURITY DEFINER projection, which
-- deliberately excludes every staff_only field). This migration does not
-- add one.
