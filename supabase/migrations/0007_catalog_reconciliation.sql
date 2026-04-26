-- Premier CRM — Catalog reconciliation + customer archetypes
-- Migration: 0007_catalog_reconciliation
--
-- Reconciles the service catalog model. Original 0002 created service_items 
-- with basic pricing. This migration extends it with the confidence/range/scope
-- fields needed for the AI-managed catalog UX.
--
-- Also adds customer_archetype enum + defaults table.
--
-- IMPORTANT: There is no separate "service_catalog" table. service_items IS the catalog.

-- ============================================================================
-- EXTEND service_items WITH CATALOG FIELDS
-- ============================================================================

ALTER TABLE service_items
  -- Pricing range support (original had only default_unit_price)
  ADD COLUMN IF NOT EXISTS rate_low        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rate_high       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rate_confirmed  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS confidence      TEXT DEFAULT 'unconfirmed' 
    CHECK (confidence IN ('unconfirmed', 'low', 'medium', 'high')),
  
  -- Pricing model expansion
  ADD COLUMN IF NOT EXISTS pricing_metric  TEXT DEFAULT 'flat'
    CHECK (pricing_metric IN ('flat', 'per_sqft', 'per_lf', 'per_each', 'per_hour', 'quote_per_job', 'surcharge_pct')),
  ADD COLUMN IF NOT EXISTS unit_label      TEXT,           -- "patch", "linear ft", "door"
  
  -- Scope clarity for customer-facing quotes
  ADD COLUMN IF NOT EXISTS scope_includes  TEXT,
  ADD COLUMN IF NOT EXISTS scope_excludes  TEXT,
  ADD COLUMN IF NOT EXISTS common_addons   TEXT,
  ADD COLUMN IF NOT EXISTS exclusion_note  TEXT,
  
  -- Permit guardrail integration
  ADD COLUMN IF NOT EXISTS permit_check    JSONB,
  
  -- One-off / favor job marker
  ADD COLUMN IF NOT EXISTS is_custom_only  BOOLEAN DEFAULT false;

-- Migrate existing default_unit_price into the new model (where applicable)
UPDATE service_items 
SET 
  rate_confirmed = default_unit_price,
  confidence = CASE WHEN default_unit_price IS NOT NULL THEN 'high' ELSE 'unconfirmed' END,
  pricing_metric = CASE 
    WHEN unit = 'each' THEN 'per_each'
    WHEN unit = 'sqft' THEN 'per_sqft'
    WHEN unit = 'linear_ft' THEN 'per_lf'
    WHEN unit = 'hour' THEN 'per_hour'
    ELSE 'flat'
  END,
  unit_label = unit
WHERE rate_confirmed IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_items_confidence 
  ON service_items (org_id, confidence) WHERE is_active;

-- ============================================================================
-- CUSTOMER ARCHETYPE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_archetype') THEN
    CREATE TYPE customer_archetype AS ENUM (
      'residential_one_off',
      'residential_repeat',
      'landlord_small',         -- 1-5 properties
      'landlord_growing',       -- 6-15 properties (TARGET MARKET)
      'property_manager',       -- 15+ or third-party manager
      'commercial',
      'unknown'
    );
  END IF;
END $$;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS archetype customer_archetype DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS standing_approval_threshold NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consolidate_invoices_monthly BOOLEAN DEFAULT false;

-- Customer archetype defaults (template for new customers)
CREATE TABLE IF NOT EXISTS customer_archetype_defaults (
  archetype       customer_archetype PRIMARY KEY,
  default_payment_terms_days       INTEGER DEFAULT 0,
  default_standing_approval        NUMERIC(10,2),
  consolidate_invoices_monthly     BOOLEAN DEFAULT false,
  default_send_arrival_text        BOOLEAN DEFAULT false,  -- OPT-IN by default
  default_arrival_lead_minutes     INTEGER DEFAULT 30,
  default_send_on_the_way          BOOLEAN DEFAULT false,  -- OPT-IN by default
  default_bill_drive_time          BOOLEAN DEFAULT false,
  default_materials_markup_pct     NUMERIC(5,2),
  recurring_templates_available    BOOLEAN DEFAULT false,
  notes                            TEXT
);

INSERT INTO customer_archetype_defaults VALUES
  ('residential_one_off',  0,   NULL,   false, false, 30, false, false, NULL, false,
   'Standard residential customer. Default trip fee, no markup on materials. Notifications opt-in per customer.'),
  ('residential_repeat',   0,   NULL,   false, false, 30, false, false, NULL, false,
   '3+ completed jobs. Eligible for trip-fee waiver on combined visits.'),
  ('landlord_small',       15,  150,    false, false, 60, false, false, NULL, true,
   '1-5 properties. Net 15. Small standing approval for emergency fixes.'),
  ('landlord_growing',     15,  250,    false, true,  60, true,  false, NULL, true,
   'TARGET MARKET. 6-15 properties. Faster response, $250 standing approval, on-the-way texts on by default.'),
  ('property_manager',     30,  500,    true,  false, 60, false, false, NULL, true,
   'Third-party manager or 15+ properties. Net 30. Monthly consolidated invoicing.'),
  ('commercial',           30,  NULL,   false, false, 60, false, true,  10.00, false,
   'Commercial account. 10% materials markup. Net 30. COI required.'),
  ('unknown',              0,   NULL,   false, false, 30, false, false, NULL, false,
   'Defaults pending classification.')
ON CONFLICT (archetype) DO UPDATE SET
  default_payment_terms_days = EXCLUDED.default_payment_terms_days,
  default_standing_approval = EXCLUDED.default_standing_approval,
  default_send_arrival_text = EXCLUDED.default_send_arrival_text,
  default_send_on_the_way = EXCLUDED.default_send_on_the_way,
  notes = EXCLUDED.notes;

-- ============================================================================
-- ORG PRICING POLICY
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_pricing_policy (
  org_id                          UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  
  trip_fee_residential            NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  trip_fee_commercial             NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  trip_fee_waived_on_multi_day    BOOLEAN DEFAULT true,
  
  vehicle_mpg                     NUMERIC(5,1) DEFAULT 18.0,
  fuel_price_per_gallon           NUMERIC(5,3),
  fuel_price_updated_at           TIMESTAMPTZ,
  fuel_price_source               TEXT DEFAULT 'manual',  -- 'manual' or 'eia_feed'
  
  materials_residential_markup_pct NUMERIC(5,2) DEFAULT 0.00,
  materials_commercial_markup_pct  NUMERIC(5,2) DEFAULT 10.00,
  materials_overage_threshold     NUMERIC(10,2) DEFAULT 100.00,
  
  custom_job_uncertainty_buffer_pct NUMERIC(5,2) DEFAULT 17.50,
  
  target_hourly_equivalent        NUMERIC(10,2) DEFAULT 85.00,
  
  -- Tax (Kentucky context)
  default_sales_tax_pct           NUMERIC(5,2) DEFAULT 6.00,  -- KY state sales tax
  charge_tax_on_labor             BOOLEAN DEFAULT false,       -- KY: most handyman labor not taxed
  charge_tax_on_materials         BOOLEAN DEFAULT true,
  
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS org_pricing_policy_updated_at ON org_pricing_policy;
CREATE TRIGGER org_pricing_policy_updated_at BEFORE UPDATE ON org_pricing_policy
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE org_pricing_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_pricing_policy" ON org_pricing_policy;
CREATE POLICY "org_isolation_pricing_policy" ON org_pricing_policy
  FOR ALL USING (user_is_in_org(org_id));

-- ============================================================================
-- PERMIT GUARDRAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS permit_guardrails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_category TEXT NOT NULL,
  jurisdiction    TEXT,
  rule_name       TEXT NOT NULL,
  description     TEXT,
  source_url      TEXT,
  decision_logic  JSONB NOT NULL,
  default_outcome TEXT DEFAULT 'no_permit_required',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permit_guardrails_lookup 
  ON permit_guardrails (org_id, service_category, is_active);

ALTER TABLE permit_guardrails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_permit_guardrails" ON permit_guardrails;
CREATE POLICY "org_isolation_permit_guardrails" ON permit_guardrails
  FOR ALL USING (user_is_in_org(org_id));
