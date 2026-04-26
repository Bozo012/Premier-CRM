-- Premier CRM — Location, Geofences, Trips & Automation Engine
-- Migration: 0005_location_and_automation
--
-- Adds location as a first-class signal across the system:
--   - Raw location event stream from mobile
--   - Geofences (auto-generated from properties + manual)
--   - Geofence enter/exit events
--   - Trips (derived from location events between stops)
--   - Hierarchical preferences (org > user > customer > job)
--   - Automation rules engine (trigger + conditions + actions)
--
-- Integrates with: time_entries, vault_items, jobs, properties, communications

-- ============================================================================
-- EXTEND EXISTING ENUMS
-- ============================================================================

ALTER TYPE vault_item_type ADD VALUE IF NOT EXISTS 'site_arrival';
ALTER TYPE vault_item_type ADD VALUE IF NOT EXISTS 'site_departure';
ALTER TYPE vault_item_type ADD VALUE IF NOT EXISTS 'drive';

ALTER TYPE vault_source ADD VALUE IF NOT EXISTS 'geofence_event';
ALTER TYPE vault_source ADD VALUE IF NOT EXISTS 'automation';

-- ============================================================================
-- EXTEND EXISTING TABLES
-- ============================================================================

-- time_entries: auto-generation metadata
ALTER TABLE time_entries 
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_geofence_event_id UUID,
  ADD COLUMN IF NOT EXISTS exit_geofence_event_id UUID,
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS entry_kind TEXT DEFAULT 'on_site';  -- 'on_site', 'drive', 'supply_run'

-- jobs: drive time rollups
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS total_drive_time_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_drive_miles NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_drive_cost NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_on_site_minutes INTEGER DEFAULT 0;

-- properties: geofence auto-config
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER,  -- null = use user/org default
  ADD COLUMN IF NOT EXISTS geofence_center GEOGRAPHY(POINT, 4326),  -- defaults to location, override for rural
  ADD COLUMN IF NOT EXISTS hide_from_auto_tracking BOOLEAN DEFAULT false;

-- ============================================================================
-- LOCATION EVENTS — raw stream from mobile
-- ============================================================================
-- Downsampled on write (adaptive: 30s-5min depending on motion/context).
-- Partitioned by week for efficient retention purging.

CREATE TABLE location_events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  accuracy_meters NUMERIC(7,1),
  speed_mps       NUMERIC(6,2),             -- meters/sec; null if stationary
  heading_deg     NUMERIC(5,1),             -- 0-359
  altitude_m      NUMERIC(7,1),
  battery_level   NUMERIC(3,2),             -- 0.0-1.0
  
  -- OS-provided activity
  activity        TEXT,                     -- 'still', 'walking', 'running', 'cycling', 'automotive', 'unknown'
  activity_confidence NUMERIC(3,2),
  
  -- Source context
  is_background   BOOLEAN DEFAULT false,    -- was app backgrounded
  source          TEXT DEFAULT 'mobile',    -- 'mobile', 'web', 'manual'
  
  recorded_at     TIMESTAMPTZ NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Initial partitions (create more as needed via cron)
CREATE TABLE location_events_2026_q2 PARTITION OF location_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE location_events_2026_q3 PARTITION OF location_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE location_events_2026_q4 PARTITION OF location_events
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE INDEX ON location_events USING gist (location);
CREATE INDEX ON location_events (user_id, recorded_at DESC);
CREATE INDEX ON location_events (org_id, recorded_at DESC);

-- ============================================================================
-- GEOFENCES
-- ============================================================================

CREATE TYPE geofence_type AS ENUM (
  'property',      -- customer property
  'home',          -- user's home base
  'shop',          -- business location / garage
  'supplier',      -- Home Depot, Lowe's, Ferguson, etc.
  'custom'         -- user-defined
);

CREATE TABLE geofences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- What this fence represents
  type            geofence_type NOT NULL,
  label           TEXT NOT NULL,           -- "Emily's house", "Home Depot Florence", etc.
  property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,   -- temp fences for specific jobs
  
  -- Shape
  center          GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_meters   INTEGER NOT NULL DEFAULT 75,
  -- Future: could add POLYGON support for irregular commercial properties
  
  -- Behavior
  is_active       BOOLEAN DEFAULT true,
  min_dwell_seconds INTEGER DEFAULT 120,    -- must stay inside this long to count as "arrived"
  min_absence_seconds INTEGER DEFAULT 60,   -- must be outside this long to count as "departed"
  
  -- Scope
  applies_to_users UUID[],                  -- null = all org users; otherwise restrict
  
  -- Metadata
  notes           TEXT,
  auto_generated  BOOLEAN DEFAULT false,    -- true if created from a property record
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON geofences USING gist (center);
CREATE INDEX ON geofences (org_id, is_active);
CREATE INDEX ON geofences (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX ON geofences (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX ON geofences (type, is_active);

CREATE TRIGGER geofences_updated_at BEFORE UPDATE ON geofences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a geofence whenever a property is created with a location
CREATE OR REPLACE FUNCTION auto_create_property_geofence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location IS NOT NULL AND NOT NEW.hide_from_auto_tracking THEN
    INSERT INTO geofences (
      org_id, type, label, property_id, center, radius_meters, auto_generated
    ) VALUES (
      NEW.org_id,
      'property',
      COALESCE(NEW.address_line_1, 'Property') || 
        CASE WHEN NEW.city IS NOT NULL THEN ', ' || NEW.city ELSE '' END,
      NEW.id,
      COALESCE(NEW.geofence_center, NEW.location),
      COALESCE(NEW.geofence_radius_m, 75),
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER properties_auto_geofence
  AFTER INSERT OR UPDATE OF location, geofence_center, geofence_radius_m, hide_from_auto_tracking
  ON properties
  FOR EACH ROW EXECUTE FUNCTION auto_create_property_geofence();

-- ============================================================================
-- GEOFENCE EVENTS — enter/exit
-- ============================================================================

CREATE TYPE geofence_event_type AS ENUM ('entered', 'exited', 'dwelled');

CREATE TABLE geofence_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geofence_id     UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  
  event_type      geofence_event_type NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  
  -- Location at event
  location        GEOGRAPHY(POINT, 4326),
  accuracy_meters NUMERIC(7,1),
  
  -- Confidence / quality
  confidence      NUMERIC(3,2) DEFAULT 1.0,    -- lower if GPS was sketchy
  dwell_seconds   INTEGER,                      -- for 'exited' events
  
  -- Linked records (filled in by automation engine)
  time_entry_id   UUID REFERENCES time_entries(id),
  trip_id         UUID,                         -- set after trip reconstruction
  vault_item_id   UUID REFERENCES vault_items(id),
  
  -- Was any automation rule fired by this event
  automation_fired BOOLEAN DEFAULT false,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON geofence_events (user_id, occurred_at DESC);
CREATE INDEX ON geofence_events (geofence_id, occurred_at DESC);
CREATE INDEX ON geofence_events (org_id, event_type, occurred_at DESC);
CREATE INDEX ON geofence_events (automation_fired, occurred_at) 
  WHERE automation_fired = false;

-- Now we can add the FK references back from time_entries
ALTER TABLE time_entries 
  ADD CONSTRAINT time_entries_entry_event_fk 
    FOREIGN KEY (entry_geofence_event_id) REFERENCES geofence_events(id),
  ADD CONSTRAINT time_entries_exit_event_fk 
    FOREIGN KEY (exit_geofence_event_id) REFERENCES geofence_events(id);

-- ============================================================================
-- TRIPS — derived drive segments between stops
-- ============================================================================

CREATE TYPE trip_purpose AS ENUM (
  'to_job',        -- heading to a job site
  'from_job',      -- leaving a job site
  'between_jobs',  -- direct job-to-job
  'supply_run',    -- to/from supplier during active work day
  'commute',       -- home to shop or shop to home, non-billable
  'personal',      -- explicitly personal
  'unknown'
);

CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Endpoints
  start_location  GEOGRAPHY(POINT, 4326) NOT NULL,
  end_location    GEOGRAPHY(POINT, 4326) NOT NULL,
  start_geofence_id UUID REFERENCES geofences(id),
  end_geofence_id   UUID REFERENCES geofences(id),
  start_address   TEXT,                    -- reverse-geocoded for display
  end_address     TEXT,
  
  -- Timing
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
  ) STORED,
  
  -- Distance
  distance_meters INTEGER NOT NULL DEFAULT 0,
  route_polyline  TEXT,                    -- encoded polyline from Directions API
  
  miles           NUMERIC(8,2) GENERATED ALWAYS AS (distance_meters / 1609.344) STORED,
  
  -- Classification
  purpose         trip_purpose DEFAULT 'unknown',
  job_id          UUID REFERENCES jobs(id),
  is_billable     BOOLEAN DEFAULT false,
  
  -- Vehicle cost (snapshotted at time of trip so retroactive rate changes don't distort)
  mileage_rate    NUMERIC(5,3),            -- e.g. 0.670 for IRS 2024
  mileage_cost    NUMERIC(10,2),
  
  -- Quality flags
  has_gap         BOOLEAN DEFAULT false,   -- GPS dropout mid-trip
  implausible_speed BOOLEAN DEFAULT false, -- >85mph sustained, flag for review
  user_reviewed   BOOLEAN DEFAULT false,
  user_override_purpose trip_purpose,      -- user corrected the classification
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON trips (user_id, started_at DESC);
CREATE INDEX ON trips (job_id, started_at) WHERE job_id IS NOT NULL;
CREATE INDEX ON trips (org_id, started_at DESC);
CREATE INDEX ON trips (user_reviewed, started_at DESC) WHERE user_reviewed = false;

CREATE TRIGGER trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Back-fill trip_id on geofence_events once trips are created
-- (done by application code, not a trigger — ordering matters)

-- ============================================================================
-- HIERARCHICAL LOCATION PREFERENCES
-- ============================================================================
-- org defaults (stored in organizations) → user prefs → customer prefs → job prefs

-- User-level
CREATE TABLE user_location_prefs (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Master toggle
  tracking_enabled BOOLEAN DEFAULT true,
  
  -- When to track (JSON for flexibility)
  -- Format: {"mon": [["07:00","18:00"]], "tue": [...], ...}
  business_hours  JSONB DEFAULT '{
    "mon": [["07:00","18:00"]],
    "tue": [["07:00","18:00"]],
    "wed": [["07:00","18:00"]],
    "thu": [["07:00","18:00"]],
    "fri": [["07:00","18:00"]],
    "sat": [],
    "sun": []
  }'::jsonb,
  
  track_outside_business_hours BOOLEAN DEFAULT false,
  vacation_mode   BOOLEAN DEFAULT false,
  vacation_until  DATE,
  
  -- How to track
  gps_mode        TEXT DEFAULT 'balanced',     -- 'battery_saver', 'balanced', 'high_accuracy'
  default_geofence_radius_m INTEGER DEFAULT 75,
  default_dwell_seconds INTEGER DEFAULT 120,
  
  -- What the system does with data
  auto_create_time_entries BOOLEAN DEFAULT true,
  require_confirmation BOOLEAN DEFAULT true,
  auto_classify_trips BOOLEAN DEFAULT true,
  
  -- Mileage
  mileage_rate_override NUMERIC(5,3),          -- null = use IRS default
  default_trip_billable BOOLEAN DEFAULT false, -- false = most drives aren't billed
  
  -- Notifications (per-automation toggles)
  notification_prefs JSONB DEFAULT '{
    "on_arrival_prompt": true,
    "on_dwell_overrun": true,
    "on_exit_without_invoice": true,
    "on_approach_next_job": true,
    "daily_tracking_summary": true
  }'::jsonb,
  
  -- Data retention
  raw_location_retention_days INTEGER DEFAULT 30,
  
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER user_location_prefs_updated_at BEFORE UPDATE ON user_location_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Customer-level overrides
CREATE TABLE customer_location_prefs (
  customer_id     UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Geofence tuning
  geofence_radius_m INTEGER,                   -- null = inherit
  
  -- Customer-facing notifications
  send_arrival_notification BOOLEAN DEFAULT true,
  arrival_notification_lead_minutes INTEGER DEFAULT 30,
  send_on_the_way_texts BOOLEAN DEFAULT true,
  send_departure_summary BOOLEAN DEFAULT false,  -- "here's what we did today"
  
  -- Quiet hours (respect customer's schedule)
  quiet_hours_start TIME,                       -- e.g. '20:00'
  quiet_hours_end   TIME,                       -- e.g. '08:00'
  
  -- Billing
  bill_drive_time BOOLEAN DEFAULT false,
  
  -- Special flags
  is_home_sensitive BOOLEAN DEFAULT false,      -- suppress early arrival pings
  is_commercial_recurring BOOLEAN DEFAULT false, -- fewer pings needed
  
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER customer_location_prefs_updated_at BEFORE UPDATE ON customer_location_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Job-level (most specific)
CREATE TABLE job_location_prefs (
  job_id          UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  
  tracking_enabled BOOLEAN,                     -- null = inherit
  geofence_radius_m INTEGER,
  bill_drive_time BOOLEAN,
  allow_after_hours BOOLEAN DEFAULT false,
  
  -- Job-specific notification overrides
  send_arrival_notification BOOLEAN,
  arrival_notification_lead_minutes INTEGER,
  
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER job_location_prefs_updated_at BEFORE UPDATE ON job_location_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- EFFECTIVE PREFS RESOLVER — inheritance chain in one query
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_location_prefs(
  p_user_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_job_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'tracking_enabled', COALESCE(
      (SELECT tracking_enabled FROM job_location_prefs WHERE job_id = p_job_id),
      (SELECT tracking_enabled FROM user_location_prefs WHERE user_id = p_user_id),
      true
    ),
    'geofence_radius_m', COALESCE(
      (SELECT geofence_radius_m FROM job_location_prefs WHERE job_id = p_job_id),
      (SELECT geofence_radius_m FROM customer_location_prefs WHERE customer_id = p_customer_id),
      (SELECT default_geofence_radius_m FROM user_location_prefs WHERE user_id = p_user_id),
      75
    ),
    'bill_drive_time', COALESCE(
      (SELECT bill_drive_time FROM job_location_prefs WHERE job_id = p_job_id),
      (SELECT bill_drive_time FROM customer_location_prefs WHERE customer_id = p_customer_id),
      (SELECT default_trip_billable FROM user_location_prefs WHERE user_id = p_user_id),
      false
    ),
    'send_arrival_notification', COALESCE(
      (SELECT send_arrival_notification FROM job_location_prefs WHERE job_id = p_job_id),
      (SELECT send_arrival_notification FROM customer_location_prefs WHERE customer_id = p_customer_id),
      true
    ),
    'arrival_notification_lead_minutes', COALESCE(
      (SELECT arrival_notification_lead_minutes FROM job_location_prefs WHERE job_id = p_job_id),
      (SELECT arrival_notification_lead_minutes FROM customer_location_prefs WHERE customer_id = p_customer_id),
      30
    ),
    'allow_after_hours', COALESCE(
      (SELECT allow_after_hours FROM job_location_prefs WHERE job_id = p_job_id),
      false
    ),
    'quiet_hours_start', (SELECT quiet_hours_start FROM customer_location_prefs WHERE customer_id = p_customer_id),
    'quiet_hours_end',   (SELECT quiet_hours_end FROM customer_location_prefs WHERE customer_id = p_customer_id),
    'auto_create_time_entries', COALESCE(
      (SELECT auto_create_time_entries FROM user_location_prefs WHERE user_id = p_user_id),
      true
    ),
    'require_confirmation', COALESCE(
      (SELECT require_confirmation FROM user_location_prefs WHERE user_id = p_user_id),
      true
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- AUTOMATION RULES ENGINE
-- ============================================================================

CREATE TABLE automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = org-wide
  
  name            TEXT NOT NULL,
  description     TEXT,                        -- plain-English for display
  icon            TEXT,                        -- emoji or icon name
  
  -- Trigger: what event starts evaluation
  -- Known types: 'geofence_entered', 'geofence_exited', 'geofence_dwelled',
  --   'trip_started', 'trip_ended', 'trip_classified',
  --   'job_status_changed', 'quote_sent', 'quote_viewed', 'quote_stale',
  --   'invoice_overdue', 'scheduled_time', 'approaching_geofence',
  --   'capture_uploaded', 'communication_received'
  trigger_type    TEXT NOT NULL,
  trigger_config  JSONB DEFAULT '{}'::jsonb,  -- trigger-specific params
  
  -- Conditions: array of clauses, all must match (AND)
  -- Each clause: { "path": "event.geofence.type", "op": "equals", "value": "property" }
  conditions      JSONB DEFAULT '[]'::jsonb,
  
  -- Actions: array, executed in order
  -- Each: { "type": "create_time_entry", "config": {...} }
  -- Known action types: 'create_time_entry', 'close_time_entry', 'send_sms',
  --   'send_email', 'push_notification', 'prompt_user', 'create_task',
  --   'advance_job_status', 'draft_invoice', 'tag_vault_items',
  --   'create_automation_rule', 'run_tool'
  actions         JSONB DEFAULT '[]'::jsonb,
  
  -- Scope limits
  applies_to_customer_ids UUID[],   -- restrict to specific customers
  applies_to_job_ids      UUID[],   -- restrict to specific jobs
  applies_to_geofence_types geofence_type[],
  
  -- State
  is_enabled      BOOLEAN DEFAULT true,
  is_system_default BOOLEAN DEFAULT false,    -- seeded; user can disable but not delete
  
  -- Rate limiting
  cooldown_seconds INTEGER DEFAULT 0,          -- min gap between firings per entity
  max_fires_per_day INTEGER,                   -- null = unlimited
  
  -- Stats
  times_triggered INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON automation_rules (org_id, trigger_type, is_enabled) WHERE is_enabled;
CREATE INDEX ON automation_rules (user_id, is_enabled) WHERE user_id IS NOT NULL;

CREATE TRIGGER automation_rules_updated_at BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Execution log
CREATE TABLE automation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  
  -- What triggered
  trigger_event_type TEXT NOT NULL,
  trigger_payload JSONB,
  
  -- What happened
  conditions_passed BOOLEAN,
  conditions_failed_at INTEGER,                -- index of failed condition, for debugging
  actions_planned JSONB,
  actions_executed JSONB,                      -- [{type, status, result, error}]
  
  -- Overall outcome
  outcome         TEXT NOT NULL,               -- 'succeeded', 'skipped', 'partial', 'failed'
  error_message   TEXT,
  
  -- User interaction (for prompt-type actions)
  user_response   JSONB,                       -- {action: 'approved'|'rejected'|'edited', ...}
  user_responded_at TIMESTAMPTZ,
  
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON automation_events (rule_id, occurred_at DESC);
CREATE INDEX ON automation_events (org_id, occurred_at DESC);
CREATE INDEX ON automation_events (outcome, occurred_at DESC) WHERE outcome = 'failed';

-- ============================================================================
-- PENDING PROMPTS — user-facing automation prompts awaiting response
-- ============================================================================
-- When an automation's action is "prompt_user", it creates a row here.
-- Mobile/web app queries this for unanswered prompts.

CREATE TYPE prompt_status AS ENUM ('pending', 'approved', 'rejected', 'snoozed', 'expired', 'auto_resolved');

CREATE TABLE user_prompts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_event_id UUID REFERENCES automation_events(id),
  
  -- Prompt content
  prompt_type     TEXT NOT NULL,               -- 'close_out_job', 'draft_invoice', 'confirm_time', etc.
  title           TEXT NOT NULL,
  body            TEXT,
  
  -- Context (which job/customer/etc this is about)
  job_id          UUID REFERENCES jobs(id),
  customer_id     UUID REFERENCES customers(id),
  
  -- Options presented to user
  options         JSONB,                        -- [{id, label, primary: bool}]
  default_option_id TEXT,                       -- what happens on snooze/timeout
  
  -- Associated data (e.g., draft invoice data, suggested text, etc.)
  payload         JSONB,
  
  -- State
  status          prompt_status DEFAULT 'pending',
  priority        task_priority DEFAULT 'normal',
  
  -- Timing
  expires_at      TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  response        JSONB,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON user_prompts (user_id, status) WHERE status IN ('pending', 'snoozed');
CREATE INDEX ON user_prompts (org_id, status, created_at DESC);
CREATE INDEX ON user_prompts (job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- HELPER: find active geofences for a location
-- ============================================================================

CREATE OR REPLACE FUNCTION geofences_containing_point(
  p_org_id UUID,
  p_point GEOGRAPHY,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  geofence_id UUID,
  label TEXT,
  type geofence_type,
  distance_m NUMERIC,
  property_id UUID,
  job_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    g.id,
    g.label,
    g.type,
    ST_Distance(g.center, p_point)::NUMERIC,
    g.property_id,
    g.job_id
  FROM geofences g
  WHERE g.org_id = p_org_id
    AND g.is_active
    AND ST_DWithin(g.center, p_point, g.radius_meters)
    AND (g.applies_to_users IS NULL OR p_user_id = ANY(g.applies_to_users))
  ORDER BY ST_Distance(g.center, p_point);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- HELPER: rollup job time and costs from time_entries + trips
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_job_time_rollup(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE jobs SET
    total_on_site_minutes = (
      SELECT COALESCE(SUM(duration_minutes), 0)::INTEGER
      FROM time_entries 
      WHERE job_id = p_job_id 
        AND entry_kind = 'on_site'
        AND ended_at IS NOT NULL
    ),
    total_drive_time_seconds = (
      SELECT COALESCE(SUM(duration_seconds), 0)::INTEGER
      FROM trips
      WHERE job_id = p_job_id
        AND is_billable
    ),
    total_drive_miles = (
      SELECT COALESCE(SUM(miles), 0)
      FROM trips
      WHERE job_id = p_job_id
        AND is_billable
    ),
    total_drive_cost = (
      SELECT COALESCE(SUM(mileage_cost), 0)
      FROM trips
      WHERE job_id = p_job_id
        AND is_billable
    )
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CAPTURE ENRICHMENT: auto-link vault items to geofences at capture time
-- ============================================================================
-- Runs on insert/update of vault_items with location set.
-- If the capture location is inside a geofence AND entity IDs aren't set,
-- auto-populate them with high confidence.

CREATE OR REPLACE FUNCTION enrich_vault_item_from_location()
RETURNS TRIGGER AS $$
DECLARE
  matching_fence RECORD;
  active_job_id UUID;
BEGIN
  -- Only enrich if we have location but missing entity links
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Already linked? Skip.
  IF NEW.customer_id IS NOT NULL AND NEW.property_id IS NOT NULL AND NEW.job_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find the tightest containing geofence
  SELECT * INTO matching_fence
  FROM geofences_containing_point(NEW.org_id, NEW.location, NEW.created_by)
  WHERE property_id IS NOT NULL
  LIMIT 1;
  
  IF FOUND THEN
    -- Set property if not already set
    IF NEW.property_id IS NULL THEN
      NEW.property_id := matching_fence.property_id;
    END IF;
    
    -- Set customer from property's primary owner
    IF NEW.customer_id IS NULL THEN
      SELECT cp.customer_id INTO NEW.customer_id
      FROM customer_properties cp
      WHERE cp.property_id = matching_fence.property_id
        AND cp.is_primary = true
      LIMIT 1;
      
      IF NEW.customer_id IS NULL THEN
        -- fallback to any current owner
        SELECT cp.customer_id INTO NEW.customer_id
        FROM customer_properties cp
        JOIN customers c ON c.id = cp.customer_id
        WHERE cp.property_id = matching_fence.property_id
          AND NOT c.is_archived
          AND cp.relationship IN ('owner', 'manager', 'tenant')
        LIMIT 1;
      END IF;
    END IF;
    
    -- Set job to currently-active job at this property, if any
    IF NEW.job_id IS NULL THEN
      SELECT j.id INTO NEW.job_id
      FROM jobs j
      WHERE j.property_id = matching_fence.property_id
        AND j.status IN ('scheduled', 'in_progress', 'approved')
      ORDER BY 
        CASE WHEN j.status = 'in_progress' THEN 0 ELSE 1 END,
        j.scheduled_start DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_items_location_enrich
  BEFORE INSERT OR UPDATE OF location ON vault_items
  FOR EACH ROW EXECUTE FUNCTION enrich_vault_item_from_location();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_location_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_location_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

-- Org isolation with user scoping where sensitive
CREATE POLICY "org_isolation_location_events" ON location_events
  FOR ALL USING (user_is_in_org(org_id) AND (user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))));

CREATE POLICY "org_isolation_geofences" ON geofences
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "org_isolation_geofence_events" ON geofence_events
  FOR ALL USING (user_is_in_org(org_id) AND (user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))));

CREATE POLICY "org_isolation_trips" ON trips
  FOR ALL USING (user_is_in_org(org_id) AND (user_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('owner','admin'))));

CREATE POLICY "own_user_location_prefs" ON user_location_prefs
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "customer_prefs_via_customer" ON customer_location_prefs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM customers WHERE id = customer_id AND user_is_in_org(org_id))
  );

CREATE POLICY "job_prefs_via_job" ON job_location_prefs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND user_is_in_org(org_id))
  );

CREATE POLICY "org_isolation_automation_rules" ON automation_rules
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "org_isolation_automation_events" ON automation_events
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "own_user_prompts" ON user_prompts
  FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- DATA RETENTION: purge old raw location events
-- ============================================================================
-- Run daily via cron. Keeps trips and geofence events permanently, but raw pings
-- are just training/reconstruction data that becomes noise after ~30 days.

CREATE OR REPLACE FUNCTION purge_old_location_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Per-user retention based on their prefs
  WITH deletions AS (
    DELETE FROM location_events le
    USING user_location_prefs p
    WHERE le.user_id = p.user_id
      AND le.recorded_at < now() - (p.raw_location_retention_days || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deletions;
  
  -- Fallback purge for users without prefs (30 day default)
  DELETE FROM location_events le
  WHERE NOT EXISTS (SELECT 1 FROM user_location_prefs WHERE user_id = le.user_id)
    AND le.recorded_at < now() - INTERVAL '30 days';
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
