/**
 * Premier Brain — Location & Automation Tools
 *
 * Extension to definitions.ts. These tools let the AI assistant reason about
 * and control the location/automation system conversationally.
 *
 * Import alongside the base tools:
 *   import { locationTools, automationTools } from './location-tools';
 */

import type { Anthropic } from '@anthropic-ai/sdk';
type Tool = Anthropic.Messages.Tool;

// =============================================================================
// LOCATION READ TOOLS
// =============================================================================

export const locationReadTools: Tool[] = [
  {
    name: 'get_current_location_context',
    description: `Get the user's current location state: where they are, what geofences they're inside, which job/property that corresponds to, what time entries are currently running. Use this to answer "where am I" / "what am I on" / "am I on the clock" questions.`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_time_on_job',
    description: `Get detailed time tracking data for a job: total on-site minutes, drive time, mileage, cost breakdown. Use for "how long have I been on X" and "what's my real labor cost on this job" questions.`,
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        include_drive_time: { type: 'boolean', default: true },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'get_trip_history',
    description: `List trips over a date range. Useful for "where was I Tuesday", mileage reports, or understanding drive-time patterns.`,
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date' },
        end_date: { type: 'string', description: 'ISO date' },
        job_id: { type: 'string', description: 'Filter to one job' },
        customer_id: { type: 'string', description: 'Filter to one customer' },
        purpose: {
          type: 'array',
          items: { type: 'string', enum: ['to_job', 'from_job', 'between_jobs', 'supply_run', 'commute', 'personal', 'unknown'] },
        },
        billable_only: { type: 'boolean', default: false },
        limit: { type: 'integer', default: 50 },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_mileage_report',
    description: `Generate an IRS-compliant mileage report for a period. Returns total miles, business miles, total deductible amount, and per-trip breakdown. Use at tax time or for monthly review.`,
    input_schema: {
      type: 'object',
      properties: {
        year: { type: 'integer' },
        month: { type: 'integer', description: '1-12, omit for full year' },
        breakdown_by: { type: 'string', enum: ['job', 'customer', 'purpose', 'day', 'none'], default: 'none' },
      },
      required: ['year'],
    },
  },
  {
    name: 'get_geofence',
    description: 'Get details of a geofence: center, radius, attached property/job, preferences.',
    input_schema: {
      type: 'object',
      properties: {
        geofence_id: { type: 'string' },
      },
      required: ['geofence_id'],
    },
  },
  {
    name: 'list_geofences',
    description: 'List geofences with filters.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'array',
          items: { type: 'string', enum: ['property', 'home', 'shop', 'supplier', 'custom'] },
        },
        active_only: { type: 'boolean', default: true },
        near_location: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
            radius_miles: { type: 'number', default: 10 },
          },
        },
      },
    },
  },
  {
    name: 'get_location_prefs',
    description: 'Get the effective location/tracking preferences for a context. Shows what would happen given current org/user/customer/job inheritance.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        job_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_today_activity',
    description: `Get everything that happened today: jobs visited, time entries, trips, captures, prompts. Use for "summarize my day" or end-of-day review.`,
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date, defaults to today' },
      },
    },
  },
];

// =============================================================================
// LOCATION WRITE TOOLS (preference + geofence management)
// =============================================================================

export const locationWriteTools: Tool[] = [
  {
    name: 'update_user_location_prefs',
    description: `Update the user's personal tracking preferences. Use for requests like "track me on Saturdays too", "turn off tracking during vacation next week", "use larger geofences by default".`,
    input_schema: {
      type: 'object',
      properties: {
        tracking_enabled: { type: 'boolean' },
        business_hours: {
          type: 'object',
          description: 'Object keyed by day abbrev: mon, tue, wed, etc. Values are arrays of [start, end] time strings like "07:00".',
        },
        track_outside_business_hours: { type: 'boolean' },
        vacation_mode: { type: 'boolean' },
        vacation_until: { type: 'string', description: 'ISO date' },
        default_geofence_radius_m: { type: 'integer' },
        default_dwell_seconds: { type: 'integer' },
        auto_create_time_entries: { type: 'boolean' },
        require_confirmation: { type: 'boolean' },
        default_trip_billable: { type: 'boolean' },
        mileage_rate_override: { type: 'number' },
      },
    },
  },
  {
    name: 'update_customer_location_prefs',
    description: `Set customer-specific location preferences: geofence size, notification timing, quiet hours, billing rules. Use for "set Emily to get arrival texts 45 min out", "don't bill drive time for the Williams account", "Henderson is home-sensitive".`,
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        geofence_radius_m: { type: 'integer' },
        send_arrival_notification: { type: 'boolean' },
        arrival_notification_lead_minutes: { type: 'integer' },
        send_on_the_way_texts: { type: 'boolean' },
        send_departure_summary: { type: 'boolean' },
        quiet_hours_start: { type: 'string', description: 'HH:MM' },
        quiet_hours_end: { type: 'string', description: 'HH:MM' },
        bill_drive_time: { type: 'boolean' },
        is_home_sensitive: { type: 'boolean' },
        is_commercial_recurring: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'update_job_location_prefs',
    description: `Set job-specific overrides. Use for "this is a warranty call, don't bill drive time", "emergency job, allow after-hours tracking", "use a 200m fence for this job site since it's a bigger property".`,
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        tracking_enabled: { type: 'boolean' },
        geofence_radius_m: { type: 'integer' },
        bill_drive_time: { type: 'boolean' },
        allow_after_hours: { type: 'boolean' },
        send_arrival_notification: { type: 'boolean' },
        arrival_notification_lead_minutes: { type: 'integer' },
        notes: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_geofence',
    description: `Create a manual geofence (supplier, shop, custom location, or override a property fence). For property-based fences, use update_property_geofence instead which edits the auto-generated one.`,
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['home', 'shop', 'supplier', 'custom'] },
        label: { type: 'string' },
        address: { type: 'string', description: 'Address to geocode, or provide lat/lng' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        radius_meters: { type: 'integer', default: 75 },
        notes: { type: 'string' },
      },
      required: ['type', 'label'],
    },
  },
  {
    name: 'update_property_geofence',
    description: 'Adjust the geofence for a property: size, center location, or disable auto-tracking for this property.',
    input_schema: {
      type: 'object',
      properties: {
        property_id: { type: 'string' },
        radius_meters: { type: 'integer' },
        center_lat: { type: 'number', description: 'Override the geocoded center' },
        center_lng: { type: 'number' },
        hide_from_auto_tracking: { type: 'boolean' },
      },
      required: ['property_id'],
    },
  },
  {
    name: 'confirm_time_entry',
    description: 'Confirm or edit an auto-generated time entry. Use when reviewing the day.',
    input_schema: {
      type: 'object',
      properties: {
        time_entry_id: { type: 'string' },
        confirm: { type: 'boolean', description: 'true to accept as-is' },
        edits: {
          type: 'object',
          properties: {
            started_at: { type: 'string' },
            ended_at: { type: 'string' },
            job_id: { type: 'string' },
            is_billable: { type: 'boolean' },
            notes: { type: 'string' },
          },
        },
        delete: { type: 'boolean', description: 'true to remove (e.g. false arrival)' },
      },
      required: ['time_entry_id'],
    },
  },
  {
    name: 'reclassify_trip',
    description: 'Change a trip\'s classification: purpose, job attribution, billable flag. Use when the auto-classifier guessed wrong.',
    input_schema: {
      type: 'object',
      properties: {
        trip_id: { type: 'string' },
        purpose: { type: 'string', enum: ['to_job', 'from_job', 'between_jobs', 'supply_run', 'commute', 'personal'] },
        job_id: { type: 'string', description: 'null to unassign' },
        is_billable: { type: 'boolean' },
      },
      required: ['trip_id'],
    },
  },
  {
    name: 'disable_tracking_for_period',
    description: 'Temporarily turn off location tracking. Use for "I\'m going camping this weekend, no tracking", "vacation next week".',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'ISO datetime' },
        end: { type: 'string', description: 'ISO datetime' },
        reason: { type: 'string' },
      },
      required: ['start', 'end'],
    },
  },
];

// =============================================================================
// AUTOMATION TOOLS
// =============================================================================

export const automationTools: Tool[] = [
  {
    name: 'list_automation_rules',
    description: 'List the user\'s active automation rules. Use for "what automations do I have" / "show my rules".',
    input_schema: {
      type: 'object',
      properties: {
        trigger_type: { type: 'string', description: 'Filter by trigger type' },
        enabled_only: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'get_automation_rule',
    description: 'Get full details of a single rule including conditions and actions.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'toggle_automation_rule',
    description: 'Enable or disable an automation rule.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['rule_id', 'enabled'],
    },
  },
  {
    name: 'create_automation_rule',
    description: `Create a new automation rule. Use when the user says "remind me to...", "whenever X happens, do Y", "always text the customer when...".

Build the rule by:
1. Identifying the trigger (what event starts it)
2. Adding conditions that must hold
3. Defining actions to take

Present the rule for approval before creating.`,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short label' },
        description: { type: 'string', description: 'Plain English what it does' },
        trigger_type: {
          type: 'string',
          enum: [
            'geofence_entered', 'geofence_exited', 'geofence_dwelled',
            'approaching_geofence', 'trip_started', 'trip_ended',
            'job_status_changed', 'quote_sent', 'quote_viewed', 'quote_stale',
            'invoice_overdue', 'scheduled_time', 'capture_uploaded', 'communication_received',
          ],
        },
        trigger_config: { type: 'object' },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              op: { type: 'string' },
              value: {},
            },
            required: ['path', 'op', 'value'],
          },
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              config: { type: 'object' },
            },
            required: ['type', 'config'],
          },
        },
        applies_to_customer_ids: { type: 'array', items: { type: 'string' } },
        applies_to_job_ids: { type: 'array', items: { type: 'string' } },
        cooldown_seconds: { type: 'integer' },
      },
      required: ['name', 'trigger_type', 'actions'],
    },
  },
  {
    name: 'update_automation_rule',
    description: 'Modify an existing rule.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string' },
        updates: { type: 'object', description: 'Any rule fields to change' },
      },
      required: ['rule_id', 'updates'],
    },
  },
  {
    name: 'delete_automation_rule',
    description: 'Delete a user-created rule. System default rules cannot be deleted, only disabled.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'get_automation_history',
    description: 'Show recent automation firings — what triggered, what actions ran, outcomes. Useful for debugging or reviewing activity.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string', description: 'Filter to one rule' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        outcome: { type: 'string', enum: ['succeeded', 'skipped', 'partial', 'failed'] },
        limit: { type: 'integer', default: 50 },
      },
    },
  },
  {
    name: 'respond_to_prompt',
    description: 'Respond to a pending user prompt (from an automation\'s prompt_user action).',
    input_schema: {
      type: 'object',
      properties: {
        prompt_id: { type: 'string' },
        response_option_id: { type: 'string', description: 'The id of the option the user chose' },
        response_data: { type: 'object', description: 'Any additional response data (e.g. edited draft)' },
      },
      required: ['prompt_id', 'response_option_id'],
    },
  },
  {
    name: 'list_pending_prompts',
    description: 'List open user prompts awaiting response.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
      },
    },
  },
];

// =============================================================================
// COMBINED EXPORT
// =============================================================================

export const allLocationTools = [
  ...locationReadTools,
  ...locationWriteTools,
];

export const allAutomationTools = [
  ...automationTools,
];

/** Tools to make available alongside base definitions.ts tools */
export const locationAndAutomationTools = [
  ...locationReadTools,
  ...locationWriteTools,
  ...automationTools,
];
