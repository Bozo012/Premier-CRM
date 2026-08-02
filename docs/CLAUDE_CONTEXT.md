# Claude Context — Premier CRM

Durable project context for any Claude Code session working in this repo. Read this once per session; it links to the detailed docs rather than repeating them. For *current* execution status (what's done, what's next, what's blocked), read `docs/SESSION_STATE.md` instead — this file is architecture and rules, not a status report.

## Platform vision

One operational platform, one authoritative business engine, multiple interfaces: the staff CRM (this repo, `apps/web`), the customer portal (`apps/web/app/portal/`, same codebase), the public marketing website (`Modern Service System Website`, a separate Vite/React repo), and future mobile/AI interfaces. Shared business logic, never duplicated lifecycle or financial rules per interface. Long-term direction: portable, owner-controlled software, not vendor lock-in. Full detail (once written — see Deferred Features) belongs in `docs/PREMIER_PLATFORM_VISION.md`.

## Repository purpose

`C:\dev\Premier-CRM` is the Next.js 15 (App Router) monorepo containing the CRM and the customer portal. Related repos: `Modern Service System Website` (marketing site, ppmnky.com), `Premier-Systems` (Obsidian vault, context only, not code).

## Authoritative backend / source-of-truth rules

- Postgres (Supabase) is the single source of truth for all business state. No duplicated business logic between CRM and portal — both call the same server actions / `packages/db/queries/` functions / SQL functions.
- One shared service per lifecycle transition, both surfaces call it. Example: `createJobFromAcceptedQuote()` is called by both the staff manual action and the customer accept path — neither re-implements it. When adding a new transition, ask "could staff and a customer both trigger this?" — if yes, the logic goes in `packages/db/queries/` or a SQL function, with both call sites as thin wrappers. Full rationale: `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`.

## Environment boundaries

Three Supabase projects — never confuse them:
| Environment | Project name | Ref |
|---|---|---|
| Production | `premier-crm-prod` | `apnbpcauqrjvkoleisde` |
| E2E testing | `premier-crm-e2e` | `slbnizoskumwhleeiccv` |

Always check `cat supabase/.temp/project-ref` before any migration or `execute_sql` call — do not assume which one the CLI is linked to. `apps/web/.env.local` is configured for **production** by design; local dev against e2e requires process-level env var overrides, never editing that file.

Vercel: project `premier-crm-web` (team `bozo012s-projects`), auto-deploys to production on merge to `main` via the GitHub integration — no separate manual deploy step. This means merging a PR is the deploy; treat merge as a production action, not just a code-review action.

## Production-safety rules

- `apps/web/app/api/e2e-health/route.ts` must always 404 on an actual production deployment or when resolved against the prod project ref — this is what lets the e2e suite refuse to run against production. Never remove or weaken this check.
- `playwright.config.ts` + `tests/e2e/global-setup.ts` are the two-layer guard that stops the e2e suite from ever running against `premier-crm-prod`. Both must stay in place.
- Migrations are applied to `premier-crm-e2e` first, always, with an explicit dry-run + history verification, before ever touching `premier-crm-prod` — and prod application requires explicit human approval every time, not automatic.
- Never delete financial records to "clean up" — see `BASELINE_V1.md`'s invoice-immutability design and the working-invoice kind-lock trigger. An exception requires its own separate, explicit approval, never bundled into a general cleanup approval.

## Migration discipline

Immutable once applied — never edit an existing migration, always add a new one. Sequential `NNNN_description.sql` naming for the earliest migrations; later ones use `YYYYMMDDHHMMSS_description.sql` timestamps (both patterns coexist in `supabase/migrations/`, that's expected). Run `pnpm db:types` after every schema change. Full discipline and the complete migration history for the current lifecycle feature set: `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`.

## RLS and capability architecture

- Every table has RLS enabled with at least one explicit policy. Server actions use the service-role client (bypasses RLS) — so RLS alone cannot protect contractual data from an app-layer bug. The pattern used to close that gap: structural DB triggers that fire for every role including `service_role` (e.g. `invoices_prevent_working_kind_change`, the change-order immutability triggers), and `SECURITY DEFINER` RPC functions as the *only* mutation path for change-order tables (no direct `authenticated` INSERT/UPDATE/DELETE grant exists on them).
- Capabilities (not raw role checks) gate actions — `packages/shared/permissions.ts`'s `CAPABILITIES` map. New authorization logic goes there, never a hardcoded role check at a call site.
- Portal RLS pattern (reuse this exact join shape for any new customer-visible table): `EXISTS (SELECT 1 FROM jobs j JOIN customer_accounts ca ON ca.customer_id = j.customer_id WHERE j.id = <table>.job_id AND ca.auth_user_id = auth.uid() AND ca.status = 'active')`.

## Request-to-payment lifecycle (canonical, implemented, E2E-verified)

```
service request → estimate → quote → accepted quote → unscheduled job
  → scheduled job → deposit stage → working invoice
  → proposed change order → customer approval/decline
  → incorporated (exactly once) → final invoice → payment
```

Full detail, including every DB-level idempotency guard: `docs/BASELINE_V1.md`.

## Working-invoice rules

Exactly one non-void working invoice per job (partial unique index). DB triggers block it from ever being sent, viewed, or paid directly. Its `kind` can **never** change once set to `'working'` — enforced by `invoices_prevent_working_kind_change`, a `BEFORE UPDATE OF kind` trigger that fires for every role. The only sanctioned path to a final invoice is `generateFinalInvoiceFromWorking()` **snapshotting a new row** — never repurposing the working invoice in place. Portal visibility is intentionally narrow (RLS excludes `kind='working'` entirely; portal reads a dedicated summary query, not the raw row).

## Deposit source of truth

`job_deposits` is a requirement/configuration record only (amount/percentage, due date, blocking flags) — it never stores paid/partial/refunded amounts. Payment status is always derived at read time from `invoices` (`kind='deposit'`) + `payments` via `getDepositState()`. Never add a second place that tracks deposit payment state.

## Versioned change-order rules

`change_orders` (stable thread) + `change_order_revisions` (immutable once proposed) + `change_order_line_items` (frozen with their revision) + `change_order_comments`. Full lifecycle enforced by a `BEFORE UPDATE` trigger on `change_order_revisions` firing for every role including `service_role`. Only `SECURITY DEFINER` RPC functions mutate these tables. Price is always computed server-side from frozen line items, never trusted from a caller-supplied total. Only the customer's approval is contractual acceptance — staff can draft/propose, never self-approve. Incorporation is exactly-once (guarded `UPDATE ... WHERE incorporated_at IS NULL`).

Customer-facing label is "Project change," legal/accounting label stays "Change order" — same underlying tables and RPCs, presentation-layer difference only, per audience.

## Testing conventions

- Vitest for unit/integration (co-located `foo.test.ts` next to `foo.ts`), Playwright for e2e (`tests/e2e/*.spec.ts`).
- E2E bots create their own isolated fixtures (marker-prefixed `E2E_TEST_...`), register explicit cleanup, and prove DB-level enforcement via direct API calls signed in as the relevant user — not just hidden UI, since a hidden button doesn't prove a service-role bug can't bypass it.
- **A real `pnpm --filter web build` must be run before trusting a change is deploy-safe** — `tsc --noEmit` and `pnpm dev` do not catch Next.js App Router's route-export-shape validation (a real production build failure was caught by Vercel, not locally, earlier in this project's life — see `docs/SESSION_STATE.md`'s Known Issues for the specific incident).
- When testing an email-driven auth flow, be aware that `supabase.auth.admin.generateLink()` can return a **different URL shape** than what the actual configured email template sends — this exact gap let a production `/auth/confirm` 404 slip past full e2e suite passage. Prefer testing against the real email template's shape when in doubt.

## Cleanup conventions

Production data cleanup always follows: inventory first (classify every record into core config / legitimate business history / test artifacts / imported data), present the exact ID list for approval before deleting anything, capture a safety snapshot (IDs + counts + migration state, never a data export) before destructive action, then FK-safe ordered deletion by explicit ID list — never a broad `WHERE` clause without first listing the rows.

## Current roadmap

Tracked live in `docs/SESSION_STATE.md` and the approved plan at `C:\Users\somme\.claude\plans\mighty-watching-raven.md`. Summary: Milestone A (production stabilized, **achieved**) → production cleanup → Demo org → **site-visit/inspection workflow (a confirmed core request-to-quote lifecycle gap, not a UX item — see below)** → PPM operational readiness → real-world observation period → Milestone B (`v1.0-backend-stable` tag + documentation, gated on the site-visit workflow being implemented and verified) → Phase 6 UX Transformation (Base44-assisted, after a compatibility spike, CRM/portal/website treated as three interfaces to one platform — no schema/lifecycle/permissions redesign, no replacement backend, no repo merge without its own plan).

**Confirmed core-lifecycle gap (not deferred, not UX-only)**: the request → estimate flow is missing dedicated site-visit scheduling, a "visit started" state, and any findings/photos/questions capture at visit completion — staff can currently skip straight from a fresh draft estimate to creating a quote with zero site-visit data captured. Confirmed live against a real production request during a 2026-08-01/02 walkthrough. Full detail in the plan file's "Phase 3.5" section and `docs/SESSION_STATE.md`'s "Request-flow findings." Do not implement until that phase is reached in sequence, and do not lose this by treating it as a Phase 6 UX polish item — it isn't one.

## Deferred features

Carried from `docs/BASELINE_V1.md`, not re-scoped: job completion lifecycle (`in_progress → completed`), Stripe/payment-provider integration, combined atomic reschedule (cancel+rebook in one transaction). `docs/PREMIER_PLATFORM_VISION.md` does not exist yet — it's a Milestone B (Phase 5) deliverable.

## Detailed docs (read these for depth, not duplicated here)

- `CLAUDE.md` — commands, monorepo layout, `Result<T>` pattern, route table.
- `CONVENTIONS.md` — locked tech stack, code style, DB conventions, RLS rules (non-negotiable).
- `ARCHITECTURE.md` — layer diagram, data-flow examples (note: describes some longer-term/aspirational surfaces — mobile app, AI vault, automation engine — that are not part of the current active roadmap; cross-check against `BASELINE_V1.md`'s "explicitly out of scope" section before assuming something is built).
- `docs/BASELINE_V1.md` — what's verified working as of the integrated-lifecycle release, the canonical source for "is X actually built."
- `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md` — the *why* behind the lifecycle architecture, full migration history for that feature set, the E2E production-safety guard.
- `docs/SESSION_STATE.md` — current execution status, next exact step, known issues. Read this first when resuming work.
- `docs/HANDOFF-current.md`, `docs/IMPLEMENTATION-STATUS.md` — **stale, superseded**, predate the integrated-lifecycle release. Historical record only.
