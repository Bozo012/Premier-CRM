-- Closes the direct-authenticated-REST bypass discovered while validating
-- the Forge V1 readiness audit's Batch A fix (PR #92,
-- docs/releases/forge-v1-readiness-audit.md): the action-layer fix for
-- createJobFromRequestAction() (owner/admin-only canCreateDirectWorkOrder)
-- and createDraftQuoteAction() (canCreateQuote, excludes subcontractor)
-- only protects the app's own server actions. A signed-in org member's own
-- authenticated Supabase session could still call the REST API directly
-- and INSERT into `jobs` or `quotes`, bypassing both capability checks
-- entirely — hiding the UI button and gating the server action are
-- necessary but not sufficient while the base-table write remains open.
--
-- Confirmed via a full audit of every jobs/quotes write path (staff
-- server actions, the customer share-token portal path, and every
-- SECURITY DEFINER RPC) before writing this migration: every single
-- legitimate write already goes through either a server action using the
-- service-role client (createServiceClient(), which bypasses RLS by
-- design and is unaffected by the REVOKEs below — service_role holds its
-- own separate, unaffected grant) or a SECURITY DEFINER RPC
-- (apply_job_scheduling for scheduling). No client-side ('use client')
-- component anywhere in apps/web writes to `jobs` or `quotes` directly —
-- confirmed by grep, same verification method used by the prior
-- payments/invoices hardening (20260731000000_invoices_payments_owner_
-- admin_write.sql). Ordinary authenticated clients therefore need zero
-- direct INSERT/UPDATE/DELETE access to either table; SELECT (staff
-- org-scoped reads, and the customer-portal read of their own jobs) is
-- the only access authenticated sessions ever legitimately need.
--
-- Two independent layers are applied, not just one, so a future accidental
-- re-GRANT alone cannot silently reopen this bypass:
--   1. REVOKE the INSERT/UPDATE/DELETE table privilege from `authenticated`.
--   2. Replace the broad `FOR ALL` RLS policy with a SELECT-only policy —
--      even if INSERT were re-granted later, no permissive RLS policy
--      would exist to allow the write through.
--
-- `service_requests` and `activity_log` were also audited (per the same
-- instruction) for the identical bypass pattern. `activity_log` already
-- has no INSERT/UPDATE/DELETE grant for `authenticated` at all — already
-- safe, confirmed, not touched. `service_requests` has the same broad
-- `FOR ALL` org-only pattern on its staff-side policy, which does allow a
-- similar class of tampering (e.g. directly writing `triage_decision` or
-- `job_id` without calling record_request_triage()) — but this does not
-- let a bypasser fabricate a *new* unauthorized job or quote the way the
-- jobs/quotes gaps do (jobs/quotes INSERT are now closed by this
-- migration, so forging a service_requests.job_id can only point at an
-- already-legitimately-created job). Judged not equivalent to the two
-- confirmed Batch A findings and deliberately left unfixed here — flagged
-- in the Batch A implementation report as a candidate for a future batch,
-- per the explicit instruction to fix only confirmed Batch A-equivalent
-- bypasses in this migration.

revoke insert, update, delete on public.jobs from authenticated;
revoke insert, update, delete on public.quotes from authenticated;

drop policy if exists "org_isolation_jobs" on public.jobs;
create policy "jobs_select_org_members" on public.jobs
  for select using (user_is_in_org(org_id));

drop policy if exists "org_isolation_quotes" on public.quotes;
create policy "quotes_select_org_members" on public.quotes
  for select using (user_is_in_org(org_id));

-- customer_select_own_jobs (portal customers' own-job SELECT) is untouched
-- by the above — it is a separate policy, not part of org_isolation_jobs.
