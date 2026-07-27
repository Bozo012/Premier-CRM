-- org_invites (20260723000000_org_invites.sql) has RLS enabled and a policy
-- (org_isolation_org_invites), but was never GRANTed to the `authenticated`
-- Postgres role — unlike customers, jobs, etc. (see
-- 0010_fix_auth_trigger_and_dashboard_permissions.sql's GRANT statements).
-- Base table grants are checked BEFORE row-level security policies; without
-- this grant, every query against org_invites via the user's own session
-- client (not service-role) fails outright with "permission denied for
-- table org_invites", regardless of the RLS policy being otherwise correct.
--
-- Confirmed live: team/page.tsx's read of pending invites uses exactly this
-- session-bound client (apps/web/app/(app)/team/page.tsx), so the "Pending
-- invites" section has never been able to render for ANY owner/admin,
-- including the real pending invites already sent to Brandon — the create
-- and revoke actions still "work" only because they go through a
-- service-role client (packages/db/queries/org-invites.ts), which bypasses
-- grants and RLS entirely.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO authenticated;
