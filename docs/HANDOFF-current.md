# SESSION HANDOFF

## Current branch

`main`
At commit `becae39`. Branch is up to date with origin. Working tree clean. No open PRs.

---

## Current PR status

All PRs merged. No open PRs.

---

## What was completed this session

### PR #66 — Wire request → estimate creation (merged)

Delivered:
- **`supabase/migrations/20260511130730_add_estimate_created_status.sql`**: Adds `estimate_created` to `service_request_status` enum. Applied to `premier-crm-prod`.
- **`packages/db/types.ts`**: Regenerated — `estimate_created` in `service_request_status` enum.
- **`packages/db/queries/requests.ts`**: Added `estimateId: string | null` to `RequestListItem` and `RequestDetail`; both SELECT queries now include `estimate_id`.
- **`apps/web/app/(app)/requests/actions.ts`**: Removed `convertRequestToJobAction`. Added `createEstimateFromRequestAction` — inserts `estimates` row (status=`draft`, `service_request_id` set), updates `service_requests` (`estimate_id`, `status='estimate_created'`, `converted_at`).
- **`apps/web/app/(app)/requests/_components/create-estimate-button.tsx`**: New client button. On success: toast + `router.push(/estimates/[id])`.
- **`apps/web/app/(app)/requests/_components/convert-to-job-button.tsx`**: Deleted (replaced by create-estimate-button).
- **`apps/web/app/(app)/requests/[taskId]/page.tsx`**: `ActionsCard` shows "Open estimate →" if `estimateId` set, else `<CreateEstimateButton>`. Header shows "Estimate created" badge. `estimate_created` in `StatusBadge` colorMap. Hint text updated to mention property requirement for estimates, not jobs.
- **`apps/web/app/(app)/requests/page.tsx`**: `estimate_created` in status badge. List rows show "Estimate created" pill linking to `/estimates/[id]` (legacy "Job created" badge still shows for older rows with `job_id`).

### PR #67A — Add `estimate_id` FK to quotes table (merged)

Delivered:
- **`supabase/migrations/20260511131122_add_estimate_id_to_quotes.sql`**: `ALTER TABLE quotes ADD COLUMN estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL`. Partial index on non-null values. Applied to `premier-crm-prod`.
- **`packages/db/types.ts`**: Regenerated — `quotes.Row` now has `estimate_id: string | null`.
- `quotes.job_id NOT NULL` constraint intentionally kept — that's PR #67B.
- `quote_line_items.job_id` was already nullable; no change needed there.

---

## What is merged (all sessions)

| PR | Title | Status |
|---|---|---|
| #67A | feat(quotes): add estimate_id FK to quotes table | MERGED |
| #66 | feat(requests): wire request → estimate creation | MERGED |
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

- `main`: at commit `becae39` (PR #67A merge)
- Working tree: clean
- No open PRs

---

## Current product-direction decisions

### Operational backbone (target)
**Website Request → Estimate → Quote → Job → Invoice**

All stages now have schema and UI. The quote↔job coupling is the last structural constraint to resolve.

### Stage definitions

- **Requests** (`/requests`): Inbound intake queue. `service_requests` table. Website form → `createServiceRequest` → `service_requests`. Count badge on nav. "Create estimate" CTA converts request → estimate.
- **Estimates** (`/estimates`): First-class entity. `estimates` table. List + stub detail pages live. PR #66 wires request → estimate. Full detail + quote creation in PR #68.
- **Quotes** (`/quotes`): Customer-facing commercial document. Fully built (PRs #47–#57). Now has `estimate_id` column (nullable). Still requires `job_id NOT NULL` until PR #67B.
- **Jobs** (`/jobs`): Execution workspace. Full lifecycle status enum.

### Navigation model
Bottom nav: **Today | Jobs | Quotes | Customers | Requests** (5 slots).
Nav changes deferred until after PR #68 (estimates detail + quote creation from estimate).

### Estimates schema
`estimates` table live in `premier-crm-prod`. Migration: `20260511123231_estimates.sql`.
`estimate_status` enum: `draft | site_visit_scheduled | site_visit_complete | quoted | accepted | declined | expired | converted`.
`service_requests.estimate_id` FK exists. `service_requests.status='estimate_created'` set on conversion.

### Quote FK state
- `quotes.estimate_id`: nullable FK → `estimates(id)` (added PR #67A)
- `quotes.job_id`: still NOT NULL — drops in PR #67B
- `quote_line_items.job_id`: already nullable, no further change needed

### Legacy bridge model
`/jobs?view=estimates` still exists (lead-status jobs). Now superseded by `/estimates` but not removed. Can be cleaned up in a future housekeeping PR.

---

## Risks / blockers

### 1. `quotes.job_id NOT NULL` — still in place (PR #67B)
Quote creation still requires a `job_id`. Estimates cannot generate quotes until PR #67B drops this constraint.

### 2. `quote-requests` route still writes to tasks
`/api/v1/quote-requests` → `createQuoteRequest` → `tasks`. Harmless but stale.

### 3. Today page is still a full client component
Not urgent. Covered in suggested future work.

---

## Suggested next work (ordered)

### PR #67B — Make `quotes.job_id` nullable
Migration only:
```sql
ALTER TABLE public.quotes ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_has_job_or_estimate
  CHECK (job_id IS NOT NULL OR estimate_id IS NOT NULL);
```
No backfill needed — all existing rows have `job_id` set.
After this: regenerate types, update `createDraftQuote` in `quotes.ts` to accept either `jobId` or `estimateId` (not both required).

### PR #68 — Estimate detail page + quote creation from estimate
- Replace stub `/estimates/[estimateId]/page.tsx` with full detail page
- "Create quote" server action (`createQuoteFromEstimateAction`) using the decoupled `createDraftQuote`
- Status workflow buttons (approve site visit, mark complete, etc.)
- Nav changes: add Estimates slot or replace Jobs tab

### PR #69 — Approve estimate → create job
- `approveEstimateAction`: creates job from estimate, sets `estimates.converted_job_id` + `converted_at`, `estimates.status='converted'`

### PR #70 — Request status cleanup
- Remove stale enum values (`approved`, `scheduled`, `in_progress`) from `service_request_status` if they're no longer reachable via UI
- Or add to "reviewed" tab display only

---

## Resume instructions for next session

1. Confirm repo state: `git log --oneline -3` should show `becae39` at HEAD on `main`
2. Re-read this file: `docs/HANDOFF-current.md`
3. Proceed with PR #67B (make `quotes.job_id` nullable) — it is a migration + type regen + one function signature update, very small
