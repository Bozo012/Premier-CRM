# Decisions

A log of significant choices, their alternatives, and why we picked what we picked. When you're tempted to change one of these, read it first. If the reasoning still holds, don't change it. If it doesn't, document a new decision (don't silently flip).

Format: each decision is dated. Most recent at the top.

---

## 2026-04-24: User → org association via Supabase Auth trigger

**Context:** New users signing in via magic link need to be associated with the Premier org automatically. Two options: database trigger on `auth.users`, or a server-side setup flow that runs after sign-in.

**Decision:** Supabase Auth trigger (`handle_new_user()`) in migration `0009_user_org_association.sql`. First active user to sign up becomes org owner (status `active`); subsequent users join as pending employees (status `pending`) until an owner approves them. Also adds `status` column to `org_members` and updates `user_is_in_org()` to respect it.

**Alternatives considered:**
- Server-side setup flow at `/setup` after sign-in (more application code, more failure modes — window where user exists without org association)

**Reasoning:** Database trigger is foolproof — it fires before any application code, so there is no race condition or forgettable setup step. Matches the pattern already used in migration `0006` (`handle_new_org()`).

---

## 2026-04-24: Manual multi-day job flag over auto-detection

**Context:** Multi-day jobs waive the trip fee (replaced by a mileage line item). Need to distinguish intentional multi-day projects from single-day jobs that ran long.

**Decision:** Manual boolean flag on the job record (`is_multi_day`). Kevin sets this when creating or editing a job.

**Alternatives considered:**
- Auto-detect by calendar spread (if job spans >1 calendar day in the schedule)
- Auto-detect by number of site visits (>1 geofence entry)

**Reasoning:** Auto-detection is too error-prone. A one-day job that spills into a second day due to weather or scope change should not retroactively waive the trip fee and recalculate mileage. The manual flag is explicit, auditable, and easy to set at job creation.

**Trade-off accepted:** Requires Kevin to set the flag intentionally. Forgetting it means the trip fee stays on — correctable at invoice review, low-stakes.

---

## 2026-04-24: Consolidate automation engine into top-level packages/automation/

**Context:** `packages/ai/automation/engine.ts` existed but both `ARCHITECTURE.md` and `README.md` specified a separate top-level `packages/automation/` package. The engine was in the wrong place.

**Decision:** Move `packages/ai/automation/engine.ts` → `packages/automation/engine.ts`. Top-level `packages/automation/` is the single home for all automation engine code.

**Alternatives considered:**
- Keep in `packages/ai/` (simpler monorepo, but blurs the boundary between AI tool dispatch and rule evaluation)

**Reasoning:** The automation engine evaluates conditions and executes actions based on database rules — it does not call Claude directly. Keeping it separate from `packages/ai/` gives it clean test boundaries and lets it be developed and published independently of the AI dependency.

---

## 2026-04-24: Use @ducanh2912/next-pwa for PWA service worker

**Context:** PWA service worker is required for offline mode, background sync, and push notifications per `MOBILE-STRATEGY.md`. The canonical `next-pwa` package is unmaintained and incompatible with Next.js 13+ App Router.

**Decision:** Use `@ducanh2912/next-pwa` — the actively maintained fork with full Next.js 15 App Router support.

**Alternatives considered:**
- Original `next-pwa` (unmaintained, breaks on App Router)
- Custom Workbox implementation (more control, significantly more boilerplate)
- `next-offline` (unmaintained)

**Reasoning:** `@ducanh2912/next-pwa` is the de facto successor to `next-pwa`, well-documented, and gets precaching + background sync with minimal config. If it becomes unmaintained we can migrate to custom Workbox — the API surface is compatible.

---

## 2026-04-24: Re-sequence build to bring AI capture forward

**Context:** Original build sequence had AI assistant arriving in Phase 3 (week 12). Kevin needs the AI capturing notes and learning from his work as soon as possible — that's the whole point of the system over a generic CRM.

**Decision:** Move basic capture pipeline (recording → transcription → vault) into Phase 1 alongside core CRM. AI assistant chat moves to Phase 2. Polish features (briefings, anomaly detection, suggestions) stay in Phase 3.

**Alternatives considered:**
- Keep original sequence (well-architected, slower value)
- Bring entire AI stack forward (too much complexity at once)

**Trade-off accepted:** Some refactoring later as the AI features mature. Worth it to start training the system on real data immediately.

---

## 2026-04-24: PWA-first, native deferred

**Context:** Kevin uses iPhone and iPad but has no Apple Developer account. Wants to start using the system immediately on those devices.

**Decision:** Build the entire system as a Next.js PWA. Defer native React Native (Expo) build until at least Phase 4, only if background location tracking proves to be a critical missing feature.

**Alternatives considered:**
- Native iOS app from day 1 ($99 dev account + complexity, slower start)
- React Native from day 1 (parallel codebase to maintain, slower iteration)
- Web-only, no PWA (worse field UX)

**Trade-off accepted:** No background location tracking on iOS until/unless we build native. Foreground-only location works for most automations.

See `MOBILE-STRATEGY.md` for full plan.

---

## 2026-04-24: Default automations OFF for arrival/on-the-way notifications

**Context:** Originally seeded these as on-by-default. Kevin's preference is to be customer-specific about notifications.

**Decision:** All customer-facing notification automations default to OFF. User opts in per-customer or sets a personal default. Internal automations (time entry start, close-out prompt) default to ON.

**Reasoning:** Sending unsolicited "on the way" texts to a customer who didn't expect them creates negative experiences. Better to opt in deliberately. Internal automations can default on because they only affect Kevin's experience.

---

## 2026-04-23: Postgres + pg_net + pg_cron for background jobs (no Redis/BullMQ)

**Context:** Need background processing for transcription, embedding, automation events, scheduled tasks.

**Decision:** Use Supabase's pg_net (HTTP-from-database) and pg_cron (scheduled SQL) for all background work. No additional queue infrastructure.

**Alternatives considered:**
- Redis + BullMQ (operational complexity)
- Inngest (great DX but adds a service dependency and cost)
- Cloudflare Queues (locks us deeper into Cloudflare)

**Reasoning:** At Premier's scale (one user, dozens to hundreds of jobs/month, low thousands of vault items/year), Postgres handles this trivially. Adding a queue is YAGNI. If we hit a wall, switching is straightforward.

---

## 2026-04-23: Single service catalog table (`service_items`), not separate `service_catalog`

**Context:** Migration 0007 originally created a parallel `service_catalog` table. This duplicated the existing `service_items` from migration 0002.

**Decision:** Extend `service_items` with the catalog fields (range pricing, confidence, scope, permits) rather than maintaining two tables.

**Reasoning:** One source of truth. Avoids constant join/sync questions. The original `service_items` had the right primary key relationships (linked from service_categories, materials, etc.) that we'd otherwise have to recreate.

---

## 2026-04-23: Hierarchical preferences with database-resolved cascade

**Context:** Need preferences (notification timing, geofence size, billing rules) at multiple levels: org, user, customer, job.

**Decision:** Separate tables per level, resolved via Postgres function `get_effective_location_prefs(user_id, customer_id, job_id)` returning JSONB.

**Alternatives considered:**
- Single denormalized prefs table per entity (lots of NULL columns, hard to add new prefs)
- Application-level resolution (slower, more bugs)

**Reasoning:** DB function is fast (single query), centralized (logic in one place), and naturally reflects the inheritance model in code.

---

## 2026-04-23: Materials at cost (no markup) for residential, +10% commercial

**Context:** Kevin's pricing philosophy.

**Decision:** First-class system setting in `org_pricing_policy`. Quote builder honors this automatically. Customer-facing quotes display "Materials: $X (billed at actual cost, no markup)" for residential — a trust signal.

**Reasoning:** This is core to Premier's brand differentiation. Building it as a setting (not a per-quote choice) means it can't be accidentally violated.

---

## 2026-04-23: Trip fee as line item, not embedded in service price

**Context:** Trip fee ($100 res / $150 comm) applies to every job. Could roll into per-service pricing or stand alone.

**Decision:** Always a separate line item. Auto-added when quote is created. Can be waived (toggled off) for multi-day jobs where mileage line replaces it.

**Reasoning:** Transparency for the customer. Easy to audit. Easy to waive when policy says so. Reflects how Kevin actually thinks about pricing.

---

## 2026-04-23: GPS/geofences as first-class system signal, not bolt-on tracking

**Context:** Could implement location as a separate "tracking" feature.

**Decision:** Location is an input signal across the entire system: capture pipeline, automation engine, vault item enrichment, customer portal. Every relevant table has location-aware fields.

**Reasoning:** This is the difference between "feature nobody uses" and "thing that makes the system feel alive." Validated by user (Kevin).

See `docs/04-location-and-automation-ux.md`.

---

## 2026-04-22: Confidence-tracked pricing (range → confirmed → high)

**Context:** Kevin doesn't have settled rates for most services because he hasn't run as Premier-the-business much yet. Could either force him to set rates upfront or let the system learn.

**Decision:** Services start with researched ranges and `confidence='unconfirmed'`. First time used, AI asks Kevin to confirm. After 3+ uses with consistent rates, auto-promotes confidence to medium. After 10+, high.

**Reasoning:** Honest about uncertainty. Doesn't pretend to know. Gets better with use.

---

## 2026-04-22: Property as first-class entity, separate from customer

**Context:** Most CRMs conflate customer and address. Reality: properties outlive customers (sales, transfers, owner changes).

**Decision:** `properties` table is independent. `customer_properties` is many-to-many with relationship type and date ranges. Job is attached to property primarily; customer is the current owner/manager at job time.

**Reasoning:** Property history (work done, photos, notes) follows the property forever. When the property changes hands, the new owner inherits this context (with appropriate access controls).

---

## 2026-04-22: Vault items can have AI-suggested entity links with confidence

**Context:** When AI auto-tags a recording with "this is about Emily's gable vent job," it might be wrong.

**Decision:** Every vault_item entity link has a confidence score. Low-confidence links surface in a "review" UI. High-confidence links (e.g., from geofence enrichment) auto-apply silently.

**Reasoning:** Trust is earned. Don't auto-apply ambiguous AI inferences to billable data without review.

---

## 2026-04-22: Anthropic Claude as primary, OpenAI for embeddings only

**Context:** Could use OpenAI/Anthropic/Google for various tasks.

**Decision:** Claude for all reasoning (Haiku/Sonnet/Opus), OpenAI text-embedding-3-large for embeddings. Local LLM (Qwen via LM Studio) as future fallback for sensitive content.

**Reasoning:** Claude's tool use is best-in-class. Embeddings benefit from OpenAI's dimensions. Avoiding multi-vendor reasoning prevents capability drift in production. (Plus, Kevin is using Claude products extensively, so the system feels coherent.)

---

## 2026-04-22: Supabase over self-hosted Postgres

**Context:** Could self-host Postgres for full control.

**Decision:** Supabase. Get auth, storage, realtime, edge functions, RLS tooling all in one. Free tier covers Premier's volume forever.

**Trade-off accepted:** Some Supabase-specific code (RLS, realtime). Acceptable lock-in given the productivity gain. Self-host migration path remains via standard Postgres dump if needed.

---

## 2026-04-22: AGPL-3.0 open source license, eventually

**Context:** Kevin wants to open source eventually but uses Premier internally first.

**Decision:** Closed source for first 6+ months. Then AGPL-3.0 to require derivative works to also be open. Federated pricing pool as optional opt-in for participating businesses.

**Reasoning:** AGPL prevents big SaaS players from taking the work and selling it back as proprietary. Federated data is a real value-add but must be opt-in for trust.

---

## How to add a decision

When you make a non-trivial choice (architecture, library, naming pattern, business rule), add an entry here:

```
## YYYY-MM-DD: One-line summary

**Context:** What problem prompted this?

**Decision:** What we chose.

**Alternatives considered:** What we didn't choose and why.

**Reasoning:** Why this was the right call.

**Trade-off accepted:** What we're giving up (if anything).
```
