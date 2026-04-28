-- Premier CRM — Fix auth trigger and dashboard permissions
-- Migration: 0010_fix_auth_trigger_and_dashboard_permissions
--
-- Fixes three issues discovered after initial deploy:
--
--   1. handle_new_user() runs in the auth schema context (triggered by
--      auth.users). Without explicit schema qualification and a pinned
--      search_path, unqualified table names like "user_profiles" resolve
--      against the auth schema and fail with "relation does not exist".
--
--   2. user_is_in_org() and user_org_ids() are SECURITY DEFINER functions
--      that run as the definer. Without SET search_path the search_path is
--      caller-controlled, which is a security risk (search_path injection).
--      Pin search_path = public, auth on all three functions.
--
--   3. The authenticated role lacks explicit GRANT on public schema tables.
--      Supabase sets up grants on tables created before the project launches,
--      but migrations that add tables after the initial setup may not get
--      them automatically. Grant SELECT/INSERT/UPDATE/DELETE on all CRM
--      tables so RLS (not missing grants) is the only access control layer.

-- ============================================================================
-- 1. HARDENED HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS UUID[] AS $$
  SELECT array_agg(org_id)
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND status  = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.user_is_in_org(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id  = auth.uid()
      AND org_id   = target_org_id
      AND status   = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public, auth;

-- ============================================================================
-- 2. SCHEMA-QUALIFIED handle_new_user()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  premier_org_id      UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  active_member_count INTEGER;
  new_role            public.user_role;
  new_status          TEXT;
BEGIN
  -- Create the user's profile row (schema-qualified to resolve correctly
  -- when this trigger fires in the auth schema context)
  INSERT INTO public.user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Determine role + status based on active owner count
  SELECT COUNT(*) INTO active_member_count
  FROM public.org_members
  WHERE org_id = premier_org_id
    AND status = 'active';

  IF active_member_count = 0 THEN
    -- First active sign-up becomes the owner
    new_role   := 'owner';
    new_status := 'active';
  ELSE
    -- Subsequent sign-ups wait for owner approval
    new_role   := 'employee';
    new_status := 'pending';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (premier_org_id, NEW.id, new_role, new_status)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, auth;

-- Re-wire the trigger so it calls the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 3. AUTHENTICATED ROLE GRANTS (dashboard permissions)
-- ============================================================================
-- RLS is the real gate; these grants just let the authenticated role attempt
-- queries at all. Without GRANT, queries fail before RLS even evaluates.

GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Foundation (0001)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members            TO authenticated;

-- CRM core (0002)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_properties    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_categories     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_materials      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_prices        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_phases             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_line_items       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_material_uses      TO authenticated;

-- Vault + communications (0003)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_items            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_actions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_briefings        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_events        TO authenticated;

-- Location + automation (0005)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_events        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofences              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofence_events        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_location_prefs    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_location_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_location_prefs     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_events      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_prompts           TO authenticated;

-- Catalog + policy (0007)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_archetype_defaults TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_pricing_policy     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_guardrails      TO authenticated;

-- Function execute grants
GRANT EXECUTE ON FUNCTION public.user_org_ids()             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_in_org(UUID)       TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at()           TO authenticated;
