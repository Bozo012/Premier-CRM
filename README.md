# Premier CRM

A contractor CRM with a semantic vault, learning AI assistant, and location-aware automation. Built first for Premier Property Maintenance LLC. Open-source release planned (AGPL-3.0) after stable production use.

---

## 🤖 If you are Claude Code, read these first (in this order)

1. **`CONVENTIONS.md`** — Code style, tech stack, non-negotiable rules
2. **`ARCHITECTURE.md`** — How the layers fit, where things live
3. **`DECISIONS.md`** — Why we chose what (read before changing things)
4. **`MOBILE-STRATEGY.md`** — PWA-first mobile plan
5. **`STARTER-DATA.md`** — Cold start + Jobber import strategy
6. **`docs/03-build-sequence.md`** — What we're building and in what order
7. **The relevant doc for the current task** (PRD section, capture pipeline, location UX, catalog UX)

Don't invent patterns silently. Check existing code → check docs → ask Kevin → only then innovate (and document the decision).

---

## What this is

Four systems in one:

1. **A complete contractor CRM** — quoting, scheduling, invoicing, payments, customer communications. Optimized for solo to small-team home service businesses.

2. **A semantic vault** — every recording, photo, note, email, text, and document gets transcribed, classified, summarized, embedded, and linked to the right customer/property/job. Becomes a queryable memory of your business.

3. **A learning AI assistant** — Claude-powered chat + proactive briefings that operate over both the structured CRM data and the vault.

4. **A location-aware automation layer** — GPS and geofences treated as first-class signals across every surface. Auto time tracking, auto mileage, auto-tagging of captured content, and a customizable rules engine. Every behavior controllable per user, per customer, or per job.

## Status

🚧 Pre-alpha. Building.

## Tech stack

- **Frontend:** Next.js 15 (App Router) — web + customer portal as a PWA
- **Backend:** Supabase (Postgres 15 + pgvector + PostGIS + Auth + Storage + Realtime + Edge Functions)
- **AI:** Anthropic Claude (Sonnet 4.6 + Haiku 4.5 + Opus 4.7), OpenAI embeddings, Deepgram transcription
- **Integrations:** Twilio, Stripe, Resend, Google Maps, BigBox API, EIA fuel feed
- **Infra:** Vercel + Supabase Cloud, Docker for local dev
- **Mobile:** PWA primary. Native React Native (Expo) deferred indefinitely. See `MOBILE-STRATEGY.md`.

## Repository structure

```
premier-crm/
├── apps/
│   ├── web/                    Next.js app (web + customer portal as PWA)
│   └── mobile/                 Expo app (Phase 4+, only if needed)
├── packages/
│   ├── shared/                 Types, Zod schemas, errors, utilities
│   ├── db/                     Generated types, queries, RPC wrappers
│   ├── ai/                     Tool definitions, prompts, dispatch
│   │   ├── tools/
│   │   │   ├── definitions.ts       Core tool definitions for Claude
│   │   │   ├── location-tools.ts    Location + automation tools
│   │   │   └── catalog-tools.ts     Service catalog management tools
│   │   ├── handlers/                Tool execution handlers
│   │   ├── prompts/                 System prompts and templates
│   │   └── transcription/           Deepgram, Whisper, LM Studio providers
│   └── automation/             Rule engine (trigger → conditions → actions)
├── supabase/
│   ├── migrations/             SQL migrations (run in order, never edit)
│   │   ├── 0001_init.sql                       Extensions, orgs, users, helpers
│   │   ├── 0002_crm_core.sql                   Customers, properties, jobs, quotes,
│   │   │                                        invoices, materials, time entries
│   │   ├── 0003_vault_and_comms.sql            Vault, communications, tasks, assistant
│   │   ├── 0004_search_functions.sql           Hybrid search functions
│   │   ├── 0005_location_and_automation.sql    Geofences, trips, prefs, rule engine
│   │   ├── 0006_seed_automations.sql           Default automation rules
│   │   ├── 0007_catalog_reconciliation.sql     Extends service_items with catalog
│   │   │                                        fields, customer archetypes,
│   │   │                                        org pricing policy, permit guardrails
│   │   ├── 0008_premier_seed.sql               Premier-specific seed data
│   │   ├── 0009_user_org_association.sql       Auto org join on signup, membership
│   │   │                                        status (pending/active), owner approval
│   │   ├── 0010_fix_auth_trigger_and_…         Schema-qualified handle_new_user,
│   │   │   dashboard_permissions.sql           pinned search_path on SECURITY DEFINER
│   │   │                                        functions, authenticated role grants
│   │   └── 0011_jobber_import_columns.sql      jobber_id columns + indexes on imported
│   │                                            tables for dedup during Jobber import
│   ├── functions/              Edge functions
│   └── seed.sql                Demo data (synthetic, for development)
├── scripts/                    One-off scripts (data import, etc.)
├── docs/
│   ├── 01-PRD.md                          Product requirements doc
│   ├── 02-capture-pipeline.md             Capture flow spec
│   ├── 03-build-sequence.md               Week-by-week build plan
│   ├── 04-location-and-automation-ux.md   Location UX spec
│   └── 05-service-catalog-ux.md           Service catalog UX spec
├── CONVENTIONS.md              Code style, tech stack, rules (READ FIRST)
├── ARCHITECTURE.md             How the system fits together
├── DECISIONS.md                Why we chose what (decision log)
├── MOBILE-STRATEGY.md          PWA-first mobile plan
├── STARTER-DATA.md             Cold start + Jobber import strategy
├── docker-compose.yml          Local Supabase + LM Studio
└── README.md                   This file
```

## Getting started

### Prerequisites

- Node 22+ (`.nvmrc` pins the exact version — use `nvm use` or `fnm use`)
- pnpm 10+ (`npm install -g pnpm` or via Corepack)
- Docker (for local Supabase, optional)
- Supabase CLI (for running migrations — `brew install supabase/tap/supabase`)
- Anthropic API key (required)
- OpenAI API key (for embeddings)
- Deepgram API key (for transcription)

### First-time setup

```bash
# Clone and install
git clone https://github.com/yourname/premier-crm.git
cd premier-crm
pnpm install

# Environment variables
cp .env.example .env.local
# Fill in API keys — see .env.example for descriptions of each variable

# Set up Supabase (cloud free tier or local Docker)
# Cloud: create project at supabase.com, copy URL and keys to .env.local, then:
supabase db push   # Runs all migrations 0001-0011 against your cloud project
# Local Docker:
supabase start
supabase db reset  # Runs all migrations 0001-0011

# Generate TypeScript types from Supabase schema
pnpm db:types

# Start dev server
pnpm dev
```

Visit http://localhost:3000 and sign in with email + password.
If your account was created during the earlier magic-link phase, use "Forgot password" once to set your password.
If you're creating a new contractor/staff account, use `/sign-up`. Non-owner accounts may land on a pending-approval screen until an owner activates them.

### After signing in for the first time

If your account was provisioned through the existing Supabase auth trigger flow, you'll be associated with the Premier org (created by migration 0008). Then:

1. Run the Jobber import wizard at `/setup/import` (Phase 0.5 deliverable)
2. Verify your customers/properties/jobs imported correctly
3. Start using Premier for new work

## Environment variables

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI (required)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Transcription (required for capture pipeline)
DEEPGRAM_API_KEY=

# Communications (required for SMS/email)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
RESEND_API_KEY=

# Payments (required for invoicing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Maps (required for property geocoding + traffic)
GOOGLE_MAPS_API_KEY=

# Pricing intelligence (Phase 3)
BIGBOX_API_KEY=
EIA_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development workflow

This project is built primarily with Claude Code as the implementation assistant. Recommended pattern:

1. Pick a deliverable from `docs/03-build-sequence.md`
2. In Claude Code, point it at the relevant doc(s) for context
3. Let Claude draft the implementation
4. Test against real Premier business scenarios immediately
5. Commit when working
6. Update `DECISIONS.md` if you made a non-trivial choice

The docs are intentionally Claude-Code-readable so context is grep-able.

## Local AI setup (optional)

For prompt iteration without API costs, run Qwen via LM Studio:

1. Install [LM Studio](https://lmstudio.ai/)
2. Download Qwen 2.5 14B Instruct (or similar)
3. Start the local server in LM Studio
4. Set `LOCAL_LLM_URL=http://localhost:1234/v1` in `.env.local`
5. Use `AI_PROVIDER=local` env to switch features to local model

Production always uses Anthropic. Local is for dev only.

## License

Pre-release: All Rights Reserved.

Post-release: AGPL-3.0. See `DECISIONS.md` for reasoning.

## Contact

Kevin Sommer / Premier Property Maintenance LLC
