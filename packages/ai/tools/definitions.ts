/**
 * Premier Brain — AI Assistant Tool Definitions
 *
 * These are the tools available to the AI orchestrator. Each tool corresponds
 * to a CRM operation. The orchestrator uses Anthropic's tool use API to let
 * Claude call these naturally based on user requests.
 *
 * Convention:
 * - Read tools execute immediately
 * - Write tools (create_*, send_*, update_*) require user approval before execution
 *   unless the conversation has approved a "trust mode" for the session
 *
 * Tools are grouped into bundles. The orchestrator can load a subset based
 * on context (e.g., when chatting from a job page, load job-scoped tools first).
 */

import type { Anthropic } from '@anthropic-ai/sdk';

type Tool = Anthropic.Messages.Tool;

// =============================================================================
// VAULT & SEARCH
// =============================================================================

export const vaultTools: Tool[] = [
  {
    name: 'query_vault',
    description: `Search the semantic vault for any captured content (recordings, transcripts, photos, notes, emails, texts). Use this when the user asks about something they may have said, photographed, or noted in the past. Combines vector similarity with full-text search.

Examples of when to use:
- "What did I say about the gable vent?"
- "Find that voicemail from the customer last Tuesday"
- "Show me photos of past drywall jobs"
- "What was that material I tried that worked well?"`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what to find. Will be embedded for semantic search.',
        },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['recording', 'transcript', 'photo', 'note', 'email_body', 'sms_body', 'call_summary', 'document', 'receipt', 'job_summary'],
          },
          description: 'Filter by vault item types. Omit to search all.',
        },
        customer_id: { type: 'string', description: 'Restrict to one customer' },
        property_id: { type: 'string', description: 'Restrict to one property' },
        job_id: { type: 'string', description: 'Restrict to one job' },
        after_date: { type: 'string', description: 'ISO date — only items after this' },
        before_date: { type: 'string', description: 'ISO date — only items before this' },
        limit: { type: 'integer', default: 10, description: 'Max results (1-50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_similar_jobs',
    description: 'Find past completed jobs similar to a description. Use this when estimating a new job to see what comparable work cost.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the job to compare against',
        },
        limit: { type: 'integer', default: 5 },
      },
      required: ['description'],
    },
  },
  {
    name: 'get_property_memory',
    description: 'Get the full history of work done at a property — all jobs, photos, notes, recordings tied to that address. Use when a returning customer requests new work, or when planning a visit.',
    input_schema: {
      type: 'object',
      properties: {
        property_id: { type: 'string' },
      },
      required: ['property_id'],
    },
  },
];

// =============================================================================
// CRM READS
// =============================================================================

export const crmReadTools: Tool[] = [
  {
    name: 'lookup_customer',
    description: 'Find a customer by name, phone, email, or other identifier. Returns matches with basic info. Use this before any customer-scoped action to confirm the right person.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, phone, email, or other identifier' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_customer_360',
    description: 'Get a complete view of a customer: profile, properties, recent jobs, open quotes, unpaid invoices, recent communications, open tasks. Use this when you need full context about a customer.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'lookup_property',
    description: 'Find a property by address (full or partial). Returns matches.',
    input_schema: {
      type: 'object',
      properties: {
        address_query: { type: 'string', description: 'Address, partial address, or zip' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['address_query'],
    },
  },
  {
    name: 'get_job',
    description: 'Get full details of a job by ID, including phases, quotes, invoices, time entries, and recent communications.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_jobs',
    description: 'List jobs with filters. Use for queries like "show me active jobs", "what did we do last month", etc.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: ['lead', 'site_visit_scheduled', 'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid', 'cancelled', 'on_hold'] },
        },
        customer_id: { type: 'string' },
        property_id: { type: 'string' },
        category: { type: 'string', description: 'Service category name' },
        scheduled_after: { type: 'string', description: 'ISO date' },
        scheduled_before: { type: 'string', description: 'ISO date' },
        completed_after: { type: 'string', description: 'ISO date' },
        completed_before: { type: 'string', description: 'ISO date' },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_quotes',
    description: 'List quotes with filters. Useful for "what quotes are still pending?" or "show me all quotes I sent in March".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'] },
        },
        customer_id: { type: 'string' },
        sent_after: { type: 'string' },
        sent_before: { type: 'string' },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_invoices',
    description: 'List invoices with filters. Useful for cash flow and AR queries.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'] },
        },
        customer_id: { type: 'string' },
        overdue_only: { type: 'boolean', default: false },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_communications',
    description: 'List recent SMS, emails, calls. Useful for "who has been trying to reach me?" or "what conversations did I have today?".',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        job_id: { type: 'string' },
        unread_only: { type: 'boolean', default: false },
        after: { type: 'string', description: 'ISO timestamp' },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
  {
    name: 'list_tasks',
    description: 'List action items / tasks. Useful for "what do I need to do today?".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: ['open', 'in_progress', 'done', 'snoozed'] },
        },
        due_before: { type: 'string', description: 'ISO date' },
        priority: {
          type: 'array',
          items: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        },
        limit: { type: 'integer', default: 50 },
      },
    },
  },
];

// =============================================================================
// PRICING & ANALYTICS
// =============================================================================

export const pricingTools: Tool[] = [
  {
    name: 'get_pricing_suggestion',
    description: `Get a market-calibrated pricing suggestion for a service line item. Considers historical win rates, local material costs, and seasonal factors. Use this whenever drafting a quote line.

Returns suggested price, range (low-high), confidence score, and a one-sentence basis explanation.`,
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'Service item ID. If unknown, use service_description instead.' },
        service_description: { type: 'string', description: 'Plain description of the service if no ID' },
        zip_code: { type: 'string', description: 'Property zip for local pricing' },
        quantity: { type: 'number', default: 1 },
      },
    },
  },
  {
    name: 'get_pricing_history',
    description: 'Get historical pricing stats for a service: median, range, win rate, sample size. Useful when the user asks "what did I quote for X last year?".',
    input_schema: {
      type: 'object',
      properties: {
        service_query: { type: 'string', description: 'Service name or description' },
        zip_code: { type: 'string' },
        lookback_months: { type: 'integer', default: 12 },
      },
      required: ['service_query'],
    },
  },
  {
    name: 'get_material_price',
    description: 'Get current price for a material from a supplier in a specific zip. Uses cached prices or triggers a fresh API lookup.',
    input_schema: {
      type: 'object',
      properties: {
        material_id: { type: 'string' },
        material_description: { type: 'string', description: 'Use if material_id unknown' },
        zip_code: { type: 'string' },
        supplier: { type: 'string', enum: ['home_depot', 'lowes', 'ferguson', 'any'], default: 'any' },
      },
    },
  },
  {
    name: 'find_anomalies',
    description: 'Find jobs that need attention: over budget, stale leads, unviewed quotes, overdue invoices.',
    input_schema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string', enum: ['labor_overrun', 'material_overrun', 'stale_lead', 'quote_unviewed', 'invoice_overdue'] },
        },
      },
    },
  },
  {
    name: 'summarize_period',
    description: 'Generate a summary of activity over a period: revenue, jobs completed, quotes sent, win rate, etc.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date' },
        end_date: { type: 'string', description: 'ISO date' },
      },
      required: ['start_date', 'end_date'],
    },
  },
];

// =============================================================================
// CRM WRITES — these require approval before execution
// =============================================================================

export const crmWriteTools: Tool[] = [
  {
    name: 'create_quote',
    description: `Create a draft quote for a job. The quote starts as 'draft' and is NOT sent until you call send_quote.

Generally you should:
1. Confirm the job_id and customer
2. Suggest line items via get_pricing_suggestion
3. Present the draft to the user
4. Wait for approval before send_quote`,
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        type: { type: 'string', enum: ['standard', 'options', 'package', 'quick'], default: 'standard' },
        title: { type: 'string' },
        intro_text: { type: 'string' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string' },
              unit_price: { type: 'number' },
              option_group: { type: 'string', description: 'For options quotes: "good", "better", "best"' },
            },
            required: ['name', 'quantity', 'unit', 'unit_price'],
          },
        },
        valid_until: { type: 'string', description: 'ISO date' },
      },
      required: ['job_id', 'line_items'],
    },
  },
  {
    name: 'send_quote',
    description: 'Send a draft quote to the customer via SMS, email, or both. The customer receives a magic link to view the interactive quote.',
    input_schema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string' },
        channels: {
          type: 'array',
          items: { type: 'string', enum: ['sms', 'email'] },
        },
        custom_message: { type: 'string', description: 'Optional message to include with the quote' },
      },
      required: ['quote_id', 'channels'],
    },
  },
  {
    name: 'create_job',
    description: 'Create a new job for a customer at a property.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        property_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'emergency'], default: 'normal' },
        scheduled_start: { type: 'string', description: 'ISO timestamp' },
        estimated_duration_minutes: { type: 'integer' },
      },
      required: ['customer_id', 'property_id', 'title'],
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer record. Use only when no existing customer matches.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['residential', 'commercial', 'property_manager'], default: 'residential' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company_name: { type: 'string' },
        email: { type: 'string' },
        phone_primary: { type: 'string' },
        preferred_channel: { type: 'string', enum: ['sms', 'email', 'call', 'portal'] },
        source: { type: 'string', description: 'How they found us: referral, google, etc.' },
      },
    },
  },
  {
    name: 'create_property',
    description: 'Create a property and link it to a customer.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        address_line_1: { type: 'string' },
        address_line_2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        zip: { type: 'string' },
        access_notes: { type: 'string' },
        relationship: { type: 'string', enum: ['owner', 'manager', 'tenant'], default: 'owner' },
      },
      required: ['customer_id', 'address_line_1', 'city', 'state', 'zip'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Move a job to a new status.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        new_status: {
          type: 'string',
          enum: ['lead', 'site_visit_scheduled', 'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid', 'cancelled', 'on_hold'],
        },
        note: { type: 'string', description: 'Optional context for the status change' },
      },
      required: ['job_id', 'new_status'],
    },
  },
  {
    name: 'send_message',
    description: `Send an SMS or email to a customer, optionally tied to a job. Always present the draft for approval before sending unless trust mode is enabled.

For sensitive messages (declining a customer, discussing money), always require explicit approval.`,
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        job_id: { type: 'string' },
        channel: { type: 'string', enum: ['sms', 'email'] },
        subject: { type: 'string', description: 'Required for email' },
        body: { type: 'string' },
      },
      required: ['customer_id', 'channel', 'body'],
    },
  },
  {
    name: 'create_task',
    description: 'Create an action item / task. Use to capture things that need doing later.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
        due_at: { type: 'string', description: 'ISO timestamp' },
        customer_id: { type: 'string' },
        property_id: { type: 'string' },
        job_id: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'schedule_followup',
    description: 'Schedule a future automated follow-up message. Useful for "remind me to check in with this customer in 2 weeks" type requests.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        job_id: { type: 'string' },
        send_at: { type: 'string', description: 'ISO timestamp' },
        channel: { type: 'string', enum: ['sms', 'email'] },
        message_template: { type: 'string', description: 'The message to send, or describe what to say and AI will draft it at send time' },
      },
      required: ['customer_id', 'send_at', 'channel', 'message_template'],
    },
  },
];

// =============================================================================
// DRAFTING — generate content but don't send
// =============================================================================

export const draftingTools: Tool[] = [
  {
    name: 'draft_message',
    description: `Generate one or more draft messages for review. Returns variants the user can pick from. Use this for:
- Follow-ups
- Cold outreach
- Bad-news messages
- Apologies
- Anything where wording matters`,
    input_schema: {
      type: 'object',
      properties: {
        situation: { type: 'string', description: 'What the message is about / what happened' },
        goal: { type: 'string', description: 'What you want the recipient to do or feel' },
        tone: { type: 'string', enum: ['warm', 'professional', 'firm', 'apologetic', 'urgent'], default: 'warm' },
        channel: { type: 'string', enum: ['sms', 'email'] },
        customer_id: { type: 'string', description: 'For personalization' },
        job_id: { type: 'string', description: 'For context' },
        variants: { type: 'integer', default: 2, description: 'Number of variants to generate (1-3)' },
      },
      required: ['situation', 'goal', 'channel'],
    },
  },
  {
    name: 'draft_quote_text',
    description: 'Generate the intro/outro/terms text for a quote based on the job context.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        section: { type: 'string', enum: ['intro', 'outro', 'terms'] },
      },
      required: ['job_id', 'section'],
    },
  },
];

// =============================================================================
// EXTERNAL — outside-world data
// =============================================================================

export const externalTools: Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Use for: code/permit lookups, supplier info, weather forecasts, current events.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get weather forecast for a location and date range. Use when scheduling outdoor work.',
    input_schema: {
      type: 'object',
      properties: {
        zip_code: { type: 'string' },
        start_date: { type: 'string', description: 'ISO date' },
        end_date: { type: 'string', description: 'ISO date' },
      },
      required: ['zip_code', 'start_date'],
    },
  },
  {
    name: 'lookup_permits',
    description: 'Look up permit requirements for a job type in a specific jurisdiction. Uses web search + cached jurisdiction data.',
    input_schema: {
      type: 'object',
      properties: {
        zip_code: { type: 'string' },
        work_type: { type: 'string', description: 'e.g. "electrical panel replacement", "deck construction"' },
      },
      required: ['zip_code', 'work_type'],
    },
  },
];

// =============================================================================
// BUNDLES — context-specific tool sets
// =============================================================================

import {
  locationReadTools,
  locationWriteTools,
  automationTools,
} from './location-tools';

import { catalogTools } from './catalog-tools';

export const allTools = [
  ...vaultTools,
  ...crmReadTools,
  ...pricingTools,
  ...crmWriteTools,
  ...draftingTools,
  ...externalTools,
  ...locationReadTools,
  ...locationWriteTools,
  ...automationTools,
  ...catalogTools,
];

export const readOnlyTools = [
  ...vaultTools,
  ...crmReadTools,
  ...pricingTools,
  ...externalTools,
  ...locationReadTools,
  ...catalogTools.filter(t => ['list_services', 'get_service', 'flag_services_for_review'].includes(t.name)),
];

export const briefingTools = [
  ...crmReadTools,
  ...pricingTools.filter(t => ['find_anomalies', 'summarize_period'].includes(t.name)),
  ...externalTools.filter(t => t.name === 'get_weather'),
  ...locationReadTools.filter(t =>
    ['get_today_activity', 'get_current_location_context'].includes(t.name)),
  ...catalogTools.filter(t => 
    ['suggest_services_from_history', 'flag_services_for_review'].includes(t.name)),
];

/** In-field mobile bundle — what the assistant needs on the truck */
export const inFieldTools = [
  ...vaultTools,
  ...crmReadTools.filter(t => ['lookup_customer', 'lookup_property', 'get_job', 'get_property_memory'].includes(t.name)),
  ...pricingTools.filter(t => ['get_pricing_suggestion', 'get_material_price'].includes(t.name)),
  ...crmWriteTools.filter(t => ['create_task', 'update_job_status', 'send_message'].includes(t.name)),
  ...locationReadTools,
  ...locationWriteTools.filter(t =>
    ['confirm_time_entry', 'reclassify_trip'].includes(t.name)),
  ...automationTools.filter(t =>
    ['respond_to_prompt', 'list_pending_prompts'].includes(t.name)),
  // Catalog tools needed in-field for mid-quote add and lookup
  ...catalogTools.filter(t => 
    ['list_services', 'get_service', 'create_service', 'get_pricing_research'].includes(t.name)),
];

/** Settings/admin bundle — for configuring the system conversationally */
export const settingsTools = [
  ...locationReadTools,
  ...locationWriteTools,
  ...automationTools,
  ...catalogTools,
];
