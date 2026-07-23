-- Team invites: org_members already has a role column (user_role enum:
-- owner/admin/employee/subcontractor/viewer, from 0001_init.sql) which
-- already satisfies "at least owner/staff" — no new role field needed there.
-- What's missing is a way to represent an invite BEFORE the invitee has a
-- Supabase Auth account: org_members.user_id is NOT NULL FK to auth.users,
-- so a "pending org_members row" isn't representable in that table (0012
-- deliberately dropped the old pending-approval status column and its
-- auto-join trigger — "account creation is controlled outside the app until
-- invites land"). This adds a dedicated org_invites table instead.

CREATE TYPE public.org_invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE public.org_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  role              public.user_role NOT NULL DEFAULT 'employee',
  status            public.org_invite_status NOT NULL DEFAULT 'pending',
  token             UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at       TIMESTAMPTZ,
  accepted_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT org_invites_token_unique UNIQUE (token),
  -- Invites are always issued as staff roles; owner is granted by an
  -- existing owner directly in org_members, never through this flow.
  CONSTRAINT org_invites_role_not_owner CHECK (role <> 'owner')
);

CREATE INDEX org_invites_org_status_idx ON public.org_invites (org_id, status);

-- One live pending invite per (org, email) at a time; a revoked/expired/
-- accepted invite doesn't block re-inviting the same address later.
CREATE UNIQUE INDEX org_invites_org_email_pending_idx
  ON public.org_invites (org_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_org_invites" ON public.org_invites
  FOR ALL
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

-- Atomically accept an invite once the invitee has a fresh Supabase Auth
-- account: creates the org_members row + user_profiles row and marks the
-- invite accepted in one transaction, mirroring the atomicity approach
-- already used for apply_payment_to_invoice() (20260722000000).
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

GRANT EXECUTE ON FUNCTION public.accept_org_invite(UUID, UUID, TEXT) TO service_role;

-- Both of Kevin's accounts should be 'owner' (confirmed): kevinsommers@ppmnky.com
-- already is; sommerskevin3@gmail.com was 'admin' pending a real second staff
-- user to justify building the invite feature at all — this is that feature.
UPDATE public.org_members
SET role = 'owner'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'sommerskevin3@gmail.com')
  AND role <> 'owner';
