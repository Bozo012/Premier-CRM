-- accept_org_invite() inserts the new org_members row without setting
-- `status`, so it silently takes the column's default ('pending' — see
-- 0009_user_org_association.sql). user_is_in_org() (also from 0009) requires
-- status = 'active' for RLS to recognize the membership, and no code
-- anywhere in apps/web ever sets org_members.status — there is no "approve
-- pending member" UI at all. The practical effect: every invite acceptance
-- to date completes (redirects to /today) but leaves the new member
-- permanently locked out of all org-scoped data behind RLS, with only a
-- generic "no organization membership was found" message and no way for an
-- owner to fix it through the app. Confirmed live: two real pending invites
-- to Brandon (org_invites rows, both still status='pending', never
-- accepted) plus this exact bug independently reproduced and manually
-- worked around for a dedicated E2E test account earlier in this project.
--
-- Fix: accepting an invite is itself the approval step — there is no
-- separate manual-approval UI in the intended product design (Kevin invites
-- Brandon with a specific role; Brandon accepting that invite should grant
-- him access immediately, not leave him in limbo). Set status = 'active' on
-- insert, and reactivate on conflict in case a stale row already exists.

CREATE OR REPLACE FUNCTION public.accept_org_invite(
  p_token UUID,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.org_invites%ROWTYPE;
  v_user_email TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot accept an invite on behalf of another user.';
  END IF;

  SELECT * INTO v_invite FROM public.org_invites WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found.';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'This invite has already been used or is no longer valid.';
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.org_invites SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'This invite has expired.';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invite was issued to a different email address.';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (v_invite.org_id, p_user_id, v_invite.role, 'active')
  ON CONFLICT (org_id, user_id) DO UPDATE SET status = 'active';

  INSERT INTO public.user_profiles (id, full_name)
  VALUES (p_user_id, coalesce(nullif(trim(p_full_name), ''), v_invite.full_name))
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  UPDATE public.org_invites
  SET status = 'accepted', accepted_at = now(), accepted_user_id = p_user_id
  WHERE id = v_invite.id;

  RETURN v_invite.org_id;
END;
$$;
