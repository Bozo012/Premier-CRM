# Architecture

How the pieces fit together. Read this when you're about to add a new file and aren't sure where it goes, or when you're connecting two layers and aren't sure which one owns what.

## High-level layers

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Next.js App Router)                                │
│  Server components for reads · Client components for forms  │
│  Suspense boundaries · Optimistic UI                        │
└────────────────────┬────────────────────────────────────────┘
                     │ Server Actions / Route Handlers
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER (server-side)                            │
│  Server actions in app/[route]/actions.ts                   │
│  Webhook handlers in app/api/webhooks/                      │
│  AI tool dispatch in app/api/assistant/tools/               │
└────────────────────┬────────────────────────────────────────┘
                     │ Calls into packages
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  DOMAIN PACKAGES (pure logic, no Next.js)                   │
│  packages/db        — typed queries, RPC wrappers           │
│  packages/ai        — tool definitions, prompts, dispatch   │
│  packages/shared    — types, Zod schemas, utilities         │
│  packages/automation — rule engine                          │
└────────────────────┬────────────────────────────────────────┘
                     │ Supabase JS client
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE                                                   │
│  Postgres (data + RLS) · Storage · Auth · Edge Functions    │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  ASYNC WORKERS (Edge Functions, triggered by pg_net/cron)   │
│  Transcription · Embedding · Daily briefing                 │
│  Automation event processor · Geofence event resolver       │
│  Material price refresh · EIA fuel price feed               │
└─────────────────────────────────────────────────────────────┘
```

## Where things live

```
premier-crm/
├── apps/
│   ├── web/                    Next.js app — web + customer portal
│   │   ├── app/                App Router routes
│   │   │   ├── (authenticated)/         For Kevin/team
│   │   │   │   ├── today/               Today screen
│   │   │   │   ├── customers/           Customer list + detail
│   │   │   │   ├── jobs/                Jobs list + detail
│   │   │   │   ├── quotes/              Quote builder
│   │   │   │   ├── invoices/            Invoices
│   │   │   │   ├── vault/               Semantic search UI
│   │   │   │   ├── chat/                AI assistant chat
│   │   │   │   └── settings/            All settings
│   │   │   ├── (public)/                Customer-facing
│   │   │   │   └── q/[token]/           Magic-link quote view
│   │   │   ├── api/
│   │   │   │   ├── webhooks/            Stripe, Twilio, Resend
│   │   │   │   ├── assistant/tools/     AI tool dispatch
│   │   │   │   └── v1/                  Mobile API
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx                 Today / dashboard
│   │   ├── components/                  React components
│   │   └── lib/                         App-specific utilities
│   └── mobile/                 Expo app (Phase 4 — see MOBILE-STRATEGY.md)
├── packages/
│   ├── shared/                 Cross-cutting types and utilities
│   │   ├── types/              Shared TypeScript types
│   │   ├── schemas/            Zod schemas (used by both client and server)
│   │   ├── errors/             ErrorCode enum + typed errors
│   │   └── utils/              Pure functions (date math, money, etc.)
│   ├── db/                     Database access layer
│   │   ├── types.ts            GENERATED from Supabase — never edit
│   │   ├── client.ts           Supabase client factory
│   │   ├── queries/            One file per entity (customers.ts, jobs.ts...)
│   │   └── rpc/                Wrappers for Postgres functions
│   ├── ai/                     AI orchestration
│   │   ├── tools/              Tool definitions (definitions.ts, location-tools.ts, catalog-tools.ts)
│   │   ├── handlers/           Tool execution handlers (one per tool)
│   │   ├── prompts/            System prompts and templates
│   │   ├── models.ts           Model selection (haiku/sonnet/opus)
│   │   └── dispatch.ts         Map tool name → handler
│   ├── automation/             Rule engine
│   │   ├── engine.ts           Trigger → conditions → actions
│   │   └── services.ts         ActionServices implementations
│   └── transcription/          Audio processing
│       └── providers/          deepgram.ts, whisper.ts, lm-studio.ts
├── supabase/
│   ├── migrations/             SQL migrations (sequential)
│   ├── functions/              Edge functions
│   │   ├── process-capture/    Transcribe + classify + embed
│   │   ├── automation-runner/  Process geofence events
│   │   ├── briefing-generator/ Daily briefing cron
│   │   └── eia-fuel-feed/      Weekly fuel price update
│   └── seed.sql                Demo data
├── docs/
│   ├── 01-PRD.md               Product requirements
│   ├── 02-capture-pipeline.md  Capture flow
│   ├── 03-build-sequence.md    Phase plan
│   ├── 04-location-and-automation-ux.md
│   └── 05-service-catalog-ux.md
├── CONVENTIONS.md              Code style and rules
├── ARCHITECTURE.md             This file
├── DECISIONS.md                Why we chose what
├── MOBILE-STRATEGY.md          PWA-first plan
├── STARTER-DATA.md             Cold start + Jobber import
└── README.md                   Overview
```

## Data flow examples

### Example 1: Kevin creates a customer via the web UI

```
1. User fills form in app/customers/new/page.tsx (client component)
2. Form submits to server action in app/customers/actions.ts:createCustomer
3. Server action validates with Zod schema from @premier/shared
4. Server action calls @premier/db/queries/customers.ts:create
5. Query inserts via Supabase typed client
6. RLS enforces org_id matches authenticated user's org
7. Server action returns { success: true, data: customer }
8. Client component shows toast + redirects to customer detail
```

### Example 2: Kevin captures a voice memo on his phone

```
1. PWA records audio via MediaRecorder API
2. Uploads to /api/v1/captures (POST)
3. Route handler creates vault_item (status='pending') with location
4. Route handler enqueues transcription job via pg_net
5. Edge function process-capture picks up the job
6. Calls Deepgram API for transcription
7. Calls Claude Haiku for classification
8. DB trigger enrich_vault_item_from_location auto-links to property/job/customer
9. Calls Sonnet for summary
10. Calls OpenAI for embedding
11. Updates vault_item to status='processed'
12. Triggers 'capture_uploaded' automation event
13. Push notification to Kevin: "Recording processed, 2 action items found"
```

### Example 3: Geofence triggers automation

```
1. Mobile sends location_event to /api/v1/locations
2. Edge function checks if location enters/exits any geofence
3. If yes, creates geofence_event row
4. Triggers automation engine (packages/automation/engine.ts)
5. Engine loads matching rules for trigger_type='geofence_entered'
6. For each rule, evaluates conditions against event context
7. If conditions pass, executes actions via ActionServices
8. Each action is logged to automation_events
9. User-facing prompts go to user_prompts table
10. Mobile app polls or subscribes to user_prompts changes
```

### Example 4: Kevin asks the AI assistant a question

```
1. User types in chat UI (client component subscribes to assistant_messages)
2. Submits to server action sendMessage
3. Server action calls @premier/ai/dispatch with conversation history
4. Dispatch picks model (Sonnet by default), loads tools for context
5. Sends to Anthropic API with tool definitions
6. If tool call returned: dispatch routes to handler in packages/ai/handlers/
7. Handler executes, returns result
8. Loop until model returns final text response
9. Each turn saved to assistant_messages
10. Final response streamed to client
```

## State management

- **Server state:** Lives in Postgres. Always source of truth.
- **URL state:** For shareable views (filters, sorts, selected items). Use Next.js search params.
- **Client state:** React `useState`/`useReducer` for ephemeral UI state only.
- **Form state:** React Hook Form.
- **Real-time updates:** Supabase realtime subscriptions for things that need it (chat, automation prompts, time tracking). Polling for things that don't (lists, dashboards refresh on navigation).
- **Caching:** Next.js built-in fetch caching for server-rendered data. Manual `revalidatePath` after mutations. No client-side cache library (no React Query, no SWR) — server components handle this.

## Authentication

- **Web (contractor/staff):** Supabase Auth with email + password, stored in SSR cookies for shared browser/server sessions. New contractor/staff accounts are provisioned by owner/admin invite rather than open self-signup.
- **Customer portal:** Magic link tokens stored in `magic_link_tokens` table, scoped to specific quote/invoice/job. Single-use, 30-day default expiry.
- **Mobile:** Supabase Auth, persistent token in secure storage.
- **API:** Bearer token from Supabase Auth session.
- **Webhooks:** HMAC signature verification per provider (Stripe-Signature, Twilio-Signature, etc.).

## File storage

- **Buckets:**
  - `recordings` — audio files, private, signed URLs
  - `photos` — images, private, signed URLs
  - `documents` — PDFs and other docs, private
  - `receipts` — material receipts, private
  - `quotes` — generated quote PDFs, private
  - `invoices` — generated invoice PDFs, private
- **All buckets have RLS:** users can only access files belonging to their org.
- **Signed URLs:** 1-hour default expiry for app access, 30-day for customer portal links.

## AI model routing

| Task | Model | Why |
|------|-------|-----|
| Quick classification (vault item type, sentiment, entity extraction) | Claude Haiku 4.5 | Fast, cheap, good enough |
| Standard reasoning (summaries, drafting, chat) | Claude Sonnet 4.6 | Default for most things |
| Complex synthesis (briefing generation, multi-step planning) | Claude Opus 4.7 | Worth the cost for high-impact tasks |
| Embedding | OpenAI text-embedding-3-large | Best quality/$ for semantic search |
| Transcription | Deepgram (cloud) or Whisper (LM Studio for local) | Provider abstraction in packages/transcription |

## Background jobs

- **Triggered by Postgres:** pg_net for HTTP-triggered jobs (e.g., process-capture after vault_item insert)
- **Cron:** pg_cron for scheduled jobs (daily briefing at 5:30am, fuel price refresh weekly, location event purge nightly)
- **No queue:** Postgres + pg_net is enough at our scale. Don't add Redis/BullMQ until we genuinely outgrow it.

## Environments

- **Local dev:** Docker Compose with local Supabase. Optional LM Studio for offline AI.
- **Staging:** Optional. Vercel preview deployments + dedicated Supabase project.
- **Production:** Vercel + Supabase cloud. Single instance, single org (Premier) for now.

## Open source readiness

The codebase should always be ready to be open-sourced even before we actually do it. That means:
- No Premier-specific business logic in `packages/` (only in `apps/web` and `supabase/migrations/0008_premier_seed.sql`)
- No hardcoded credentials or secrets — all via env vars
- Generic naming: `org_id` not `premier_org_id`
- Migrations 0001-0007 are reusable; 0008 is the only Premier-specific one and is meant to be deleted/replaced for other deployments
