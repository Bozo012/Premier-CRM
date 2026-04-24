-- Premier CRM — Initial Schema
-- Migration: 0001_init
-- 
-- Foundation: extensions, organizations, users, RLS setup
-- Run this first. All subsequent migrations build on this.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- gin indexes on btree types
CREATE EXTENSION IF NOT EXISTS "citext";        -- case-insensitive text

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
-- Each org is a tenant. v1 = just Premier. Multi-tenant from day one for clean
-- open-source path.

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  email           CITEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  
  -- Branding
  logo_url        TEXT,
  primary_color   TEXT,
  
  -- Business settings
  default_labor_rate     NUMERIC(8,2),    -- loaded hourly rate
  default_markup_pct     NUMERIC(5,2) DEFAULT 25.0,
  default_quote_validity_days INTEGER DEFAULT 30,
  
  -- AI settings
  ai_enabled             BOOLEAN DEFAULT true,
  daily_briefing_enabled BOOLEAN DEFAULT true,
  daily_briefing_time    TIME DEFAULT '06:00',
  
  -- Subscription / metering (for future SaaS, ignored in self-host)
  ai_credits_monthly     INTEGER DEFAULT 100000,
  ai_credits_used        INTEGER DEFAULT 0,
  ai_credits_reset_at    TIMESTAMPTZ DEFAULT now(),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- USERS (extends Supabase auth.users)
-- ============================================================================
-- Supabase manages auth.users. We add a profile + org membership.

CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'employee', 'subcontractor', 'viewer');

CREATE TABLE org_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'employee',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX ON org_members (user_id);
CREATE INDEX ON org_members (org_id);

-- ============================================================================
-- HELPER FUNCTION: get user's org IDs
-- ============================================================================
-- Used in RLS policies. Returns array of org IDs the current user belongs to.

CREATE OR REPLACE FUNCTION user_org_ids() RETURNS UUID[] AS $$
  SELECT array_agg(org_id) FROM org_members WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_is_in_org(target_org_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members 
    WHERE user_id = auth.uid() AND org_id = target_org_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- HELPER: updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Orgs: see your own
CREATE POLICY "Users see their own orgs"
  ON organizations FOR SELECT
  USING (user_is_in_org(id));

CREATE POLICY "Owners can update their org"
  ON organizations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM org_members 
    WHERE org_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Profiles: see your own + others in your org
CREATE POLICY "Users see profiles in shared orgs"
  ON user_profiles FOR SELECT
  USING (
    id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM org_members om1
      JOIN org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid() AND om2.user_id = id
    )
  );

CREATE POLICY "Users update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- Memberships: see ones for orgs you're in
CREATE POLICY "Members see memberships in their orgs"
  ON org_members FOR SELECT
  USING (user_is_in_org(org_id));
