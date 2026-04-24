/**
 * Premier Brain — Service Catalog Tools
 *
 * Tools that let the AI assistant manage the service catalog conversationally.
 * Lets the user add/edit/archive services from chat, or have the AI suggest
 * additions based on patterns in their job history.
 *
 * Import alongside other tools:
 *   import { catalogTools } from './catalog-tools';
 */

import type { Anthropic } from '@anthropic-ai/sdk';
type Tool = Anthropic.Messages.Tool;

// =============================================================================
// CATALOG MANAGEMENT TOOLS
// =============================================================================

export const catalogTools: Tool[] = [
  {
    name: 'list_services',
    description: `List services in the catalog. Use to answer "what services do I offer?" or "show me my drywall services" type questions, or to find an existing service before suggesting an add.`,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter to a single category' },
        search: { type: 'string', description: 'Free-text search across name and description' },
        confidence: {
          type: 'array',
          items: { type: 'string', enum: ['unconfirmed', 'low', 'medium', 'high'] },
          description: 'Filter by confidence level',
        },
        active_only: { type: 'boolean', default: true },
        include_stats: { type: 'boolean', default: false, description: 'Include times_quoted, times_won' },
      },
    },
  },
  
  {
    name: 'get_service',
    description: 'Get full details of a single service including scope, exclusions, and pricing history.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string' },
      },
      required: ['service_id'],
    },
  },
  
  {
    name: 'create_service',
    description: `Add a new service to the catalog. Use when the user says "add a service for X", "I just did Y, let's add it to my catalog", or when they're mid-quote and need a service that doesn't exist yet.

ALWAYS present the proposed service for confirmation before creating. Show the rate, metric, category, and any scope notes so they can adjust.

If the user gives a single rate (not a range), set rate_low = rate_high = rate_confirmed and confidence = 'high' (they're telling you their actual rate).
If the user gives a range, set confidence = 'low' and leave rate_confirmed null.
If the user is unsure about pricing, search comparable rates first (web_search) and propose a researched range with confidence = 'unconfirmed'.`,
    input_schema: {
      type: 'object',
      properties: {
        category: { 
          type: 'string',
          description: 'Existing category if applicable, or new category name',
        },
        name: { type: 'string', description: 'Short service name, e.g. "Soffit repair"' },
        description: { type: 'string', description: 'One-sentence description' },
        pricing_metric: {
          type: 'string',
          enum: ['flat', 'per_sqft', 'per_lf', 'per_each', 'per_hour', 'quote_per_job', 'surcharge_pct'],
          description: 'How this is priced',
        },
        unit_label: { type: 'string', description: 'Display unit, e.g. "patch", "sq ft", "linear ft"' },
        rate_low: { type: 'number', description: 'Low end of range (or single rate)' },
        rate_high: { type: 'number', description: 'High end of range (or same as rate_low)' },
        rate_confirmed: { type: 'number', description: 'Confirmed actual rate, if user supplied' },
        confidence: {
          type: 'string',
          enum: ['unconfirmed', 'low', 'medium', 'high'],
          description: 'Default to "unconfirmed" for researched ranges, "high" if user gave a specific rate',
        },
        scope_includes: { type: 'string', description: 'What is included in the price' },
        scope_excludes: { type: 'string', description: 'What is NOT included' },
        common_addons: { type: 'string', description: 'Things that commonly bump the price' },
        exclusion_note: { type: 'string', description: 'E.g., "Permit required if attached"' },
        permit_check: {
          type: 'object',
          description: 'If this service triggers permit guardrails, reference them here',
        },
        use_immediately_in_quote: {
          type: 'string',
          description: 'If user is mid-quote, the quote_id to add this service to once created',
        },
      },
      required: ['category', 'name', 'pricing_metric', 'unit_label'],
    },
  },
  
  {
    name: 'update_service',
    description: `Update an existing service in the catalog. Use when the user says "set my drywall patch rate to $100", "rename trim install to baseboard install", "change the description on...".

When updating a rate from a range to a confirmed value, also set confidence = 'high' and rate_confirmed.`,
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string' },
        updates: {
          type: 'object',
          description: 'Any service fields to change',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            pricing_metric: { type: 'string' },
            unit_label: { type: 'string' },
            rate_low: { type: 'number' },
            rate_high: { type: 'number' },
            rate_confirmed: { type: 'number' },
            confidence: { type: 'string' },
            scope_includes: { type: 'string' },
            scope_excludes: { type: 'string' },
            common_addons: { type: 'string' },
            exclusion_note: { type: 'string' },
            is_active: { type: 'boolean' },
          },
        },
      },
      required: ['service_id', 'updates'],
    },
  },
  
  {
    name: 'archive_service',
    description: 'Mark a service as inactive (preserves history but hides from catalog). Use for services the user no longer offers. Reversible via update_service with is_active=true.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string' },
        reason: { type: 'string', description: 'Optional note about why' },
      },
      required: ['service_id'],
    },
  },
  
  {
    name: 'suggest_services_from_history',
    description: `Analyze the user's past jobs and suggest services they've billed but haven't formalized in the catalog. Returns a list of suggested catalog entries with usage stats.

Use this when the user asks "what should I add to my catalog?" or "am I missing anything?" or after they've completed several jobs without using catalog items.`,
    input_schema: {
      type: 'object',
      properties: {
        lookback_days: { type: 'integer', default: 90, description: 'How far back to analyze' },
        min_occurrences: { type: 'integer', default: 2, description: 'Minimum times something appears to suggest it' },
      },
    },
  },
  
  {
    name: 'create_service_category',
    description: 'Create a new top-level category like "Gutters" or "Pressure Washing". Use when adding the first service in a new domain.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        sort_order: { type: 'integer', description: 'Where it appears in the list (default: end)' },
      },
      required: ['name'],
    },
  },
  
  {
    name: 'get_pricing_research',
    description: `Research market rates for a service in the user's region. Combines: 
    1) the user's own past jobs (highest weight),
    2) regional market data via web search,
    3) industry benchmarks.
    
    Returns a researched rate range with confidence and sources. Use this BEFORE suggesting a new service entry when the user doesn't have a settled rate yet.`,
    input_schema: {
      type: 'object',
      properties: {
        service_description: { type: 'string', description: 'Free-text description of the work' },
        pricing_metric: { type: 'string', description: 'Per-unit, hourly, or flat' },
        region: { type: 'string', description: 'Defaults to user org region (e.g., Northern Kentucky)' },
      },
      required: ['service_description'],
    },
  },
  
  {
    name: 'flag_services_for_review',
    description: `Identify services that need pricing review based on:
    - Win rate < 30% (likely overpriced)
    - Win rate > 90% (likely underpriced)  
    - Used 5+ times but still confidence='unconfirmed'
    - Last quoted > 6 months ago (rates may be stale)
    
    Use during periodic reviews or when user asks "what should I update?".`,
    input_schema: {
      type: 'object',
      properties: {
        min_uses: { type: 'integer', default: 3 },
      },
    },
  },
];

// =============================================================================
// EXPORT
// =============================================================================

export const allCatalogTools = catalogTools;
