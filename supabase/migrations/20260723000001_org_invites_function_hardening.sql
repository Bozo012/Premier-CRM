-- Security advisor flagged accept_org_invite() as callable by anon/authenticated
-- via PostgREST RPC (Postgres grants EXECUTE to PUBLIC by default on CREATE
-- FUNCTION, and the previous migration didn't revoke it). The function is
-- only ever meant to be called from the accept-invite server action via the
-- service-role client. Lock it down: revoke PUBLIC execute, and add a
-- defense-in-depth check so even a direct RPC call can't accept an invite on
-- someone else's behalf.

REVOKE EXECUTE ON FUNCTION public.accept_org_invite(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_org_invite(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_org_invite(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(UUID, UUID, TEXT) TO service_role;

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
  -- Defense in depth even though PUBLIC execute is revoked above: a
  -- service-role call has no JWT (auth.uid() is NULL); an authenticated
  -- call must be accepting its own invite, never someone else's.
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

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (v_invite.org_id, p_user_id, v_invite.role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.user_profiles (id, full_name)
  VALUES (p_user_id, coalesce(nullif(trim(p_full_name), ''), v_invite.full_name))
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  UPDATE public.org_invites
  SET status = 'accepted', accepted_at = now(), accepted_user_id = p_user_id
  WHERE id = v_invite.id;

  RETURN v_invite.org_id;
END;
$$;
