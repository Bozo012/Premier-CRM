-- Security fix (PR B authorization audit): org_invites' only policy,
-- org_isolation_org_invites (20260723000000_org_invites.sql), was `FOR ALL
-- USING (user_is_in_org(org_id))` — any active org member, including an
-- employee, could read/create/update/delete invites directly via the
-- Supabase REST API using their own session, entirely bypassing the app's
-- owner/admin-only check (getTeamActionContext() in
-- apps/web/app/(app)/team/actions.ts). Combined with the `authenticated`
-- role's full INSERT/UPDATE/DELETE grant (added for a legitimate reason in
-- 20260726000001_grant_org_invites_authenticated.sql — team/page.tsx's own
-- SELECT needed it — but broader than necessary), this meant an employee
-- could invite a new admin, revoke any pending invite, or resurrect one.
--
-- Confirmed live before this fix: signed in as the E2E employee test
-- account and successfully INSERTed an admin-role org_invites row directly
-- via the anon-key REST API — no error, row created.
--
-- Fix mirrors the pattern already used correctly for org_members ("Owners
-- and admins can manage member status", 0009_user_org_association.sql) and
-- organizations ("Owners can update their org", 0001_init.sql): replace the
-- membership-only policy with one that also requires the requester's own
-- org_members row to be role IN ('owner','admin') AND status='active'.
-- team/page.tsx's SELECT and the create/revoke server actions (which use a
-- service-role client, bypassing RLS entirely) are unaffected.

DROP POLICY IF EXISTS "org_isolation_org_invites" ON public.org_invites;

CREATE POLICY "owner_admin_manage_org_invites" ON public.org_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = org_invites.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
        AND org_members.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = org_invites.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
        AND org_members.status = 'active'
    )
  );

-- Narrow the base grant to match: the app never writes to org_invites via
-- the `authenticated` role (create/revoke always go through a service-role
-- client — packages/db/queries/org-invites.ts) — only team/page.tsx's own
-- read needs it. Defense in depth: even a future RLS policy bug couldn't
-- grant write access this role was never supposed to have.
REVOKE INSERT, UPDATE, DELETE ON public.org_invites FROM authenticated;
