# Premier CRM — Product Requirements Document

**Status:** Draft v1.0
**Owner:** Kevin Sommer
**Last updated:** April 2026

---

## 1. Vision

A contractor CRM that combines four things no existing platform does together:

1. **A complete field service management system** that handles quoting, scheduling, invoicing, payments, and customer communication for a small contracting business.
2. **A semantic vault** that captures and indexes everything — recordings, photos, notes, emails, texts, quotes — into a queryable knowledge base tied to customers, properties, and jobs.
3. **A learning AI assistant** that operates over the vault and the structured CRM data, reactively answering questions and proactively surfacing what matters.
4. **A location-aware automation layer** that uses GPS and geofences as a first-class signal across every surface — auto-tracking time and mileage, auto-tagging captured content, and driving an automation engine that can be customized per customer and per job.

Built first for Premier Property Maintenance LLC. Open-sourced once stable.

## 2. Why this exists

Every contractor CRM on the market today (Jobber, Housecall Pro, ServiceTitan, QuoteIQ, FieldPulse, etc.) treats AI as a bolt-on feature and the customer as a database row. They optimize for the contractor's office workflow, not the contractor's *cognitive* workflow — the in-truck, on-site, talking-to-clients reality of the job.

The biggest customer pain point in home services, repeatedly confirmed by industry research, is communication — not price, not quality. The biggest contractor pain point is data entry friction and losing track of what was said, agreed to, or noticed during a job. Both problems share a root cause: information is scattered across phones, papers, emails, memory, and brittle CRM forms that nobody fills in.

Premier solves both ends by making capture frictionless and retrieval intelligent.

## 3. Users

**Primary user (v1):** Solo or 2-3 person contracting business. Owner-operator handling quotes, scheduling, field work, and client communication. Uses smartphone all day, occasional laptop work.

**Secondary user (eventual):** Customers/homeowners receiving service. Mobile-first, no-account-required interactions.

**Future user:** Crew members (employees, subs) needing field access to job info.

## 4. Non-goals (explicit)

- Not building for businesses over 25 employees (ServiceTitan owns that)
- Not building a marketing platform (no ad management, no SEO tools)
- Not building accounting (integrate with QuickBooks)
- Not building inventory management beyond per-job materials tracking (v1)
- Not building a marketplace or lead-gen network
- Not building hardware

## 5. System overview

```
┌──────────────────────────────────────────────────────────────────┐
│  CAPTURE LAYER                                                    │
│  Phone quick-capture · Plaud (optional) · Inbound SMS/email/calls │
│  Photo upload · Manual notes · GPS location stream                │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  INGESTION PIPELINE                                               │
│  Transcribe · Diarize · Classify · Extract entities · Auto-route  │
│  Geofence enrichment (location → entity links with high confidence)│
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  THE BRAIN (Postgres + pgvector + PostGIS)                        │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐   │
│  │ STRUCTURED LAYER    │  │ SEMANTIC LAYER (the vault)       │   │
│  │ Customers           │  │ Recordings · Transcripts         │   │
│  │ Properties          │  │ Notes · Photos (captioned)       │   │
│  │ Jobs                │  │ Email/SMS bodies                 │   │
│  │ Quotes / Line items │  │ Site arrivals/departures/drives  │   │
│  │ Invoices / Payments │  │ All embedded into vector store   │   │
│  │ Materials / Pricing │  │ Linked to entities above         │   │
│  │ Time entries        │  │                                  │   │
│  └─────────────────────┘  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ LOCATION LAYER                                           │    │
│  │ Geofences · Location events · Trips · Hierarchical prefs │    │
│  │ (org > user > customer > job)                            │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  AI ORCHESTRATOR + AUTOMATION ENGINE                              │
│  Tool registry · Model routing · Context loading · Memory · Audit │
│  Rule evaluator (trigger → conditions → actions)                  │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  SURFACES                                                         │
│  Web app · Mobile app · Customer portal · Daily briefing · Email  │
│  In-app prompts · Push notifications                              │
└──────────────────────────────────────────────────────────────────┘
```

## 6. Functional requirements

### 6.1 Core CRM (Phase 1)

**Customers and properties**
- Create/edit/archive customers (name, phones, emails, preferred contact method, tags)
- A customer has 1+ properties; properties have addresses, gate codes, dog warnings, photos, notes
- Properties survive customer changes (next owner)
- Full-text and semantic search across all customer data

**Jobs**
- Create job linked to customer + property
- Job has: title, description, status (lead/quoted/scheduled/in-progress/complete/cancelled), service category, estimated/actual duration
- Jobs can have multiple **phases** for project work
- Jobs have many-to-one relationships with quotes, invoices, communications, time entries, materials, photos

**Quotes**
- Build quote from line items selected from service catalog
- Support 4 quote types: standard, options (good/better/best), package, quick
- Each line item: service, quantity, unit price, labor minutes, materials list
- Auto-generate PDF
- Send via SMS or email with magic-link to interactive view
- Track status: draft, sent, viewed, accepted, declined, expired
- E-signature on acceptance
- Convert accepted quote → job + initial invoice (if deposit required)

**Invoicing & payments**
- Generate from job actuals (labor logged, materials used) or from quote
- Support deposit, progress, and final invoices
- Stripe integration: card + ACH
- Payment links sent via SMS/email
- Auto-receipt on payment
- QuickBooks Online sync (Phase 1.5)

**Service catalog**
- Library of services Premier offers (storm window repair, drywall patch, etc.)
- Each service: name, category, default unit, default labor minutes, default markup
- Linked to default materials

**Materials catalog**
- Per-org materials with SKUs for Home Depot, Lowe's, Ferguson
- Time-series price history per supplier per zip
- Updated weekly via scraper API (BigBox or SerpApi)

### 6.2 Customer-facing portal (Phase 3)

**No-account-required access** — every interaction via signed magic link

**Quote view**
- Mobile-optimized interactive view
- Line items with plain-language explanations
- Inline photos of similar past work (semantic match)
- Approve / request changes / call us — three buttons
- E-signature on approve
- Auto-PDF copy emailed for records

**Job timeline**
- What happened, what's next, what could change it
- On-the-way notification with tech name, photo, vehicle, ETA
- Live photo feed during job
- AI-generated daily summary at end of day

**Communications**
- Unified thread (SMS + email + portal messages) per job
- Customer can reply via any channel; appears in same thread

**Payments**
- Pay invoice via card or ACH, no account needed
- Payment plans / financing (Phase 4)
- Auto-receipt + downloadable docs zip

**Post-job**
- Review request (one-tap to Google/Facebook)
- Warranty card auto-generated
- Maintenance reminders
- Annual property report

### 6.3 Capture pipeline (Phase 1)

**Quick-capture button** (mobile app)
- Tap-and-hold to record
- Release to upload
- Optional context tag: "site walk", "client call", "debrief", etc.
- Defaults to current geo-location and current job (if you're on-site)

**Plaud integration** (Phase 4)
- Import recordings from Plaud cloud via API or webhook
- Same processing pipeline as native captures

**Other inputs**
- Inbound SMS auto-attached to job thread (Phase 2 — requires Twilio provisioning)
- Inbound email parsed and threaded (Phase 2)
- Inbound calls transcribed (when AI receptionist enabled, Phase 5)
- Photos uploaded with EXIF data preserved (geotag, timestamp)

**Processing pipeline (per upload)**
1. Audio → Whisper or Deepgram transcription
2. Speaker diarization
3. Claude classification: type, entities mentioned, action items, sentiment
4. Auto-link to customer/property/job (via embedding match + confirmation)
5. Generate structured summary using contractor-specific templates
6. Index into vault with embeddings
7. Notify user with summary + suggested actions

### 6.4 Vault (Phase 1)

**What goes in:**
- Every transcribed recording
- Every photo with AI-generated caption
- Every email and SMS body
- Every job note typed manually
- Every quote and invoice (as text)
- Every internal task or todo

**Storage model:**
- Each item: type, content, source, timestamp, geo (if available)
- Embeddings (text-embedding-3-large or equivalent) stored in pgvector
- Metadata links: customer_id, property_id, job_id (nullable, can be many)
- Tags (auto + manual)

**Retrieval:**
- Semantic search via vector similarity
- Hybrid search (semantic + structured filter)
- Time-bounded queries
- Entity-bounded queries ("everything about Emily")

### 6.4.5 Location & Automation System (Phase 2/3 foundation, Phase 4 full)

Location is treated as a first-class input signal across the whole system — not as an isolated "time tracking" feature. See `docs/04-location-and-automation-ux.md` for the full UX spec.

**Location event stream**
- Mobile app captures adaptive GPS events (battery-aware: OS geofence triggers + motion-triggered fine tracking only when needed)
- Raw location events stored with ~30-day retention, then purged
- Trips and geofence events stored permanently

**Geofences**
- Auto-generated for every property with a location (default 75m residential, 150m commercial)
- Auto-generated for org home / shop addresses
- Suggested for nearby suppliers (Home Depot, Lowe's, Ferguson, Menards, etc.)
- User-creatable for custom locations
- Job-specific temporary geofences for unusual work sites
- Visual in-app editor for radius and center adjustment
- Per-property toggle to hide from auto-tracking (personal addresses in the system)

**Trips**
- Derived from location events between significant stops
- Road-snapped via Google Directions API for accurate distance
- Auto-classified: to_job / from_job / between_jobs / supply_run / commute / personal / unknown
- Snapshotted mileage rate at time of trip (IRS default or custom)
- Quality flags for implausible speed, GPS gaps
- User can correct classification; classifier learns

**Hierarchical preferences**
The cascade of who-controls-what:
- Org defaults (business hours, default geofence radius, mileage rate)
- User overrides (personal tracking preferences, gps mode)
- Customer overrides (geofence size, arrival notifications, quiet hours, bill-drive-time flag)
- Job overrides (per-job anything — warranty, emergency, etc.)

Each level inherits from the one above. Database function `get_effective_location_prefs` resolves the cascade in one query.

**Automation engine**
- Trigger-condition-action rule system with 14+ trigger types
- Plain-English rule editor; JSON under the hood
- Default rules seeded for every new org (12 rules covering arrival, departure, dwell, supply runs, prompts, etc.)
- Cooldown + rate limits to prevent notification spam
- Full audit log of every rule firing
- User-facing prompt system for actions requiring approval

**Default automations shipped**
- Start time entry on arrival (with dwell filter)
- Notify customer on arrival (respects quiet hours + prefs)
- Pre-arrival briefing 5 min out
- On-the-way text to customer
- Close-out prompt on departure with draft invoice
- Remind to invoice 30 min after leaving completed job
- Classify supplier visits as supply runs
- Alert when dwell exceeds quote estimate
- End-of-day summary
- Follow-up on stale quotes
- Suppress after-hours tracking
- Auto-tag captured media by geofence

**Capture pipeline integration**
Every vault item upload includes the user's current location. If inside a geofence, the item is auto-linked to that property/job/customer at capture time with high confidence — no AI guessing needed.

**Privacy**
- Tracking only active during configured business hours by default
- Vacation mode toggle
- Per-period disable ("no tracking this weekend")
- All raw GPS purges on user-configurable schedule
- User can delete any segment, any day, or all history
- Zero visibility to customers ever

### 6.5 AI Assistant — Premier Brain (Phase 2)

**Chat interface** (web + mobile)
- Single conversation thread
- Streaming responses
- Tool use visible inline
- Approve/edit destructive actions before execution

**Available tools** (see `packages/ai/tools/`)
- Vault: query_vault, search_recordings, find_similar_jobs
- CRM read: lookup_customer, lookup_property, lookup_job, list_quotes, list_invoices
- CRM write: create_quote, send_message, schedule_followup, create_task, update_job_status
- Pricing: get_pricing_suggestion, analyze_win_rate, forecast_revenue
- Drafting: draft_email, draft_sms, draft_quote_text
- Analytics: find_anomalies, summarize_period, calculate_metrics
- External: web_search, get_weather, get_traffic
- Location: get_current_location_context, get_time_on_job, get_trip_history, get_mileage_report
- Location prefs: update_user_location_prefs, update_customer_location_prefs, update_job_location_prefs
- Geofences: create_geofence, update_property_geofence, list_geofences
- Automation: list_automation_rules, create_automation_rule, toggle_automation_rule, get_automation_history
- Field ops: confirm_time_entry, reclassify_trip, respond_to_prompt

**Modes:**
- **Reactive** — user asks, brain answers/acts
- **Proactive** — daily briefing, alerts, opportunity surfacing

**Daily briefing** (delivered 6am via push + email)
- Today's jobs with status
- Pending quote follow-ups with suggestions
- Action items from previous day
- Anomalies (over-budget jobs, stale leads, slow-paying customers)
- Opportunities (nearby past customers, expiring warranties)

### 6.6 Pricing intelligence (Phase 1 foundation, Phase 4 full features)

Full pricing engine spec deferred to Phase 3 documentation.

**Phase 1:** every quote line writes to `quote_line_items` table with full metadata (service, zip, quantity, price, outcome, ai_confidence)

**Phase 4:** real-time pricing suggestions based on:
- Layer 1: your historical win-rate-calibrated data
- Layer 2: live material prices via BigBox/SerpApi
- Layer 3: industry fallbacks (BLS labor data)

## 7. Non-functional requirements

**Performance**
- Page load < 1s on 4G mobile
- Search results < 500ms
- AI response start streaming < 2s

**Reliability**
- 99.5% uptime target (Vercel + Supabase will hit this)
- Offline mode for mobile field app: read-only access to today's jobs, queued writes sync when online

**Security**
- Row-level security on every table (multi-tenant ready from day one)
- Encrypted at rest (Supabase default) and in transit
- Magic links expire in 30 days, single-use option for sensitive actions
- Audit log of every AI write action
- Customer PII handling: clear data retention policy, deletion on request

**Privacy**
- All recordings stored in your Supabase instance, not third-party AI provider
- Anthropic API: zero-retention enabled where possible
- Customer must consent to recording (state-by-state law varies)
- Open-source release: no telemetry by default

**Cost ceiling for solo user**
- Target $100/mo total infra cost at low volume
- Realistic breakdown: Supabase $25, Vercel $0, Anthropic API ~$30-60, Twilio ~$10, scraper API $15

## 8. Tech stack

**Frontend**
- Next.js 15 (App Router) — web app + customer portal as PWA
- PWA primary; native deferred indefinitely (see `MOBILE-STRATEGY.md`)
- Tailwind + shadcn/ui

**Backend**
- Supabase (Postgres 15 + Auth + Storage + Realtime + Edge Functions)
- PostGIS extension for geographic queries
- pgvector extension for semantic search
- Deno-based Edge Functions for webhooks and async processing

**AI**
- Anthropic Claude Sonnet 4.6 (primary) and Haiku 4.5 (cheap classification)
- Anthropic Claude Opus 4.7 for complex synthesis (sparingly)
- OpenAI Whisper or Deepgram for transcription
- LM Studio + Qwen for local dev fallback (Kevin's existing setup)
- text-embedding-3-large for embeddings (OpenAI, cheap)

**Integrations**
- Twilio (SMS, voice, phone numbers)
- Stripe (payments)
- Resend (transactional email)
- QuickBooks Online API (accounting sync)
- Google Maps Platform (geocoding, satellite imagery, directions)
- BigBox API or SerpApi (Home Depot/Lowe's pricing)
- Vapi or Retell (AI receptionist, Phase 5)
- ElevenLabs (TTS, optional)

**Infra**
- Vercel (web hosting)
- Supabase Cloud (DB, storage, functions)
- GitHub (source control)
- Docker (local dev)

**Dev tooling**
- pnpm workspaces (monorepo)
- TypeScript strict mode
- Biome (lint + format)
- Vitest + Playwright (testing)
- Claude Code (primary development assistant)

## 9. Open source plan

Premier ships as a closed beta running Premier Property Maintenance LLC's operations for 6+ months. Once stable:

- AGPL-3.0 license (prevents pure SaaS rip-off, allows self-hosting)
- Repo public on GitHub
- Documented self-hosting via Docker Compose
- Optional federated pricing pool (anonymized line-item data shared across opt-in users)
- No telemetry, no upsell paths
- A separate hosted offering may follow if there's demand, but the open source version is fully featured

## 10. Success criteria

**For Kevin (the only user that matters in v1):**
- Spends less than 30 min/day on admin (down from 1-2 hrs)
- Closes quotes faster than current process (< 1 hr from job description to sent quote)
- Never loses track of an action item or follow-up
- Knows real margin on every job in real time
- Can answer "what did I do at this property in 2024" in under 10 seconds

**For the system:**
- 99% of recordings auto-route to the correct entity without manual intervention
- AI assistant answers structured queries with > 95% accuracy
- Pricing suggestions within 10% of actual win-rate-optimized price after 3 months of data
- Customer portal: > 60% of customers approve quotes via portal vs. phone callback
- Open-source release: 100+ stars on GitHub in first 3 months (loose target)

---

## Appendix: Glossary

- **Vault** — the semantic/vector layer of stored content (recordings, notes, photos, etc.)
- **Brain** — the AI orchestrator that reasons over both structured and vault data
- **Capture** — any input event (recording, photo, message) flowing into the system
- **Property memory** — the historical record of work done at a specific address
- **Quote line item** — a single billable line on a quote; the atomic unit of pricing intelligence
- **Magic link** — a signed URL that grants single-use or time-limited access without password
- **Phase** (job phase) — a discrete stage of a multi-stage project (vs. a single visit)
- **IQ Credits / Tokens** — internal unit of AI usage, tracked per feature for cost monitoring
