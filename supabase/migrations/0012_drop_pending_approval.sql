-- Premier CRM — Drop pending approval / self-signup flow
-- Migration: 0012_drop_pending_approval
--
-- Auth is now simple: Supabase Auth controls sign-in and org_members only maps
-- existing users to organizations/roles. New auth users are no longer
-- auto-attached to the Premier org as pending members.

-- Stop creating org memberships automatically for every new Auth user.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS handle_new_user();

-- Remove status-dependent policy before dropping the column it references.
DROP POLICY IF EXISTS "Owners and admins can manage member status" ON public.org_members;

-- Membership helper functions once again treat any org_members row as access to
-- that org. Account creation is controlled outside the app until invites land.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS UUID[] AS $$
  SELECT array_agg(org_id)
  FROM public.org_members
  WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.user_is_in_org(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id = target_org_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public, auth;

-- Remove pending/active/rejected state entirely. Remaining memberships are all
-- valid memberships.
ALTER TABLE public.org_members
  DROP COLUMN IF EXISTS status;
