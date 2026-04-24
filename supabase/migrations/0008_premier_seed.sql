-- Premier CRM — Premier Property Maintenance LLC seed data
-- Migration: 0008_premier_seed
--
-- Bootstraps Premier org if it doesn't exist, then seeds:
--   - Org pricing policy
--   - Service categories + service items (Tier 1 confirmed, Tier 2 with ranges)
--   - Permit guardrails (Kenton County decks + state license guardrails)
--   - Supplier geofences (Florence area + Walton placeholder)
--
-- IDEMPOTENT: safe to run multiple times. ON CONFLICT DO NOTHING throughout.

-- ============================================================================
-- BOOTSTRAP: ensure Premier org exists
-- ============================================================================
-- This is the only "magic" in the system. After install, the org exists with a
-- known ID so the rest of the seed has something to attach to. The first user
-- to sign up via the app gets associated with this org as the owner.

DO $$
DECLARE
  premier_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
BEGIN
  -- Create the Premier org if it doesn't exist
  INSERT INTO organizations (id, name, slug, created_at)
  VALUES (
    premier_org_id,
    'Premier Property Maintenance LLC',
    'premier',
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RAISE NOTICE 'Premier org ready: %', premier_org_id;
END $$;

-- ============================================================================
-- SEED FUNCTION (called below after org exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_premier_data(target_org_id UUID)
RETURNS VOID AS $$
DECLARE
  cat_trip       UUID;
  cat_drywall    UUID;
  cat_trim       UUID;
  cat_doors      UUID;
  cat_painting   UUID;
  cat_decking    UUID;
  cat_custom     UUID;
BEGIN

  -- 1. PRICING POLICY
  INSERT INTO org_pricing_policy (
    org_id,
    trip_fee_residential,
    trip_fee_commercial,
    vehicle_mpg,
    materials_residential_markup_pct,
    materials_commercial_markup_pct,
    materials_overage_threshold,
    custom_job_uncertainty_buffer_pct,
    target_hourly_equivalent,
    default_sales_tax_pct,
    charge_tax_on_labor,
    charge_tax_on_materials
  ) VALUES (
    target_org_id, 100.00, 150.00, 18.0, 0.00, 10.00, 100.00, 17.50, 85.00,
    6.00, false, true
  )
  ON CONFLICT (org_id) DO NOTHING;

  -- 2. SERVICE CATEGORIES
  INSERT INTO service_categories (org_id, name, sort_order) VALUES
    (target_org_id, 'Trip Fees', 0),
    (target_org_id, 'Drywall', 10),
    (target_org_id, 'Trim & Carpentry', 20),
    (target_org_id, 'Doors', 30),
    (target_org_id, 'Painting', 40),
    (target_org_id, 'Decking', 50),
    (target_org_id, 'Custom', 99)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- Capture category IDs for use in service_items
  SELECT id INTO cat_trip      FROM service_categories WHERE org_id = target_org_id AND name = 'Trip Fees';
  SELECT id INTO cat_drywall   FROM service_categories WHERE org_id = target_org_id AND name = 'Drywall';
  SELECT id INTO cat_trim      FROM service_categories WHERE org_id = target_org_id AND name = 'Trim & Carpentry';
  SELECT id INTO cat_doors     FROM service_categories WHERE org_id = target_org_id AND name = 'Doors';
  SELECT id INTO cat_painting  FROM service_categories WHERE org_id = target_org_id AND name = 'Painting';
  SELECT id INTO cat_decking   FROM service_categories WHERE org_id = target_org_id AND name = 'Decking';
  SELECT id INTO cat_custom    FROM service_categories WHERE org_id = target_org_id AND name = 'Custom';

  -- 3a. SERVICE ITEMS — Tier 1 (confirmed, ready to use)
  INSERT INTO service_items (
    org_id, category_id, name, description, unit, unit_label, pricing_metric,
    rate_low, rate_high, rate_confirmed, default_unit_price, confidence,
    scope_includes, scope_excludes
  ) VALUES
  (target_org_id, cat_trip, 'Residential trip fee', 
   'Flat fee per residential job (waived on multi-day; replaced with mileage line)',
   'each', 'per trip', 'flat', 100.00, 100.00, 100.00, 100.00, 'high',
   'Travel time to and from one residential job site',
   'Multi-day jobs use mileage line item instead'),
   
  (target_org_id, cat_trip, 'Commercial trip fee',
   'Flat fee per commercial job',
   'each', 'per trip', 'flat', 150.00, 150.00, 150.00, 150.00, 'high',
   'Travel time to and from one commercial job site',
   'Multi-day jobs use mileage line item instead'),
   
  (target_org_id, cat_trip, 'Multi-day travel',
   'Per-trip mileage (round-trip miles ÷ 18 mpg × current fuel price)',
   'each', 'per round trip', 'per_each', NULL, NULL, NULL, NULL, 'high',
   'Auto-calculated from location data and current fuel price', NULL)
  ON CONFLICT DO NOTHING;

  -- 3b. SERVICE ITEMS — Tier 2 (ranges, AI confirms first time used)
  
  -- DRYWALL
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes) VALUES
  (target_org_id, cat_drywall, 'Patch — small (under 12")',  'each', 'per patch', 'flat', 75, 125, 'unconfirmed',
   'Cut, patch, mud, sand, prime ready for paint. Single coat texture if needed.'),
  (target_org_id, cat_drywall, 'Patch — medium (12-24")',    'each', 'per patch', 'flat', 125, 200, 'unconfirmed',
   'Includes backer support if needed, multi-coat mud, sanded ready for paint.'),
  (target_org_id, cat_drywall, 'Patch — large (over 24")',   'sqft', 'sq ft', 'per_sqft', 8, 15, 'unconfirmed',
   'Cut to nearest stud, add backing, full sheet patch, tape, mud, sand, prime.'),
  (target_org_id, cat_drywall, 'New install — hang only',    'sqft', 'sq ft', 'per_sqft', 2, 3, 'unconfirmed',
   'Hang sheets to existing framing. Mudding/finishing separate.'),
  (target_org_id, cat_drywall, 'Hang + tape + finish',       'sqft', 'sq ft', 'per_sqft', 4, 6, 'unconfirmed',
   'Hang sheets, tape all seams, three-coat mud, sanded ready for primer.'),
  (target_org_id, cat_drywall, 'Texture matching',           'each', '% surcharge', 'surcharge_pct', 25, 50, 'unconfirmed',
   'Matching existing texture (knockdown, orange peel, etc.).')
  ON CONFLICT DO NOTHING;

  -- TRIM & CARPENTRY
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes) VALUES
  (target_org_id, cat_trim, 'Baseboard install',     'linear_ft', 'linear ft', 'per_lf', 3, 6, 'unconfirmed',
   'Cut, install, fill nail holes. Caulk and paint touch-up separate.'),
  (target_org_id, cat_trim, 'Crown molding',         'linear_ft', 'linear ft', 'per_lf', 5, 10, 'unconfirmed',
   'Cut, install, fill. Includes corner cope cuts.'),
  (target_org_id, cat_trim, 'Door/window casing',    'linear_ft', 'linear ft', 'per_lf', 4, 7, 'unconfirmed', NULL),
  (target_org_id, cat_trim, 'Shoe mold',             'linear_ft', 'linear ft', 'per_lf', 2, 4, 'unconfirmed', NULL),
  (target_org_id, cat_trim, 'Custom routed trim',    'each', 'project', 'quote_per_job', NULL, NULL, 'unconfirmed',
   'Custom profile work, includes router setup time.')
  ON CONFLICT DO NOTHING;

  -- DOORS
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes) VALUES
  (target_org_id, cat_doors, 'Interior swap (slab in existing jamb)', 'each', 'door', 'per_each', 125, 200, 'unconfirmed',
   'Remove old slab, install new pre-hung or slab, hang on existing hinges, install handle.'),
  (target_org_id, cat_doors, 'Interior — full replacement (jamb + slab)', 'each', 'door', 'per_each', 250, 400, 'unconfirmed',
   'Remove existing jamb and door, install new pre-hung unit, shim, trim casing.'),
  (target_org_id, cat_doors, 'Exterior swap (slab)',                 'each', 'door', 'per_each', 200, 350, 'unconfirmed',
   'Remove old slab, hang new exterior slab, install hardware.'),
  (target_org_id, cat_doors, 'Exterior — full replacement',          'each', 'door', 'per_each', 400, 650, 'unconfirmed',
   'Full pre-hung exterior unit including frame, threshold, weatherstrip.'),
  (target_org_id, cat_doors, 'Lock/handle replacement',              'each', 'lockset', 'per_each', 50, 100, 'unconfirmed', NULL),
  (target_org_id, cat_doors, 'Adjustment (sticking, alignment)',     'each', 'per door', 'flat', 75, 125, 'unconfirmed', NULL),
  (target_org_id, cat_doors, 'Weatherstripping',                     'each', 'door', 'per_each', 50, 100, 'unconfirmed', NULL)
  ON CONFLICT DO NOTHING;

  -- PAINTING
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes, scope_excludes) VALUES
  (target_org_id, cat_painting, 'Touch-up (minor)',          'each', 'per visit', 'flat', 100, 150, 'unconfirmed',
   'Includes 1 hr of touch-up work. Customer-supplied paint preferred.', NULL),
  (target_org_id, cat_painting, 'Single wall',               'each', 'wall', 'flat', 100, 200, 'unconfirmed',
   'Prep, prime if needed, two coats. Materials pass-through.', NULL),
  (target_org_id, cat_painting, 'Single room — walls only',  'sqft', 'sq ft floor', 'per_sqft', 1.50, 3.00, 'unconfirmed',
   'Prep, prime, two coats walls. Trim and ceiling separate.', 'Trim, ceiling, doors'),
  (target_org_id, cat_painting, 'Single room — full',        'sqft', 'sq ft floor', 'per_sqft', 3.00, 5.00, 'unconfirmed',
   'Walls, ceiling, trim, doors. Full prep and two coats throughout.', NULL),
  (target_org_id, cat_painting, 'Exterior trim',             'linear_ft', 'linear ft', 'per_lf', 4, 8, 'unconfirmed',
   'Scrape, prime bare areas, two coats.', 'Full siding (refer out)')
  ON CONFLICT DO NOTHING;

  -- DECKING (within Kenton no-permit window)
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes, exclusion_note, permit_check) VALUES
  (target_org_id, cat_decking, 'Board replacement', 'each', 'board', 'per_each', 20, 40, 'unconfirmed',
   'Remove damaged board, install replacement, fasten with proper hardware. Materials pass-through.',
   NULL, NULL),
  (target_org_id, cat_decking, 'Full deck repair',  'sqft', 'sq ft', 'per_sqft', 15, 30, 'unconfirmed',
   'Inspection, board replacement, fastener replacement, joist repair as needed.',
   'Permit may be required if structural — check permit_guardrails',
   '{"category": "Decking"}'::jsonb),
  (target_org_id, cat_decking, 'Stain/seal',        'sqft', 'sq ft', 'per_sqft', 2, 4, 'unconfirmed',
   'Clean, light sand if needed, two coats stain or sealer. Materials pass-through.',
   NULL, NULL),
  (target_org_id, cat_decking, 'New build (no-permit envelope)', 'each', 'project', 'quote_per_job', NULL, NULL, 'unconfirmed',
   'New deck construction WITHIN Kenton County no-permit envelope: <200 sqft, <30" above grade, not attached to house, not serving egress.',
   'PERMIT REQUIRED if any threshold exceeded.',
   '{"category": "Decking", "force_check": true}'::jsonb)
  ON CONFLICT DO NOTHING;

  -- CUSTOM / FAVOR JOBS
  INSERT INTO service_items (org_id, category_id, name, unit, unit_label, pricing_metric, rate_low, rate_high, confidence, scope_includes, is_custom_only) VALUES
  (target_org_id, cat_custom, 'One-off / favor job', 'each', 'project', 'quote_per_job', NULL, NULL, 'high',
   'Non-standard work. Includes research time, material sourcing, and 17.5% uncertainty buffer.',
   true)
  ON CONFLICT DO NOTHING;

  -- 4. PERMIT GUARDRAILS
  INSERT INTO permit_guardrails (
    org_id, service_category, jurisdiction, rule_name, description, source_url,
    decision_logic, default_outcome
  ) VALUES (
    target_org_id, 'Decking', 'Kenton County, KY',
    'Decks - Kenton County permit threshold',
    'Per Planning and Development Services of Kenton County: NO permit required for decks meeting ALL of: <200 sq ft, <30" above grade, not attached to primary structure, not serving required means of egress.',
    'https://www.pdskc.org/Portals/pdskc/Documents/applications_forms/checklists/Checklist-Decks-2-2025_doc.pdf',
    '{
      "questions": [
        {"id": "sqft",       "prompt": "Square footage of the deck?",                "type": "number"},
        {"id": "height_in",  "prompt": "Height above grade at the highest point (inches)?", "type": "number"},
        {"id": "attached",   "prompt": "Will it be attached to the house?",          "type": "boolean"},
        {"id": "egress",     "prompt": "Does it serve as required means of egress?", "type": "boolean"}
      ],
      "rules": [
        {"if": "sqft >= 200",     "then": "permit_required", "reason": "Deck >= 200 sq ft requires permit"},
        {"if": "height_in >= 30", "then": "permit_required", "reason": "Deck >= 30 inches above grade requires permit"},
        {"if": "attached == true", "then": "permit_required", "reason": "Decks attached to the house require a permit"},
        {"if": "egress == true",  "then": "permit_required", "reason": "Decks serving required egress require a permit"}
      ]
    }'::jsonb,
    'no_permit_required'
  ),
  (target_org_id, 'Electrical', 'KY State',
   'Hard electrical work requires state license',
   'Premier does not perform work requiring an electrical permit. Soft electrical (fixture swaps, outlet/switch on existing circuits) is OK.',
   'https://dhbc.ky.gov',
   '{
     "questions": [{"id": "type", "prompt": "What kind of electrical work?", "type": "select",
       "options": ["fixture_swap", "outlet_switch_replace", "new_circuit", "panel_work", "service_change", "other"]}],
     "rules": [
       {"if": "type == new_circuit",     "then": "refer_out", "reason": "Requires KY licensed electrician"},
       {"if": "type == panel_work",      "then": "refer_out", "reason": "Requires KY licensed electrician"},
       {"if": "type == service_change",  "then": "refer_out", "reason": "Requires KY licensed electrician"},
       {"if": "type == other",           "then": "ask_assistant", "reason": "Need to assess"}
     ]
   }'::jsonb, 'ok'),
  (target_org_id, 'Plumbing', 'KY State',
   'Hard plumbing work requires state license',
   'Premier does not perform work requiring a plumbing permit. Soft plumbing (faucets, traps, toilets, supply lines) is OK.',
   'https://dhbc.ky.gov',
   '{
     "questions": [{"id": "type", "prompt": "What kind of plumbing work?", "type": "select",
       "options": ["faucet_swap", "toilet_swap", "supply_line", "trap_drain_repair", "rough_in", "repipe", "water_heater_install", "gas_line", "other"]}],
     "rules": [
       {"if": "type == rough_in",            "then": "refer_out", "reason": "Requires KY licensed plumber"},
       {"if": "type == repipe",              "then": "refer_out", "reason": "Requires KY licensed plumber"},
       {"if": "type == water_heater_install","then": "refer_out", "reason": "Requires KY licensed plumber"},
       {"if": "type == gas_line",            "then": "refer_out", "reason": "Requires KY licensed plumber"},
       {"if": "type == other",               "then": "ask_assistant", "reason": "Need to assess"}
     ]
   }'::jsonb, 'ok'),
  (target_org_id, 'HVAC', 'KY State',
   'HVAC work requires state license',
   'Premier does not perform HVAC work. Filter swaps and accessible duct cleaning OK.',
   'https://dhbc.ky.gov',
   '{
     "questions": [{"id": "type", "prompt": "What kind of HVAC work?", "type": "select",
       "options": ["filter_swap", "duct_cleaning_accessible", "system_install", "line_set", "refrigerant", "other"]}],
     "rules": [
       {"if": "type == system_install", "then": "refer_out", "reason": "Requires KY HVAC license"},
       {"if": "type == line_set",       "then": "refer_out", "reason": "Requires KY HVAC license"},
       {"if": "type == refrigerant",    "then": "refer_out", "reason": "EPA 608 + KY HVAC license required"},
       {"if": "type == other",          "then": "ask_assistant", "reason": "Need to assess"}
     ]
   }'::jsonb, 'ok')
  ON CONFLICT DO NOTHING;

  -- 5. SUPPLIER GEOFENCES
  INSERT INTO geofences (org_id, type, label, center, radius_meters, is_active, min_dwell_seconds, notes, auto_generated) VALUES
  (target_org_id, 'supplier', 'Home Depot — Florence',
   ST_SetSRID(ST_MakePoint(-84.6415293, 39.009252), 4326)::geography,
   150, true, 180,
   '99 Spiral Blvd, Florence, KY 41042. Phone: 859-283-1460.',
   false),
  (target_org_id, 'supplier', 'Lowe''s — Florence',
   ST_SetSRID(ST_MakePoint(-84.6236, 39.0203), 4326)::geography,
   150, true, 180,
   '4800 Houston Rd, Florence, KY 41042. Phone: 859-371-4770.',
   false),
  (target_org_id, 'supplier', 'Menards — Florence',
   ST_SetSRID(ST_MakePoint(-84.64748379999999, 38.9860305), 4326)::geography,
   180, true, 180,
   '5000 Apex Ln, Florence, KY 41042. Phone: 859-282-0759.',
   false),
  (target_org_id, 'supplier', 'Lowe''s — Walton (opening soon)',
   ST_SetSRID(ST_MakePoint(-84.6169755, 38.8560619), 4326)::geography,
   200, false, 180,
   'New construction near Kroger Marketplace, Walton, KY. Currently inactive — flip is_active=true when opens and refine coordinates.',
   false)
  ON CONFLICT DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EXECUTE SEED FOR PREMIER
-- ============================================================================

SELECT seed_premier_data('a0000000-0000-0000-0000-000000000001'::UUID);
