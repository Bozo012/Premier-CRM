-- F6 (docs/releases/forge-v1-readiness-audit.md, re-confirmed in
-- docs/implementation/v1-known-gaps-audit.md §9): customer_archetype_defaults
-- was created in 0007_catalog_reconciliation.sql alongside org_pricing_policy
-- and permit_guardrails, but — unlike those two, which both got
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus an org-isolation policy in
-- that same migration — RLS was never enabled here. This was an oversight,
-- not a decision: the table shipped with the same broad
-- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` as its two
-- siblings (0010_fix_auth_trigger_and_dashboard_permissions.sql) but no RLS
-- policy to bound it, so any authenticated user in any org can currently
-- read AND overwrite/delete this table directly via PostgREST.
--
-- Unlike org_pricing_policy/permit_guardrails, customer_archetype_defaults
-- has no org_id column (`archetype` — a customer_archetype enum value — is
-- its primary key) and application code confirms it was never designed to
-- be org-owned: it is a small (7-row), rarely-changing, org-agnostic
-- reference table of default billing/notification settings per customer
-- archetype, seeded once and intended to read identically for every org
-- (the org_isolation_* policy pattern used on its siblings does not apply
-- here — there is no org_id to scope by, and inventing one would be a schema
-- redesign this fix does not need).
--
-- Repo-wide grep confirms zero application code (queries or server actions)
-- currently reads or writes this table at all — it is unused reference data
-- today, seeded once and never touched since. So the correct minimal fix is:
-- reads stay open to any authenticated user (safe — non-sensitive shared
-- config, same for every org, no cross-tenant leakage possible since there's
-- no per-org data to leak), but the direct authenticated-write path that
-- currently lets any signed-in user in any org silently corrupt shared
-- defaults for every org is closed. If a genuine future need for
-- staff-driven customization of these defaults arises, that should be a
-- deliberate product decision (its own capability + org-scoped override
-- table), not a side effect of a security fix.

ALTER TABLE public.customer_archetype_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_archetype_defaults_read" ON public.customer_archetype_defaults;
CREATE POLICY "customer_archetype_defaults_read" ON public.customer_archetype_defaults
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy for `authenticated` — writes fall through
-- to RLS's default deny. service_role (used by trusted server-side code,
-- e.g. a future seed/admin script) bypasses RLS entirely per Supabase's
-- standard role configuration, so a legitimate privileged write path still
-- exists without needing an explicit policy for it.
