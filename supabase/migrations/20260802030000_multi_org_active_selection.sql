-- Multi-org active-organization selection.
--
-- getActiveOrgContext() (packages/db/queries/org-context.ts) has always
-- hard-rejected any account with more than one ACTIVE org_members row
-- ("This account has N active organization memberships, but only one is
-- supported today"). That was a deliberate, documented decision when this
-- product was genuinely single-org — but it is a real blocker for the
-- Premier CRM Demonstration organization: adding Kevin's real staff
-- account to a second org as owner would make every one of the ~36
-- getActiveOrgContext() call sites across the app start erroring for him,
-- breaking his real PPM login.
--
-- Fix: a nullable `active_org_id` preference on `user_profiles`, set only
-- by the guarded `switch_active_org()` RPC below (never written directly).
-- getActiveOrgContext() (application-code change, same PR) now resolves a
-- multi-membership account by honoring this preference when it points at
-- one of the user's own active memberships, and otherwise deterministically
-- defaults to the OLDEST active membership (by org_members.joined_at) —
-- never a random/unstable choice, and never silently defaulting a
-- single-org user like Kevin-in-PPM-only away from PPM. This requires zero
-- signature or call-site changes: every existing caller of
-- getActiveOrgContext(client, userId) keeps working exactly as before,
-- automatically gaining multi-org support.
alter table public.user_profiles
  add column active_org_id uuid references public.organizations(id) on delete set null;

-- Guarded switch RPC — the only permitted writer of active_org_id. Requires
-- the caller to actually hold an ACTIVE membership in the target org;
-- switching to an org you don't belong to (or a non-existent org) is
-- rejected outright, never silently ignored.
create or replace function public.switch_active_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to switch organizations';
  end if;

  select exists (
    select 1 from public.org_members
    where user_id = auth.uid() and org_id = p_org_id and status = 'active'
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not an active member of this organization';
  end if;

  update public.user_profiles
  set active_org_id = p_org_id
  where id = auth.uid();
end;
$$;

grant execute on function public.switch_active_org(uuid) to authenticated;
