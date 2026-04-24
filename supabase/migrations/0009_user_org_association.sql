-- Premier CRM — User → Org Association
-- Migration: 0009_user_org_association
--
-- Adds automatic org association when a user signs up via Supabase Auth.
--
-- Behavior:
--   - First active user to sign up → Premier org, role 'owner', status 'active'
--   - Subsequent signups       → Premier org, role 'employee', status 'pending'
--     (owner updates role + status after approving)
--
-- Also:
--   - Adds `status` column to org_members
--   - Updates user_is_in_org() and user_org_ids() to respect status = 'active'
--   - Adds RLS policy so owners/admins can approve pending members

-- ============================================================================
-- EXTEND org_members WITH STATUS
-- ============================================================================

ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'rejected'));

-- Promote any existing owner rows to active.
-- On a fresh install this is a no-op; on re-run it's idempotent.
UPDATE org_members SET status = 'active' WHERE role = 'owner' AND status = 'pending';

-- ============================================================================
-- UPDATE HELPER FUNCTIONS TO RESPECT STATUS
-- ============================================================================
-- Active membership is the only membership that grants data access via RLS.
-- Pending users can sign in but see nothing until an owner approves them.

CREATE OR REPLACE FUNCTION user_is_in_org(target_org_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id    = auth.uid()
      AND org_id     = target_org_id
      AND status     = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_org_ids() RETURNS UUID[] AS $$
  SELECT array_agg(org_id)
  FROM org_members
  WHERE user_id = auth.uid()
    AND status  = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- HANDLE NEW USER — creates profile + joins Premier org
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  premier_org_id      UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  active_member_count INTEGER;
  new_role            user_role;
  new_status          TEXT;
BEGIN
  -- Create the user's profile row
  INSERT INTO user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Determine role + status based on whether anyone already owns the org
  SELECT COUNT(*) INTO active_member_count
  FROM org_members
  WHERE org_id = premier_org_id
    AND status = 'active';

  IF active_member_count = 0 THEN
    -- First active user becomes the owner
    new_role   := 'owner';
    new_status := 'active';
  ELSE
    -- All subsequent signups wait for owner approval
    -- Owner can then set the appropriate role (admin / employee / subcontractor)
    new_role   := 'employee';
    new_status := 'pending';
  END IF;

  INSERT INTO org_members (org_id, user_id, role, status)
  VALUES (premier_org_id, NEW.id, new_role, new_status)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- WIRE TRIGGER TO auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- RLS: owners and admins can approve / reject pending members
-- ============================================================================

CREATE POLICY "Owners and admins can manage member status"
  ON org_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members my_row
      WHERE my_row.org_id  = org_members.org_id
        AND my_row.user_id = auth.uid()
        AND my_row.role    IN ('owner', 'admin')
        AND my_row.status  = 'active'
    )
  );
