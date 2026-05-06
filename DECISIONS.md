# Decisions

A log of significant choices, their alternatives, and why we picked what we picked. When you're tempted to change one of these, read it first. If the reasoning still holds, don't change it. If it doesn't, document a new decision (don't silently flip).

Format: each decision is dated. Most recent at the top.

---

## 2026-05-03: Invite tokens expire 30 days, regenerable; self-signup is removed entirely

**Context:** The 2026-04-30 decision established owner-created invites as the new account-creation path, but kept self-signup-plus-approval as "a compatibility path for legacy self-signups." That compatibility path now needs to disappear: keeping a public signup endpoint open invites scraper accounts and there is no actual use case for it. With the invite flow about to ship in Phase 1.5, we need explicit rules for invite lifetime and acceptance.

**Decision:** Invite tokens expire 30 days after issue. Owner can regenerate an unaccepted invite to extend expiration; regeneration produces a new token and invalidates the old one. The `/sign-up` route, the `/pending-approval` waiting room, and the `handle_new_user()` self-association trigger are removed in a follow-up PR. Supabase Auth's "Allow new user signups" flag is also disabled at the dashboard level as belt-and-suspenders.

**Alternatives considered:**
- 7-day expiry (tighter security but more "expired, please re-request" friction)
- Open-ended expiry (simpler but tokens become long-lived secrets sitting in inboxes forever)
- Keep self-signup but lock it behind an org-level allowlist (more code than the use case warrants)

**Reasoning:** 30 days matches typical invite lifetimes at established SaaS tools and gives a busy contractor a realistic window to act after seeing the email, while keeping tokens short enough that a forgotten invite isn't a permanent attack surface. Regeneration handles edge cases cleanly. Removing self-signup tightens the trust model to "only people Kevin invited can have an account," which is the right model for a small contractor business.

**Trade-off accepted:** Owner has to be reachable to issue invites; no self-service onboarding. This is a feature, not a regression.

---

## 2026-05-03: Internal team roles are owner / contractor / employee

**Context:** With contractor email/password login + owner-created invites landing, the role list inside `org_members` needs to be explicit so invite UI, RLS policies, and permission checks can be coherent. The schema's `user_role` enum had been left open during early scaffolding.

**Decision:** Three internal roles. `owner` (full admin: invite/remove members, configure org settings, billing). `contractor` (Kevin or any subcontractor doing field work; read/write on customers/jobs/quotes). `employee` (technician or office staff; same as contractor today, with future room for finer permissions). Customer-facing access is NOT a role — see the separate `magic_link_tokens` decision below.

**Alternatives considered:**
- Two roles (`owner` and `staff`) — simpler but loses the contractor/employee distinction that becomes meaningful when subcontractors join
- Five roles, separating `subcontractor` from `office_admin` — overshoot for current scale; can split later

**Reasoning:** Three roles match the actual organizational shape Kevin is planning toward (owner, field crew, office help). Each maps to a distinguishable RLS policy boundary. Customer is correctly excluded — it's a different auth path entirely.

**Trade-off accepted:** `contractor` and `employee` have nearly-identical permissions today. The distinction becomes load-bearing later (e.g., if employees see internal time-tracking that subcontractors shouldn't). Easier to start distinguished than migrate apart later.

---

## 2026-05-03: Customer-facing authentication uses magic_link_tokens, not org_members

**Context:** With contractor login standardizing on email/password and customer-facing surfaces requiring passwordless access (one-time quote review, invoice payment, portal viewing), there was a question about whether to model customers as a fourth `org_members` role or to keep customer auth in a separate path.

**Decision:** Customers are NOT members of `org_members`. Customer-facing auth goes through the existing `magic_link_tokens` table (introduced in migration 0003), scoped per-resource (per-quote, per-invoice, per-portal-account). Internal team roles in `org_members` stay strictly internal: owner, contractor, employee.

**Alternatives considered:**
- Customer as a fourth `org_members` role. Single auth flow for everyone, but RLS gets complex (customers must see only their own data; employees see all customers; etc.) and the conceptual model muddies — customers aren't team members.

**Reasoning:** Customers are external stakeholders with scoped resource access, not team members with broad org access. The schema already models them this way (`magic_link_tokens` has been there since migration 0003). Conflating both into `org_members` would force RLS policies to do a job better handled by token scoping, with no offsetting UX gain.

**Trade-off accepted:** Two auth surfaces to maintain (cookie sessions for staff, token URLs for customers). The two are fully independent so they evolve separately without coupling.

---

## 2026-05-03: Resend transactional email uses `mail.ppmnky.com` subdomain, not the apex

**Context:** Resend domain verification needs SPF, DKIM, and DMARC TXT records. The apex `ppmnky.com` already has Google Workspace's SPF for `kevinsommers@ppmnky.com` (`v=spf1 include:_spf.google.com ...`). Only one SPF record is allowed per host, so adding Resend on the apex would mean editing the existing record to also include Resend — which risks breaking inbound mail to the Workspace inbox if anything is fat-fingered.

**Decision:** Verify Resend on `mail.ppmnky.com`. Resend's SPF/DKIM/DMARC live on the subdomain; the apex SPF is left untouched. Outbound transactional email sends from addresses like `quotes@mail.ppmnky.com`, `noreply@mail.ppmnky.com`, and the planned `agent@mail.ppmnky.com`. Reply-to on customer emails points to `kevin@ppmnky.com` so replies still land in the Google Workspace inbox.

**Alternatives considered:**
- Use the apex `ppmnky.com` directly. Cleaner sender addresses (`quotes@ppmnky.com`) but requires merging Google's SPF include with Resend's into a single TXT record — any error there breaks Workspace email.

**Reasoning:** Subdomain delegation is the industry-standard pattern for transactional mail (Stripe, GitHub, Linear, etc. all use `*.<domain>`-style sender domains). Reputation isolation: damage on one subdomain doesn't affect the other. Cleaner mental model: personal/business mail on apex, system mail on `mail.`.

**Trade-off accepted:** Customer-visible sender addresses contain `mail.ppmnky.com` rather than `ppmnky.com`. A friendly From-name and a reply-to at the apex mostly conceals this.

---

## 2026-05-03: Marketing site lives as a separate Vercel project under ppmnky.com

**Context:** The Wix-hosted marketing site at ppmnky.com had multiple long-standing issues (broad service scope, weak SEO, awkward intake flow) that Wix's templates couldn't resolve. With the CRM already deployed as a Next.js app on Vercel, the question was whether to extend the CRM project to host marketing pages or to stand up the marketing site as its own deployable.

**Decision:** Marketing lives as its own Vercel project (Vite + React + react-router-dom), separate repo, deployed independently. Three subdomains share the apex once DNS settles at Porkbun: `ppmnky.com` and `www.ppmnky.com` → marketing site, `app.ppmnky.com` → CRM (`@premier/web`), `portal.ppmnky.com` → reserved for the Phase 2 customer portal. The marketing form integrates with the CRM via a public POST endpoint at `app.ppmnky.com/api/v1/quote-requests` (planned Phase 1.5).

**Alternatives considered:**
- Bundle marketing pages into the CRM Next.js app at the apex. Saves a Vercel project but mixes content lifecycles, deploy cadences, and audience-specific concerns; SEO and marketing iteration would always be hostage to CRM deploys.
- Keep Wix indefinitely. The Wix DNS panel and HTML embed sandbox proved too restrictive for the integrations the CRM needs (custom POST endpoints, native form styling).

**Reasoning:** Marketing and CRM serve different audiences (prospects vs operators), have different content lifecycles (site copy iterates monthly; CRM iterates daily), and have different SEO concerns. Two projects sharing one Vercel account and one domain registrar is the lowest-friction split.

**Trade-off accepted:** Two repos to maintain. The marketing form integration with the CRM happens via the public quote-request endpoint, which is also work we'd need anyway for the Jobber-widget replacement, so it's not net-new cost.

---

## 2026-05-03: Domain registrar moved from Wix to Porkbun

**Context:** ppmnky.com was previously registered through Wix, with DNS managed in Wix Studio's DNS panel. The panel was awkward for adding the records needed for Vercel custom domains and Resend domain verification, and Wix's pointing-method options conflicted with using the apex for marketing while pointing subdomains elsewhere.

**Decision:** Transfer the domain registration to Porkbun and use Porkbun's DNS panel as the single source of truth for all DNS records.

**Alternatives considered:**
- Stay on Wix as the registrar but change DNS pointing method. Workable for some patterns but Wix's UI made it hard to mix CNAMEs for subdomains with apex pointing to Wix's hosting. Future flexibility was poor.
- Cloudflare. Excellent DNS panel and free WHOIS privacy, but adds another vendor relationship; Porkbun is sufficient at this scale and has comparable UX.

**Reasoning:** Porkbun has a clean DNS UI, free WHOIS privacy, fast propagation, and broad record-type support. Single panel for all DNS work simplifies the Vercel + Resend + future-portal subdomain plan.

**Trade-off accepted:** Transfer takes 5–7 days during which DNS work is paused. All foundational subdomain setup (Vercel `app.`, Resend `mail.`) waits on completion.

---

## 2026-04-30: Contractor/staff auth uses email + password with owner-created invites; customer magic links stay separate

**Context:** Magic links were acceptable for early scaffolding, but they add friction for Kevin's day-to-day contractor workflow in the field. The app now needs a faster contractor sign-in path without giving up customer-facing magic-link flows later.

**Decision:** Use Supabase Auth email + password for contractor/staff login on the main app. Keep customer-facing magic links as a separate capability for quote, invoice, and portal access. Existing contractor accounts created during the magic-link phase transition to passwords through the password reset flow. New staff accounts are now created by owner/admin invite from the app, with the invite email taking the user into password setup. The older pending-approval flow remains only as a compatibility path for legacy self-signups or manually held memberships.

**Alternatives considered:**
- Keep magic links for everyone (too much friction on repeated contractor sign-ins)
- Let any staff self-sign up and wait for approval (works, but creates unnecessary friction and weakens control over who gets contractor access)
- Google-only login (good UX, but adds provider coupling and should remain optional later)
- Passkeys-first (promising, but still too new for this project's primary auth path)

**Reasoning:** Email + password is the most stable low-friction contractor flow Supabase supports today. Owner-created invites fit contractor/staff access better than open self-signup because Kevin controls who gets an account, invited users still land in a simple password-setup flow, and the existing auth trigger plus org membership model can support it without schema changes.

---

## 2026-04-25: Tailwind CSS 3.4.x (v3-lts) over 4.x

**Context:** Phase 0 Step 2 required Tailwind CSS. Tailwind 4 is the current `latest` on npm (4.2.4 as of this writing). shadcn/ui is in the process of migrating to Tailwind 4 but the migration removes `tailwind.config.ts` in favour of CSS-only configuration, and the shadcn component generation path for v4 is still shifting.

**Decision:** Pin `tailwindcss@^3.4.x` (v3-lts, currently 3.4.19). All shadcn/ui CSS variable tokens and component patterns are written for Tailwind 3. Standard `tailwind.config.ts` API is stable and well-understood.

**Alternatives considered:**
- Tailwind 4.x (current `latest`) — CSS-first config, no `tailwind.config.ts`, faster builds, but shadcn/ui upgrade path is incomplete

**Reasoning:** The risk of shadcn/ui generating v4-incompatible component code mid-project outweighs the speed benefit. v3-lts is explicitly maintained by the Tailwind team. Migrate to v4 once shadcn publishes a stable upgrade guide.

---

## 2026-04-25: ESLint 9 + Prettier over Biome

**Context:** PRD listed Biome for lint + format. At Phase 0 scaffold, Kevin explicitly specified ESLint flat config + Prettier.

**Decision:** ESLint 9 (flat config, `eslint.config.mjs`) + Prettier (`.prettierrc`). Root config with `typescript-eslint` v8 recommended rules. Per-package overrides added when needed (e.g., Next.js rules in `apps/web/`).

**Alternatives considered:**
- Biome (faster, single tool, but younger ecosystem — fewer Next.js-specific rules, less community tooling)

**Reasoning:** ESLint has first-class Next.js integration (`eslint-config-next`), is the default for `create-next-app`, and has a larger rule ecosystem for the patterns this project uses. Prettier is the standard pair for formatting. The speed advantage of Biome doesn't matter at this project's scale.

---

## 2026-04-25: pnpm 10 (not 9) as package manager

**Context:** README and initial requirement said `pnpm@9.x`. The installed environment has pnpm 10.33.0, which is the current stable major version.

**Decision:** Use pnpm 10. `packageManager` field in root `package.json` set to `pnpm@10.33.0`.

**Alternatives considered:**
- Force pnpm 9 via Corepack (works, but fights the environment and misses pnpm 10 improvements)

**Reasoning:** pnpm 10 is current stable. No pnpm 9-specific features are required. Use what's installed.

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
