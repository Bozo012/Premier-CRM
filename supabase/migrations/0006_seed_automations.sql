-- Premier CRM — Default Automation Rules
-- Migration: 0006_seed_automations
--
-- Seeds the out-of-the-box automation rules for every new org.
-- Users can disable, edit, or delete these, or add their own.
-- All rules here have is_system_default=true which means they auto-propagate
-- to new orgs via the handle_new_org() function at the bottom.

-- ============================================================================
-- TEMPLATE: rules to install for every org
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_default_automations(target_org_id UUID)
RETURNS VOID AS $$
BEGIN

  -- RULE 1: Auto-start time entry on job site arrival
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'Start time on arrival',
    'When I arrive at a job property, start a time entry automatically',
    '📍',
    true,
    'geofence_entered',
    '{"min_dwell_seconds": 120}'::jsonb,
    '[
      {"path": "event.geofence.type", "op": "equals", "value": "property"},
      {"path": "event.geofence.property_id", "op": "has_active_job", "value": true}
    ]'::jsonb,
    '[
      {"type": "create_time_entry", "config": {
        "entry_kind": "on_site",
        "auto_generated": true,
        "user_confirmed": false,
        "link_to_active_job": true
      }},
      {"type": "advance_job_status", "config": {
        "from_status": ["scheduled", "approved"],
        "to_status": "in_progress"
      }},
      {"type": "create_vault_item", "config": {
        "type": "site_arrival",
        "source": "geofence_event"
      }}
    ]'::jsonb
  );

  -- RULE 2: Send arrival notification to customer
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, conditions, actions
  ) VALUES (
    target_org_id,
    'Notify customer on arrival',
    'Text the customer when I arrive, respecting their notification preferences',
    '💬',
    true,
    'geofence_entered',
    '[
      {"path": "event.geofence.type", "op": "equals", "value": "property"},
      {"path": "prefs.send_arrival_notification", "op": "equals", "value": true},
      {"path": "event.is_in_quiet_hours", "op": "equals", "value": false}
    ]'::jsonb,
    '[
      {"type": "send_sms", "config": {
        "to": "customer",
        "template": "arrival",
        "body_template": "Hi {{customer.first_name}}, {{user.full_name}} has arrived at your property to start work on {{job.title}}."
      }}
    ]'::jsonb
  );

  -- RULE 3: Close out prompt on job site departure
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'Close out job when leaving',
    'When I leave a job site, prompt me to mark work complete and draft the invoice',
    '📋',
    true,
    'geofence_exited',
    '{"min_absence_seconds": 120}'::jsonb,
    '[
      {"path": "event.geofence.type", "op": "equals", "value": "property"},
      {"path": "event.job.status", "op": "equals", "value": "in_progress"},
      {"path": "event.dwell_seconds", "op": "greater_than", "value": 900}
    ]'::jsonb,
    '[
      {"type": "close_time_entry", "config": {
        "require_confirmation": true
      }},
      {"type": "prompt_user", "config": {
        "prompt_type": "close_out_job",
        "title": "Leaving {{job.title}}?",
        "body": "You spent {{time.on_site_today}} on site. Want to close this out?",
        "options": [
          {"id": "complete_and_invoice", "label": "Mark complete & draft invoice", "primary": true},
          {"id": "complete_only", "label": "Mark complete, invoice later"},
          {"id": "still_working", "label": "Not done, just stepping away"},
          {"id": "snooze_15", "label": "Ask me in 15 minutes"}
        ],
        "default_option_id": "snooze_15"
      }}
    ]'::jsonb
  );

  -- RULE 4: Auto-tag vault items captured on site
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, conditions, actions
  ) VALUES (
    target_org_id,
    'Tag photos and notes by location',
    'Photos, voice memos, and notes captured inside a geofence auto-link to that property and job',
    '🏷️',
    true,
    'capture_uploaded',
    '[
      {"path": "event.vault_item.location", "op": "is_not_null", "value": true},
      {"path": "event.geofence_match", "op": "is_not_null", "value": true}
    ]'::jsonb,
    '[
      {"type": "tag_vault_items", "config": {
        "auto_link_from_geofence": true,
        "confidence": 0.99
      }}
    ]'::jsonb
  );

  -- RULE 5: Supply run detection
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, conditions, actions
  ) VALUES (
    target_org_id,
    'Classify supplier visits as supply runs',
    'When I visit Home Depot, Lowe''s, or Ferguson during an active work day, attribute the trip to my current job',
    '🚚',
    true,
    'geofence_entered',
    '[
      {"path": "event.geofence.type", "op": "equals", "value": "supplier"},
      {"path": "event.user.has_active_job_today", "op": "equals", "value": true}
    ]'::jsonb,
    '[
      {"type": "classify_trip", "config": {
        "purpose": "supply_run",
        "attribute_to_most_recent_job": true,
        "is_billable": true
      }},
      {"type": "prompt_user", "config": {
        "prompt_type": "link_receipts",
        "title": "At {{geofence.label}}",
        "body": "Snap a photo of the receipt when you''re done and I''ll add the materials to {{job.title}}.",
        "options": [
          {"id": "ok", "label": "OK", "primary": true},
          {"id": "not_for_this_job", "label": "This isn''t for a job"}
        ],
        "priority": "low"
      }}
    ]'::jsonb
  );

  -- RULE 6: Dwell overrun warning
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'Alert when over estimated time',
    'If I''m on site 50% longer than the quoted duration, suggest a change order',
    '⚠️',
    true,
    'geofence_dwelled',
    '{"check_interval_minutes": 30}'::jsonb,
    '[
      {"path": "event.job.estimated_duration_minutes", "op": "is_not_null", "value": true},
      {"path": "event.dwell_ratio", "op": "greater_than", "value": 1.5}
    ]'::jsonb,
    '[
      {"type": "push_notification", "config": {
        "title": "{{job.title}} — running long",
        "body": "You''ve been on site {{time.on_site_today}} vs estimated {{job.estimated_duration}}. Want to review scope?",
        "priority": "normal"
      }},
      {"type": "create_task", "config": {
        "title": "Review scope on {{job.title}} — running over estimate",
        "priority": "high",
        "link_to_job": true
      }}
    ]'::jsonb
  );

  -- RULE 7: Pre-arrival briefing
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'Pre-arrival briefing',
    '5 minutes before I arrive at a job, surface the property''s history and notes',
    '📂',
    true,
    'approaching_geofence',
    '{"eta_minutes": 5}'::jsonb,
    '[
      {"path": "event.geofence.type", "op": "equals", "value": "property"},
      {"path": "event.job.status", "op": "in", "value": ["scheduled", "approved"]}
    ]'::jsonb,
    '[
      {"type": "push_notification", "config": {
        "title": "Arriving at {{property.short_address}} in 5 min",
        "body": "{{job.title}}. {{property.access_notes}}",
        "deep_link": "/jobs/{{job.id}}/briefing",
        "priority": "high"
      }}
    ]'::jsonb
  );

  -- RULE 8: On-the-way customer text
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'Send "on the way" text',
    'Text the customer when I start driving toward their scheduled job',
    '🚐',
    true,
    'trip_started',
    '{}'::jsonb,
    '[
      {"path": "event.destination.type", "op": "equals", "value": "property"},
      {"path": "event.destination.has_scheduled_job", "op": "equals", "value": true},
      {"path": "prefs.send_on_the_way_texts", "op": "equals", "value": true},
      {"path": "event.eta_minutes", "op": "less_than_or_equal", "value": "prefs.arrival_notification_lead_minutes"}
    ]'::jsonb,
    '[
      {"type": "send_sms", "config": {
        "to": "customer",
        "template": "on_the_way",
        "body_template": "Hi {{customer.first_name}} — {{user.full_name}} is on the way, ETA about {{event.eta_minutes}} minutes."
      }}
    ]'::jsonb
  );

  -- RULE 9: Exit-without-invoice reminder
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions,
    cooldown_seconds
  ) VALUES (
    target_org_id,
    'Remind to invoice after completion',
    'If I mark a job complete but leave without invoicing, remind me 30 min later',
    '💰',
    true,
    'scheduled_time',
    '{"delay_minutes_after": {"event": "job_completed_and_left", "minutes": 30}}'::jsonb,
    '[
      {"path": "job.status", "op": "equals", "value": "completed"},
      {"path": "job.invoiced_total", "op": "equals", "value": 0},
      {"path": "user.current_geofence.property_id", "op": "not_equals", "value": "job.property_id"}
    ]'::jsonb,
    '[
      {"type": "prompt_user", "config": {
        "prompt_type": "draft_invoice",
        "title": "Invoice {{job.title}}?",
        "body": "Based on {{time.on_site_total}} on site and logged materials.",
        "options": [
          {"id": "draft_and_send", "label": "Draft & send now", "primary": true},
          {"id": "draft_only", "label": "Draft, I''ll review"},
          {"id": "remind_tomorrow", "label": "Remind me tomorrow"}
        ]
      }}
    ]'::jsonb,
    3600
  );

  -- RULE 10: Daily end-of-day rollup
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    target_org_id,
    'End of day summary',
    'At 5:30pm (or when I get home, whichever is first), summarize the day',
    '🌅',
    true,
    'scheduled_time',
    '{"time": "17:30", "or_event": "arrived_home"}'::jsonb,
    '[
      {"path": "event.user.had_jobs_today", "op": "equals", "value": true}
    ]'::jsonb,
    '[
      {"type": "push_notification", "config": {
        "title": "Today''s summary",
        "body": "{{stats.jobs_visited}} jobs, {{stats.hours_on_site}} on site, {{stats.miles_driven}} mi. Tap to review.",
        "deep_link": "/today/summary"
      }}
    ]'::jsonb
  );

  -- RULE 11: Stale quote follow-up
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, trigger_config, conditions, actions,
    cooldown_seconds
  ) VALUES (
    target_org_id,
    'Follow up on aging quotes',
    'If a quote is sent but not viewed after 3 days, draft a follow-up',
    '📧',
    true,
    'quote_stale',
    '{"days_since_sent": 3}'::jsonb,
    '[
      {"path": "quote.status", "op": "equals", "value": "sent"}
    ]'::jsonb,
    '[
      {"type": "prompt_user", "config": {
        "prompt_type": "quote_followup",
        "title": "Follow up on quote for {{customer.display_name}}?",
        "body": "Sent {{quote.days_since_sent}} days ago, not viewed yet.",
        "options": [
          {"id": "send_drafted", "label": "Send my drafted follow-up", "primary": true},
          {"id": "edit_first", "label": "Let me edit first"},
          {"id": "skip", "label": "Skip this one"}
        ],
        "payload_action": "draft_message"
      }}
    ]'::jsonb,
    86400
  );

  -- RULE 12: After-hours tracking suppression
  INSERT INTO automation_rules (
    org_id, name, description, icon, is_system_default,
    trigger_type, conditions, actions
  ) VALUES (
    target_org_id,
    'Respect off-hours',
    'Outside business hours, only track trips explicitly toggled on. Personal errands stay personal.',
    '🌙',
    true,
    'geofence_entered',
    '[
      {"path": "event.is_business_hours", "op": "equals", "value": false},
      {"path": "prefs.track_outside_business_hours", "op": "equals", "value": false},
      {"path": "event.manual_tracking_override", "op": "equals", "value": false}
    ]'::jsonb,
    '[
      {"type": "skip", "config": {"reason": "outside business hours"}}
    ]'::jsonb
  );

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Hook: auto-seed defaults when a new org is created
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_org()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_automations(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_org();

-- Seed defaults for any orgs that already exist (e.g. Premier itself)
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    -- Only seed if no rules exist yet for this org
    IF NOT EXISTS (SELECT 1 FROM automation_rules WHERE org_id = org.id AND is_system_default) THEN
      PERFORM seed_default_automations(org.id);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Also: seed common supplier geofences for new orgs in the US
-- ============================================================================
-- This is a convenience — when a user sets their org location, we can query
-- Google Places to find nearby Home Depot / Lowe's / Ferguson / etc. and
-- auto-create geofences for them. Done via application code, not SQL.
-- Placeholder for the helper function signature the app code will implement:

COMMENT ON TABLE geofences IS 
  'Suppliers should be seeded via application code that queries Google Places for Home Depot, Lowe''s, Ferguson, Menards, 84 Lumber, etc. within 50mi of the org address.';
