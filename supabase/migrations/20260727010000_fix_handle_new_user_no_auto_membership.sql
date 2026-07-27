-- PR C0: stop handle_new_user() from silently attaching every new Supabase
-- Auth signup to the hardcoded Premier org as a "pending employee".
--
-- Root cause this closes: handle_new_user() (0001_init.sql /
-- 0010_fix_auth_trigger_and_dashboard_permissions.sql) ran on EVERY new
-- auth.users row -- invited employees, plain public signups, anyone -- and
-- inserted an org_members row into org_id
-- 'a0000000-0000-0000-0000-000000000001' immediately, before email
-- confirmation or invite acceptance ever ran. For a genuinely invited user
-- whose real membership is later created by accept_org_invite() (which
-- upserts ON CONFLICT (org_id, user_id) DO UPDATE SET status = 'active'),
-- this mostly self-healed IF accept_org_invite() ran to completion — but if
-- invite acceptance never completed (confirmed for a real account during
-- this PR's investigation: the confirmation email's redirect never reached
-- /invite/[token]/continue), the user was left with only the trigger's
-- 'pending' row. Two RLS policies disagreeing about whether 'pending' counts
-- ("Users can read their own membership" on org_members has no status
-- check; user_is_in_org(), which gates the `organizations` table, requires
-- status = 'active') is what produced the "Unknown org • Employee" bug: the
-- org_members row read back fine (org_id + role visible), but the joined
-- organization name silently came back null.
--
-- Worse: this trigger would attach an arbitrary public signup (anyone who
-- fills out /login's sign-up form with no invite at all) to Premier's real
-- org as a pending employee — never surfaced anywhere for an owner to
-- approve or reject, just silent debris that a stale-row query like this one
-- has to clean up after the fact.
--
-- Fix: handle_new_user() now ONLY ever creates an org_members row for the
-- genuine first-owner bootstrap case, and does so as an already-active
-- owner, not a pending employee. Every other signup gets a user_profiles row
-- and NO org membership at all; real membership is created exclusively by
-- accept_org_invite() once an invite is actually accepted. An arbitrary
-- public signup with no invite now ends up with zero memberships --
-- getActiveOrgContext() (packages/db/queries/org-context.ts) surfaces that
-- as a clear "no active organization" state, never a fabricated placeholder.
--
-- Bootstrap condition, deliberately NOT "zero ACTIVE members right now":
-- counting only active members would let a second, unrelated signup become
-- owner later if the org's one real owner is ever deactivated/removed for
-- any reason (role change, suspension, offboarding) and active_member_count
-- transiently drops back to 0 — an attacker or an unrelated public signup
-- landing in that window would auto-bootstrap as owner. Instead this checks
-- whether the org has EVER had any org_members row at all, active or not.
-- Once a single row exists for this org — meaning it has been initialized at
-- least once — that count can never fall back to zero (rows are updated to
-- 'active'/other statuses, not deleted, by any normal application code path),
-- so bootstrap can only ever fire once, for a genuinely uninitialized org.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  premier_org_id   UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  ever_had_members BOOLEAN;
BEGIN
  INSERT INTO public.user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = premier_org_id
  ) INTO ever_had_members;

  -- Bootstrap only: the very first signup for a truly uninitialized org
  -- becomes its active owner automatically. Every other signup -- invited or
  -- not, and regardless of whether the org's current active-member count is
  -- 0 -- gets no automatic membership here; accept_org_invite() creates a
  -- real one when (and only when) an actual invite is accepted.
  IF NOT ever_had_members THEN
    INSERT INTO public.org_members (org_id, user_id, role, status)
    VALUES (premier_org_id, NEW.id, 'owner', 'active')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Stale-row cleanup
-- ---------------------------------------------------------------------------
--
-- Every 'pending' org_members row in this schema was created exclusively by
-- the OLD handle_new_user() above -- accept_org_invite() (20260723000001_
-- org_invites_function_hardening.sql) only ever inserts/updates status
-- directly to 'active', and no other function, server action, or migration
-- in this codebase writes status = 'pending' to org_members (verified by
-- grepping the full apps/web and packages/db source for every org_members
-- write). So `status = 'pending'` is a complete, precise identifier for
-- "trigger debris created by the old design" here — no timestamp heuristics
-- needed, and no risk of matching a real, working membership (which is
-- always 'active'). This DELETE is idempotent: running it again with no
-- pending rows left is a no-op.
--
-- Verified via a pre-migration dry run (see PR C0's report for the full
-- query/output, with emails redacted from this migration itself) that
-- exactly 3 rows matched, all role = 'employee', all in the hardcoded org,
-- all with joined_at within ~2ms of their auth.users.created_at (i.e.
-- created by the signup trigger, not by any real invite acceptance): one
-- test signup with no org_invites row at all, one with an org_invites row
-- that was revoked and never accepted, and one with a still-pending,
-- unexpired org_invites row (repaired separately in a follow-up step by
-- actually accepting that invite via accept_org_invite() — see PR C0's
-- report — never by this migration or by hand-inserting a row). None of
-- these were any real ACTIVE account — this only ever touches
-- status = 'pending' rows, and every real, working membership in this
-- schema is 'active'.
DELETE FROM public.org_members WHERE status = 'pending';
