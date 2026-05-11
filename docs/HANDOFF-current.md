# SESSION HANDOFF

## Current branch

`main`
At commit `aaf80f8`. Branch is up to date with origin. Working tree clean. No open PRs.

---

## Current PR status

All PRs merged. No open PRs.

---

## What was completed this session

### PR #64 — Estimates schema (merged prior session context)

Delivered:
- **`supabase/migrations/20260511123231_estimates.sql`**: `estimate_status` enum (8 values), `estimates` table, sequence + `next_estimate_number()` → `EST-000001`, `service_requests.estimate_id` FK, RLS + grants
- Applied to live DB (`premier-crm-prod`). Types regenerated.

### PR #65 — Estimates query layer + /estimates list page (merged)

Delivered:
- **`packages/db/queries/estimates.ts`**: `listEstimates` (optional `statuses[]` filter, customer + property joins, sorted `updated_at DESC`), `getEstimateById` (full detail with description/site_visit_notes/converted_at)
- **`packages/db/index.ts` + `packages/db/queries/index.ts`**: All estimate types and functions exported
- **`apps/web/app/(app)/estimates/page.tsx`**: Server-component list page. Active tab (draft/site_visit_scheduled/site_visit_complete/quoted) and All tab. Status badges for all 8 `estimate_status` values. Customer name linked, property address inline. Site visit + expiry dates. "From request" and "Job created" pill badges.
- **`apps/web/app/(app)/estimates/[estimateId]/page.tsx`**: Minimal stub detail page — fetches real data, shows customer/property/description/source links, placeholder note for actions in PR #68.

---

## What is merged (all sessions)

| PR | Title | Status |
|---|---|---|
| #65 | feat(estimates): query layer + /estimates list page | MERGED |
| #64 | feat(estimates): estimates schema migration | MERGED |
| #63 | feat(nav): request count badge on bottom nav + Today snapshot | MERGED |
| #62 | feat(requests): switch inbox from tasks to service_requests | MERGED |
| #61 | feat(schema): service_requests migration + wire intake route | MERGED |
| #60 | feat(estimates): estimates view on /jobs + fix Today quick action | MERGED |
| #59 | feat(requests): request detail page + convert to lead job | MERGED |
| #58 | feat(requests): intake inbox at /requests | MERGED (prior session) |

---

## What is open

Nothing. All branches pushed. No open PRs.

---

## Repo sync state

- `main`: at commit `aaf80f8` (PR #65)
- Working tree: clean (HANDOFF doc uncommitted change only)
- No open PRs

---

## Current product-direction decisions

### Operational backbone
**Website Request → Estimate → Quote → Job → Invoice**

The bridge model (lead-status jobs as estimates) is scaffolding only. The real `estimates` table is now live.

### Stage definitions

- **Requests**: Inbound intake queue at `/requests`. Backed by `service_requests`. Count badge on nav + Today.
- **Estimates** (new): First-class entity at `/estimates`. `estimates` table live in prod. List + stub detail pages at `/estimates` and `/estimates/[id]`.
- **Quotes**: Customer-facing commercial document. Fully built (PRs #47–#57). Currently still tied to `job_id NOT NULL` (to be decoupled in PR #67A/B).
- **Jobs**: Execution workspace. Status enum covers full lifecycle.

### Navigation model
Bottom nav: **Today | Jobs | Quotes | Customers | Requests** (5 slots).
Nav changes deferred until after PR #68 (estimates detail + quote creation from estimate).

### Estimates schema
`estimates` table live in `premier-crm-prod`. Migration: `20260511123231_estimates.sql`.
Key fields: `estimate_number` (EST-000001), `status` (8-value enum), `customer_id`/`property_id` (NOT NULL), `service_request_id` (nullable FK), `converted_job_id` (nullable FK ON DELETE SET NULL).
`service_requests.estimate_id` FK also added (nullable).

### Bridge model (legacy)
`/jobs?view=estimates` still exists showing lead-status jobs. This is now superseded by `/estimates` but not yet removed. Can be cleaned up alongside PR #66 or after.

---

## Risks / blockers

### 1. `quotes.job_id NOT NULL` — quotes not yet decoupled from jobs
Quote creation still requires a `job_id`. Must be resolved in PR #67A (add `estimate_id` to quotes) + PR #67B (make `job_id` nullable) before estimates can generate quotes.

### 2. Request → estimate wiring not yet done
`convertRequestToJobAction` in `apps/web/app/(app)/requests/actions.ts` still creates a lead-status job. PR #66 replaces this with `createEstimateFromRequestAction`. Until then, the "Convert to job" button on request detail still creates a job, not an estimate.

### 3. `quote-requests` route still writes to tasks
`/api/v1/quote-requests` → `createQuoteRequest` → `tasks`. Harmless but stale. Deprecate or migrate alongside PR #66 or later.

### 4. Today page is still a full client component
`/today` fetches client-side. Not urgent.

---

## Suggested next work (ordered)

### PR #66 — Wire request → estimate creation
- Replace `convertRequestToJobAction` with `createEstimateFromRequestAction` in `apps/web/app/(app)/requests/actions.ts`
- Action: creates `estimates` row (status=`draft`), sets `service_requests.estimate_id`, sets `service_requests.status='approved'`
- Update request detail page: rename button to "Create estimate", link to `/estimates/[id]` on success
- Update `RequestDetail` type to include `estimateId` field

### PR #67A — Add `estimate_id` to quotes
- Migration: `ALTER TABLE quotes ADD COLUMN estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL`
- Regenerate types
- Update `createDraftQuote` to accept `estimateId` param (optional for now)

### PR #67B — Make `quotes.job_id` nullable
- Migration: `ALTER TABLE quotes ALTER COLUMN job_id DROP NOT NULL`, add CHECK `(estimate_id IS NOT NULL OR job_id IS NOT NULL)`
- Backfill: any existing `quotes` rows where `job_id IS NOT NULL` are already fine
- Regenerate types
- Update `createDraftQuote` signature to make `jobId` optional

### PR #68 — Estimate detail page + quote creation from estimate
- Full detail page replacing stub: status workflow buttons, "Create quote" action
- `createDraftQuote` call from estimate context
- Nav changes: add Estimates to nav (or replace Jobs+Estimates with a merged concept)

### PR #69 — Approve estimate → create job
- `approveEstimateAction`: creates job from estimate, sets `estimates.converted_job_id` + `converted_at`

---

## Resume instructions for next session

1. Confirm repo state: `git log --oneline -3` should show `aaf80f8` at HEAD on `main`
2. Re-read this file: `docs/HANDOFF-current.md`
3. Pick a direction from "Suggested next work" above — PR #66 (request→estimate wiring) is the natural next step
