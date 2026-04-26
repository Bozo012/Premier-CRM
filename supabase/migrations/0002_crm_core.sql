-- Premier CRM — Core CRM Tables
-- Migration: 0002_crm_core
--
-- Customers, properties, jobs, quotes, invoices, communications.
-- The structured layer of the brain.

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

CREATE TYPE customer_type AS ENUM ('residential', 'commercial', 'property_manager');
CREATE TYPE preferred_channel AS ENUM ('sms', 'email', 'call', 'portal');

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Identity
  type            customer_type NOT NULL DEFAULT 'residential',
  first_name      TEXT,
  last_name       TEXT,
  company_name    TEXT,
  display_name    TEXT GENERATED ALWAYS AS (
    COALESCE(company_name, NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''))
  ) STORED,
  
  -- Contact
  email           CITEXT,
  phone_primary   TEXT,
  phone_secondary TEXT,
  preferred_channel preferred_channel DEFAULT 'sms',
  
  -- Notes & metadata
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  source          TEXT,        -- 'referral', 'google', 'instaquote', etc.
  referred_by_id  UUID REFERENCES customers(id),
  
  -- Status
  is_archived     BOOLEAN DEFAULT false,
  
  -- Stats (denormalized, updated via triggers)
  total_jobs              INTEGER DEFAULT 0,
  total_revenue           NUMERIC(12,2) DEFAULT 0,
  last_contact_at         TIMESTAMPTZ,
  last_job_completed_at   TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON customers (org_id);
CREATE INDEX ON customers (org_id, is_archived);
CREATE INDEX ON customers USING gin (display_name gin_trgm_ops);
CREATE INDEX ON customers USING gin (tags);
CREATE INDEX ON customers (last_contact_at DESC NULLS LAST);

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PROPERTIES
-- ============================================================================
-- Properties are first-class. They survive customer changes (next owner).

CREATE TABLE properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Address
  address_line_1  TEXT NOT NULL,
  address_line_2  TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  zip             TEXT NOT NULL,
  country         TEXT DEFAULT 'US',
  
  -- Geographic
  location        GEOGRAPHY(POINT, 4326),
  geocoded_at     TIMESTAMPTZ,
  
  -- Property info
  property_type   TEXT,        -- 'single_family', 'condo', 'commercial', etc.
  year_built      INTEGER,
  square_footage  INTEGER,
  lot_size_sqft   INTEGER,
  stories         INTEGER,
  
  -- Access
  gate_code       TEXT,
  access_notes    TEXT,        -- "side gate, watch for dog"
  parking_notes   TEXT,
  hazards         TEXT[],      -- ['dog', 'aggressive_neighbor', 'low_clearance']
  
  -- Metadata
  notes           TEXT,
  satellite_image_url TEXT,
  street_view_url     TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON properties (org_id);
CREATE INDEX ON properties USING gist (location);
CREATE INDEX ON properties (zip);
CREATE INDEX ON properties USING gin (
  to_tsvector('english', 
    COALESCE(address_line_1, '') || ' ' ||
    COALESCE(city, '') || ' ' ||
    COALESCE(state, '') || ' ' ||
    COALESCE(zip, '')
  )
);

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Customer ↔ Property (many-to-many; one property can have multiple owners over time)
CREATE TABLE customer_properties (
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  relationship    TEXT DEFAULT 'owner',   -- 'owner', 'manager', 'tenant', 'former_owner'
  is_primary      BOOLEAN DEFAULT false,
  start_date      DATE,
  end_date        DATE,
  PRIMARY KEY (customer_id, property_id)
);

CREATE INDEX ON customer_properties (property_id);

-- ============================================================================
-- SERVICE CATALOG
-- ============================================================================

CREATE TABLE service_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES service_categories(id),
  sort_order      INTEGER DEFAULT 0,
  UNIQUE(org_id, name)
);

CREATE TABLE service_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name            TEXT NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES service_categories(id),
  
  -- Default pricing
  unit            TEXT NOT NULL,                  -- 'each', 'sqft', 'linear_ft', 'hour'
  default_unit_price       NUMERIC(10,2),
  default_labor_minutes    INTEGER,
  default_markup_pct       NUMERIC(5,2),
  
  -- AI metadata
  ai_description  TEXT,                            -- richer description for AI prompts
  embedding       VECTOR(1536),                    -- OpenAI text-embedding-3-large
  
  -- Stats
  times_quoted    INTEGER DEFAULT 0,
  times_won       INTEGER DEFAULT 0,
  
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON service_items (org_id, is_active);
CREATE INDEX ON service_items USING gin (name gin_trgm_ops);
CREATE INDEX ON service_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TRIGGER service_items_updated_at BEFORE UPDATE ON service_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- MATERIALS CATALOG
-- ============================================================================

CREATE TABLE materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name            TEXT NOT NULL,
  description     TEXT,
  unit            TEXT NOT NULL,
  
  -- Supplier SKUs
  sku_home_depot  TEXT,
  sku_lowes       TEXT,
  sku_ferguson    TEXT,
  sku_other       JSONB,            -- {"menards": "...", "84lumber": "..."}
  
  preferred_supplier TEXT,
  
  -- Current best-known price (denormalized from material_prices)
  last_known_unit_price   NUMERIC(10,2),
  last_known_supplier     TEXT,
  last_known_zip          TEXT,
  last_known_at           TIMESTAMPTZ,
  
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON materials (org_id, is_active);
CREATE INDEX ON materials USING gin (name gin_trgm_ops);

CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Service ↔ Material (default materials needed for a service)
CREATE TABLE service_materials (
  service_id      UUID NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity        NUMERIC(10,3) NOT NULL,
  is_optional     BOOLEAN DEFAULT false,
  PRIMARY KEY (service_id, material_id)
);

-- Time-series of observed material prices
CREATE TABLE material_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,           -- 'home_depot_api', 'lowes_api', 'manual', 'receipt'
  zip_code        TEXT,
  store_id        TEXT,
  unit_price      NUMERIC(10,2) NOT NULL,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB                    -- raw API response, receipt OCR data, etc.
);

CREATE INDEX ON material_prices (material_id, observed_at DESC);
CREATE INDEX ON material_prices (material_id, zip_code, observed_at DESC);

-- ============================================================================
-- JOBS
-- ============================================================================

CREATE TYPE job_status AS ENUM (
  'lead', 'site_visit_scheduled', 'quoted', 'approved', 
  'scheduled', 'in_progress', 'completed', 'invoiced', 'paid',
  'cancelled', 'on_hold'
);

CREATE TYPE job_priority AS ENUM ('low', 'normal', 'high', 'emergency');

CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  
  -- Identity
  job_number      TEXT,                          -- human-readable, e.g. "PPM-2026-0142"
  title           TEXT NOT NULL,
  description     TEXT,
  
  -- Status & priority
  status          job_status NOT NULL DEFAULT 'lead',
  priority        job_priority NOT NULL DEFAULT 'normal',
  
  -- Categorization
  category_id     UUID REFERENCES service_categories(id),
  tags            TEXT[] DEFAULT '{}',
  
  -- Scheduling
  scheduled_start TIMESTAMPTZ,
  scheduled_end   TIMESTAMPTZ,
  actual_start    TIMESTAMPTZ,
  actual_end      TIMESTAMPTZ,
  estimated_duration_minutes INTEGER,
  
  -- Financials (denormalized, updated by triggers)
  quoted_total    NUMERIC(12,2),
  invoiced_total  NUMERIC(12,2),
  paid_total      NUMERIC(12,2),
  cost_total      NUMERIC(12,2),                  -- materials + labor cost
  
  -- AI metadata
  embedding       VECTOR(1536),                   -- semantic search
  ai_summary      TEXT,
  
  -- Lifecycle
  created_by      UUID REFERENCES auth.users(id),
  closed_at       TIMESTAMPTZ,
  closed_reason   TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON jobs (org_id, status);
CREATE INDEX ON jobs (customer_id);
CREATE INDEX ON jobs (property_id);
CREATE INDEX ON jobs (scheduled_start);
CREATE INDEX ON jobs (created_at DESC);
CREATE INDEX ON jobs USING gin (tags);
CREATE INDEX ON jobs USING gin (title gin_trgm_ops);
CREATE INDEX ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Job phases (for multi-stage projects)
CREATE TABLE job_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER DEFAULT 0,
  status          job_status NOT NULL DEFAULT 'lead',
  scheduled_start TIMESTAMPTZ,
  scheduled_end   TIMESTAMPTZ,
  actual_start    TIMESTAMPTZ,
  actual_end      TIMESTAMPTZ,
  estimated_total NUMERIC(12,2),
  actual_cost     NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON job_phases (job_id);
CREATE TRIGGER job_phases_updated_at BEFORE UPDATE ON job_phases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- QUOTES
-- ============================================================================

CREATE TYPE quote_type AS ENUM ('standard', 'options', 'package', 'quick');
CREATE TYPE quote_status AS ENUM (
  'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revised'
);

CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  quote_number    TEXT,                            -- "Q-2026-0142"
  type            quote_type NOT NULL DEFAULT 'standard',
  status          quote_status NOT NULL DEFAULT 'draft',
  
  -- Content
  title           TEXT,
  intro_text      TEXT,                            -- before line items
  outro_text      TEXT,                            -- after (terms, etc)
  terms           TEXT,
  
  -- Totals (calculated from line items via trigger)
  subtotal        NUMERIC(12,2) DEFAULT 0,
  tax_pct         NUMERIC(5,2) DEFAULT 0,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  
  -- Validity
  valid_until     DATE,
  
  -- Lifecycle
  sent_at         TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,
  decline_reason  TEXT,
  
  -- Magic link access
  share_token     UUID DEFAULT gen_random_uuid(),
  
  -- Versioning
  version         INTEGER DEFAULT 1,
  parent_quote_id UUID REFERENCES quotes(id),     -- for revisions
  
  -- Documents
  pdf_url         TEXT,
  signed_pdf_url  TEXT,
  signature_data  JSONB,                            -- signer name, ip, timestamp, sig svg
  
  -- AI metadata
  ai_generated    BOOLEAN DEFAULT false,
  ai_confidence   NUMERIC(3,2),
  
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON quotes (org_id, status);
CREATE INDEX ON quotes (job_id);
CREATE INDEX ON quotes (share_token);
CREATE INDEX ON quotes (sent_at DESC);

CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- QUOTE LINE ITEMS — the heart of pricing intelligence
-- ============================================================================

CREATE TABLE quote_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id),                      -- denormalized for queries
  service_id      UUID REFERENCES service_items(id),
  property_id     UUID REFERENCES properties(id),                 -- denormalized
  zip_code        TEXT,                                            -- denormalized
  
  -- Option grouping (for good/better/best quotes)
  option_group    TEXT,                            -- 'good', 'better', 'best' or null
  phase_id        UUID REFERENCES job_phases(id),  -- which phase
  sort_order      INTEGER DEFAULT 0,
  
  -- Line content
  name            TEXT NOT NULL,
  description     TEXT,
  unit            TEXT NOT NULL,
  quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Cost breakdown (estimated at quote time)
  labor_minutes_estimated   INTEGER,
  labor_cost_estimated      NUMERIC(10,2),
  material_cost_estimated   NUMERIC(10,2),
  markup_pct                NUMERIC(5,2),
  
  -- Cost breakdown (actuals, filled in after job complete)
  labor_minutes_actual      INTEGER,
  labor_cost_actual         NUMERIC(10,2),
  material_cost_actual      NUMERIC(10,2),
  
  -- Computed
  total_quoted    NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  
  -- Outcome tracking (for pricing intelligence)
  outcome         TEXT,                            -- 'won', 'lost', 'pending', 'completed'
  outcome_notes   TEXT,
  
  -- AI metadata
  ai_generated    BOOLEAN DEFAULT false,
  ai_confidence   NUMERIC(3,2),
  ai_basis        TEXT,                            -- explanation of how price was derived
  
  quoted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Critical indexes for pricing queries
CREATE INDEX ON quote_line_items (org_id, service_id, zip_code, quoted_at DESC);
CREATE INDEX ON quote_line_items (org_id, service_id, outcome);
CREATE INDEX ON quote_line_items (quote_id);
CREATE INDEX ON quote_line_items (job_id);

CREATE TRIGGER quote_line_items_updated_at BEFORE UPDATE ON quote_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- INVOICES
-- ============================================================================

CREATE TYPE invoice_status AS ENUM (
  'draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void', 'refunded'
);

CREATE TYPE invoice_kind AS ENUM ('deposit', 'progress', 'final', 'standalone');

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  quote_id        UUID REFERENCES quotes(id),
  
  invoice_number  TEXT,
  kind            invoice_kind NOT NULL DEFAULT 'final',
  status          invoice_status NOT NULL DEFAULT 'draft',
  
  -- Content
  title           TEXT,
  notes           TEXT,
  terms           TEXT,
  
  -- Totals
  subtotal        NUMERIC(12,2) DEFAULT 0,
  tax_pct         NUMERIC(5,2) DEFAULT 0,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  amount_paid     NUMERIC(12,2) DEFAULT 0,
  amount_due      NUMERIC(12,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  
  -- Dates
  issued_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  
  -- Magic link
  share_token     UUID DEFAULT gen_random_uuid(),
  
  -- Stripe
  stripe_payment_intent_id TEXT,
  stripe_payment_link_url  TEXT,
  
  pdf_url         TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON invoices (org_id, status);
CREATE INDEX ON invoices (job_id);
CREATE INDEX ON invoices (share_token);
CREATE INDEX ON invoices (due_date) WHERE status NOT IN ('paid', 'void');

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quote_line_id   UUID REFERENCES quote_line_items(id),
  
  name            TEXT NOT NULL,
  description     TEXT,
  unit            TEXT NOT NULL,
  quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON invoice_line_items (invoice_id);

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TYPE payment_method AS ENUM ('card', 'ach', 'check', 'cash', 'venmo', 'other');

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  
  amount          NUMERIC(12,2) NOT NULL,
  method          payment_method NOT NULL,
  reference       TEXT,                            -- check number, etc.
  
  -- Stripe
  stripe_charge_id TEXT,
  stripe_fee       NUMERIC(8,2),
  
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON payments (org_id, paid_at DESC);
CREATE INDEX ON payments (invoice_id);

-- ============================================================================
-- TIME ENTRIES
-- ============================================================================

CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  job_id          UUID NOT NULL REFERENCES jobs(id),
  phase_id        UUID REFERENCES job_phases(id),
  
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER / 60
    ELSE NULL END
  ) STORED,
  
  hourly_rate     NUMERIC(8,2),
  
  -- Geo
  start_location  GEOGRAPHY(POINT, 4326),
  end_location    GEOGRAPHY(POINT, 4326),
  
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON time_entries (job_id, started_at);
CREATE INDEX ON time_entries (user_id, started_at DESC);

-- ============================================================================
-- JOB MATERIALS USED (actuals)
-- ============================================================================

CREATE TABLE job_material_uses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  phase_id        UUID REFERENCES job_phases(id),
  material_id     UUID REFERENCES materials(id),
  
  -- Either link to material, or freeform
  custom_name     TEXT,
  
  quantity        NUMERIC(10,3) NOT NULL,
  unit            TEXT NOT NULL,
  unit_cost       NUMERIC(10,2),
  total_cost      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * COALESCE(unit_cost, 0)) STORED,
  
  -- Source
  receipt_id      UUID,                            -- references vault_items if from receipt OCR
  supplier        TEXT,
  notes           TEXT,
  
  used_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON job_material_uses (job_id);
CREATE INDEX ON job_material_uses (material_id, used_at DESC);

-- ============================================================================
-- RLS — apply consistent policy: users see rows in their org
-- ============================================================================

DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'customers', 'properties', 'customer_properties',
    'service_categories', 'service_items', 'materials', 
    'service_materials', 'material_prices',
    'jobs', 'job_phases', 'quotes', 'quote_line_items',
    'invoices', 'invoice_line_items', 'payments',
    'time_entries', 'job_material_uses'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    
    -- For tables with org_id directly
    IF tbl NOT IN ('customer_properties', 'service_materials', 'invoice_line_items', 'material_prices', 'job_phases') THEN
      EXECUTE format('
        CREATE POLICY "org_isolation_%s" ON %I 
        FOR ALL USING (user_is_in_org(org_id))
      ', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- Special policies for tables without direct org_id
CREATE POLICY "customer_properties_isolation" ON customer_properties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM customers WHERE id = customer_id AND user_is_in_org(org_id))
  );

CREATE POLICY "service_materials_isolation" ON service_materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM service_items WHERE id = service_id AND user_is_in_org(org_id))
  );

CREATE POLICY "invoice_line_items_isolation" ON invoice_line_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_id AND user_is_in_org(org_id))
  );

CREATE POLICY "material_prices_isolation" ON material_prices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM materials WHERE id = material_id AND user_is_in_org(org_id))
  );

CREATE POLICY "job_phases_isolation" ON job_phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND user_is_in_org(org_id))
  );
