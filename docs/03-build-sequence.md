# Build Sequence (revised)

A realistic week-by-week plan optimized for Kevin's situation:
- Building solo with Claude Code as primary implementer
- Year-long timeline acceptable
- AI capture and learning prioritized over polish
- Goal: replace Jobber as soon as possible at near-zero cost

**Key change from v1:** AI capture pipeline moved into Phase 1 alongside core CRM. Assistant chat moved to Phase 2. This means recording and learning starts week 7, not week 12.

---

## Phase 0 — Foundation (Week 1)

**Goal:** Repo deployed, you can sign in.

- [ ] Read CONVENTIONS.md, ARCHITECTURE.md, DECISIONS.md, MOBILE-STRATEGY.md
- [ ] Create GitHub repo (private)
- [ ] Set up monorepo with pnpm workspaces (apps/web, packages/shared, packages/db, packages/ai, packages/automation)
- [ ] Scaffold Next.js 15 app (App Router, TypeScript strict, Tailwind, shadcn/ui)
- [ ] Set up Supabase project (cloud, free tier)
- [ ] Run migrations 0001–0008 (verify Premier org exists after)
- [ ] Generate types: `pnpm db:types`
- [ ] Wire Supabase auth to Next.js (magic link)
- [ ] First sign-in: associate user with Premier org (one-time setup flow)
- [ ] Configure PWA manifest + service worker (per MOBILE-STRATEGY.md)
- [ ] Deploy to Vercel
- [ ] Add to home screen on iPhone + iPad — confirm PWA install works

**Exit criteria:** You sign in at premier.your-domain.com on your iPhone, see "Hi Kevin" on the today screen, and the app is installed to your home screen.

---

## Phase 0.5 — Jobber import (Week 2)

**Goal:** Real data populated. Premier has your customers, properties, past jobs from day one.

- [ ] Add migration 0009 with `jobber_id` columns on imported tables
- [ ] Build import wizard at `/setup/import` (see STARTER-DATA.md)
- [ ] Jobber CSV parser
- [ ] Field mapping UI
- [ ] Deduplication preview
- [ ] Batch import executor with progress
- [ ] Post-import enrichment jobs (geocode properties, embed quote line items)
- [ ] Kevin exports Jobber data, runs import

**Exit criteria:** All your Jobber customers, properties, jobs, quotes, invoices imported. Geofences auto-created for every property. You can browse your real history in Premier.

---

## Phase 1 — Core CRM + Capture pipeline (Weeks 3–8)

**Goal:** You're using Premier to quote/invoice your next jobs AND every recording you make is going into the vault.

### Week 3 — Customer + Property UI

- [ ] Customer list page with search + filters + archetype badges
- [ ] Customer detail page with property list, jobs list, quotes list
- [ ] Property detail page with job history, vault items, geofence info
- [ ] Edit customer/property forms (Zod-validated)
- [ ] Customer 360 view (uses `get_customer_360` RPC)

### Week 4 — Jobs + Service Catalog UI

- [ ] Jobs list with status filtering
- [ ] Create job form (customer + property + service category)
- [ ] Job detail with phases, time entries, materials, vault items
- [ ] Service catalog page (browse + search seeded services)
- [ ] Quick-add service inline form (Path 1 from `05-service-catalog-ux.md`)
- [ ] AI-assisted service add ("research a rate for X")

### Week 5 — Quoting

- [ ] Quote builder (line item editor, drag to reorder, options)
- [ ] Trip fee auto-added based on customer archetype
- [ ] Materials section with no-markup display for residential
- [ ] PDF generation (@react-pdf/renderer)
- [ ] Send quote via email (Resend)
- [ ] Magic-link customer-facing quote view (mobile-optimized)
- [ ] Quote approval flow (e-signature → status → trigger job creation)
- [ ] Quote_line_items writes properly tracked (foundation for pricing intelligence)

### Week 6 — Invoicing & Payments

- [ ] Invoice creation from quote or from job actuals
- [ ] Tax calculation per `org_pricing_policy` settings
- [ ] PDF generation for invoice
- [ ] Stripe integration (payment links, webhook for status updates)
- [ ] Customer-facing invoice + pay page (magic link)
- [ ] Receipt email after payment
- [ ] Materials overage flagging (compare invoice materials vs quote)

### Week 7 — Capture pipeline (audio + photos)

- [ ] Supabase Storage buckets configured (recordings, photos, documents, receipts)
- [ ] Quick-capture button on every screen (mic + camera)
- [ ] MediaRecorder API for audio recording (PWA-compatible)
- [ ] Capture upload Edge Function (signed URLs, multipart support)
- [ ] Vault items appear in vault list as "pending"
- [ ] Geofence enrichment trigger active (auto-link to property/job)
- [ ] Photo EXIF preservation + property auto-match

### Week 8 — Transcription & classification

- [ ] Deepgram integration (transcription + diarization)
- [ ] process-capture Edge Function (transcribe → classify → embed → summarize)
- [ ] Claude Haiku classification (vault item type, sentiment, entities)
- [ ] Claude Sonnet summarization with type-specific templates
- [ ] OpenAI embedding via text-embedding-3-large
- [ ] Vault item appears as "processed" with summary, transcript, links
- [ ] Vault search UI (semantic + filters)

**Exit criteria:** You're quoting and invoicing real jobs in Premier. Every recording you make is transcribed, summarized, and searchable. You haven't logged into Jobber in a week.

---

## Phase 2 — AI Assistant + Communications (Weeks 9–14)

**Goal:** The AI assistant works. You can chat with it about your data.

### Week 9 — Inbound communications

- [ ] Twilio business number + SMS webhook endpoint
- [ ] Two-way SMS UI on customer/job detail
- [ ] Resend inbound email parsing
- [ ] Communications threading (unified per customer/job)
- [ ] Email/SMS captured into vault automatically

### Week 10 — Assistant chat infrastructure

- [ ] Chat UI (web + iPad-optimized layout)
- [ ] Conversation persistence (assistant_messages table)
- [ ] Tool dispatch in `/api/assistant/tools`
- [ ] Handler implementations for read tools first (lookup_customer, list_jobs, search_vault, etc.)
- [ ] Streaming responses
- [ ] Context loading (current page → assistant context)

### Week 11 — Assistant write tools

- [ ] Create/update tools wired up (create_customer, send_message, schedule_followup, etc.)
- [ ] Confirmation flow before destructive actions
- [ ] Tool execution audit log
- [ ] "Undo" capability where reasonable

### Week 12 — Location + automation engine

- [ ] Geofence CRUD UI (visual map editor)
- [ ] Hierarchical preferences UI (org/user/customer/job)
- [ ] Foreground location tracking in PWA
- [ ] Automation engine deployed
- [ ] Default automations active (12 from migration 0006)
- [ ] User prompt inbox UI
- [ ] Today screen shows live tracking status

### Week 13 — Customer portal polish

- [ ] Magic link tokens table + scoped access
- [ ] Customer portal landing (project status, quote, invoice, photos)
- [ ] Customer messaging from portal (creates SMS/email back to Kevin)
- [ ] Push notifications to customer (per their prefs)

### Week 14 — Daily briefing

- [ ] Briefing generator (cron via pg_cron, runs 5:30am)
- [ ] Briefing delivery (push notification + email + in-app)
- [ ] Anomaly detection function calls
- [ ] Opportunity surfacing (warranty expirations, nearby past customers)
- [ ] End-of-day summary automation

**Exit criteria:** Morning briefing arrives on your phone. You can ask the AI "what did Emily say about the gable vents?" and get a real answer with the source recording linked. Every customer interaction (text, email, recording) is in the system without you typing it in.

---

## Phase 3 — Pricing intelligence + Mobile polish (Weeks 15–20)

**Goal:** The system is learning your pricing patterns. Mobile experience is great.

### Weeks 15–16 — Pricing engine

- [ ] Material price tracking (BigBox API for Home Depot, Lowe's, Menards SKUs)
- [ ] Weekly cron to refresh top SKUs in Florence ZIP codes
- [ ] EIA fuel price feed (weekly auto-update)
- [ ] Quote pricing intelligence (suggest based on history + market)
- [ ] Win-rate analysis per service (auto-promote confidence levels)
- [ ] Pricing review dashboard (services flagged for review)

### Weeks 17–18 — Mobile (PWA) polish

- [ ] Voice-to-quote flow (record walkthrough → transcribe → AI extracts line items → confirm)
- [ ] Receipt OCR + auto-attachment to job
- [ ] Mobile-optimized today screen with live tracking
- [ ] Offline mode reliability
- [ ] Push notification refinements (timing, grouping, sounds)
- [ ] Photo gallery per property with timeline view

### Weeks 19–20 — Differentiators

- [ ] Permit guardrail integration in quote flow (deck checker, electrical/plumbing scope check)
- [ ] Multi-day job recognition + auto mileage line item
- [ ] One-off / favor job custom workflow with research assist
- [ ] Property memory page (full history, photos, work done, costs)
- [ ] Similar jobs lookup ("you've done 3 jobs like this, average $X")

**Exit criteria:** AI suggests prices based on your real history. Mobile is fully usable in the field. Permit checks prevent scope mistakes.

---

## Phase 4 — Hardening + Open source prep (Weeks 21–28)

**Goal:** System is reliable, documented, ready to share.

### Weeks 21–23 — Quality

- [ ] Test coverage for critical paths (quote → invoice → payment)
- [ ] Error monitoring (Sentry or self-hosted)
- [ ] Performance audit (Lighthouse, bundle size)
- [ ] Backup/recovery procedure documented + tested
- [ ] RLS audit (penetration test against your own data)
- [ ] Mobile device testing across iOS versions

### Weeks 24–25 — Polish

- [ ] Empty states everywhere
- [ ] Loading states everywhere
- [ ] Error states everywhere
- [ ] Onboarding tour for first-time users
- [ ] Settings page comprehensiveness
- [ ] Accessibility audit (WCAG 2.1 AA baseline)

### Weeks 26–28 — Open source release

- [ ] Self-hosting guide (Docker Compose, env vars, migrations)
- [ ] Anonymize Premier-specific seed (turn 0008 into a template generator)
- [ ] Demo deployment with synthetic data
- [ ] AGPL-3.0 license + contributor guidelines
- [ ] Public GitHub repo
- [ ] Launch post (HackerNews, contractor forums)

---

## Cutting room floor (if behind)

If you're behind schedule, cut these in this order:

1. **Subcontractor portal** — Phase 5+, not in original plan
2. **Native mobile app** — only if PWA limitations become genuinely painful
3. **AI receptionist phone agent** — Phase 5+, big project on its own
4. **Federated pricing pool** — post-open-source feature
5. **Satellite measurement** — Phase 4 differentiator that's nice-to-have
6. **Permit lookup service** — Phase 4 differentiator
7. **QuickBooks integration** — Phase 5+ if needed at all (manual export OK initially)
8. **Custom mobile app for crew members** — only if you hire crew

## Cadence recommendation

- **Weekday mornings (1 hr):** Triage AI suggestions, review last day's captures
- **Weekday evenings (1-2 hrs):** Building (Claude Code-driven)
- **Weekend (3-5 hrs):** Bigger features that need uninterrupted time
- **Sunday night:** Plan the week's deliverables

## What "done" looks like

If you ship Phases 0-3 in 5-6 months, you have:
- Replaced Jobber entirely at $0/month operating cost
- A system that captures and remembers everything about your business
- An AI assistant that knows your customers, jobs, and pricing
- Location-aware automations that handle the busywork
- Real pricing intelligence based on your actual history
- A mobile-first PWA that works on iPhone and iPad

If you ship Phase 4, you have a product that other contractors would pay for.

That's the win.
