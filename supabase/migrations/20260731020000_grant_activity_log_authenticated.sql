-- activity_log (20260731010000_activity_log.sql) has RLS enabled and a
-- SELECT policy (activity_log_select_org_members), but was never GRANTed to
-- the `authenticated` Postgres role — the exact same class of bug already
-- found and fixed once in this codebase for org_invites (see
-- 20260726000001_grant_org_invites_authenticated.sql's comment): base table
-- grants are checked BEFORE row-level security policies, so every query via
-- the user's own session client failed outright with "permission denied for
-- table activity_log" (Postgres error 42501), regardless of the RLS policy
-- being otherwise correct. Confirmed live: (app)/today/page.tsx's read of
-- recent quote-response activity never rendered for any owner/admin.
--
-- Only SELECT is granted — inserts are intentionally service-role only (see
-- the base migration's comment); authenticated users should never write
-- this table directly.

GRANT SELECT ON public.activity_log TO authenticated;
