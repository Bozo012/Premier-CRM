# SESSION HANDOFF

## Current branch

`main`
At commit `307f7af`. PR #68 + PR #69-A (bridge deprecation + manual estimates) changes are local, not yet committed.

---

## Locked product decisions

These are confirmed and must not be revisited without explicit instruction:

| Decision | Value |
|---|---|
| Canonical flow | Request → Estimate → Quote → Job → Invoice |
| Manual entry path | Manual Estimate → Quote → Job → Invoice |
| Job creation trigger | Manual staff action after quote is accepted — NOT automatic |
| New job starting status | `approved` |
| Estimates ≠ Jobs | Estimates are never created as placeholder Jobs |
| Job creation gate | `quote.status = accepted`, `quote.estimate_id` set, `quote.job_id` null, `estimate.converted_job_id` null |

---

## What was completed this session

### PR #68 — Estimate detail page + quote creation from estimate (local, uncommitted)

- `QuoteDetail.job` and `QuoteTokenDetail.job` both `QuoteJobSummary | null`
- `getQuoteById` + `getQuoteByToken`: estimate-context path when `job_id` is null — fetches customer/property from linked estimate, returns `job: null`
- `listQuotesForEstimate` added to estimates query layer
- `createQuoteFromEstimateAction`: creates draft quote, advances estimate to `quoted`
- `CreateQuoteButton` client component
- Estimate detail page rewritten: linked quotes list + Create quote button
- Quote detail page: null-guarded all `job.*` access; back-link adapts to estimate context
- Public token page: null-guarded "Related job" section

### PR #69-A — Bridge deprecation + manual estimate entry (local, uncommitted)

**Routing corrections:**
- `today/page.tsx` — "New estimate" quick action now points to `/estimates/new` (was `/jobs?view=estimates`)
- `jobs/page.tsx` — Estimates tab removed from nav; redirect added: `?view=estimates` → `/estimates`; all bridge model branching removed (`ESTIMATE_STATUSES`, `ViewMode`, `readViewParam`, `formatEstimatesTotal`, `isEstimates` logic, estimates-specific forms and empty states)
- `/estimates` empty state copy updated: "create one manually" with link to `/estimates/new`
- `/estimates` header: "New estimate" button added pointing to `/estimates/new`

**Manual estimate creation:**
- `/estimates/new` page — auth-guarded server page with clean layout
- `NewEstimateForm` client component:
  - Step 1: customer search (calls `searchCustomersForPickerAction`)
  - Step 2: property picker per customer (calls `listPropertiesForCustomerAction`) — auto-selects if only one property
  - Step 3: title (required) + description (optional)
  - Submit calls `createManualEstimateAction` → redirects to new estimate detail
- Three new server actions in `estimates/actions.ts`:
  - `searchCustomersForPickerAction` — searches by name, returns top-30
  - `listPropertiesForCustomerAction` — queries `customer_properties` + `properties` for a customer
  - `createManualEstimateAction` — validates customer/property org membership + link, inserts estimate with `service_request_id = null`

---

## What is merged (all sessions)

| PR | Title | Status |
|---|---|---|
| #69-A | fix: bridge deprecation + manual estimate entry | LOCAL |
| #68 | feat(estimates): estimate detail page + quote creation | LOCAL |
| #67B | feat(quotes): make quotes.job_id nullable + safety CHECK | MERGED |
| #67A | feat(quotes): add estimate_id FK to quotes table | MERGED |
| #66 | feat(requests): wire request → estimate creation | MERGED |
| #65 | feat(estimates): query layer + /estimates list page | MERGED |
| #64 | feat(estimates): estimates schema migration | MERGED |
| #63 | feat(nav): request count badge on bottom nav + Today snapshot | MERGED |
| #62 | feat(requests): switch inbox from tasks to service_requests | MERGED |
| #61 | feat(schema): service_requests migration + wire intake route | MERGED |
| #60 | feat(estimates): estimates view on /jobs + fix Today quick action | MERGED |
| #59 | feat(requests): request detail page + convert to lead job | MERGED |
| #58 | feat(requests): intake inbox at /requests | MERGED |

---

## Corrected active PR order

| # | Title | Status |
|---|---|---|
| #69-A | Bridge deprecation + manual estimate entry | LOCAL — ready to commit |
| #69-B | Estimate status workflow controls | Next |
| #69-C | Quote accepted → create job (CAUTION) | After B |
| #69-D | Bridge cleanup in job creation paths | After C |
| #69-E | Workflow hardening | After D |

---

## Next PR: #69-B — Estimate status workflow controls

**Goal:** Allow staff to manually advance estimate status through pre-quote stages.

**Allowed transitions:**
- `draft` → `site_visit_scheduled`
- `site_visit_scheduled` → `site_visit_complete`

**Not allowed via this action:**
- Advancing to `quoted` (set by quote creation)
- Advancing to `accepted`, `converted`, `declined`, `expired` (terminal or complex)

**Scope:**
- New action in `estimates/actions.ts`: `updateEstimateStatusAction(estimateId, newStatus)`
  - Validates org membership, estimate belongs to org
  - Validates transition is one of the two allowed
  - Updates `estimates.status`
  - Revalidates `/estimates/${estimateId}` and `/estimates`
- Update `estimates/[estimateId]/page.tsx`: show status progression button(s) based on current status
- Optional: capture `site_visit_at` date when advancing to `site_visit_scheduled`

**Files:** `estimates/actions.ts`, `estimates/[estimateId]/page.tsx`
**Schema changes:** None

---

## PR #69-C — Quote accepted → create job (CAUTION — extra care)

**Goal:** When a quote is accepted, staff clicks an internal action to create the job. NOT automatic.

**Action: `createJobFromAcceptedQuoteAction(quoteId)`**

Preconditions (all must pass):
1. `quote.status === 'accepted'`
2. `quote.estimate_id` is set
3. `quote.job_id` is null (no job yet)
4. `estimate.converted_job_id` is null (not already converted — blocks double-execution)

Execution:
1. Read estimate: `customer_id`, `property_id`, `title`
2. Insert job: `status = 'approved'`, `customer_id`, `property_id`, `title`, `quoted_total = quote.total`
3. Update `quotes`: `job_id = new_job.id`
4. Update `estimates`: `converted_job_id = new_job.id`, `converted_at = now()`, `status = 'converted'`
5. Revalidate quote detail, estimate detail, jobs list
6. Return `{ jobId }`

**UI:** Replace the "Job creation from estimate is coming soon" holding message on the quote detail page (`quote.status === 'accepted' && !job`) with a "Create job" button.

**Preflight before coding:**
- Confirm no estimate-origin accepted quotes exist in production (there shouldn't be any yet)
- Verify `quotes` table `job_id ON DELETE CASCADE` behavior — should be `ON DELETE SET NULL` for safety

**Files:** `estimates/actions.ts`, `quotes/[quoteId]/page.tsx`, new `_components/create-job-button.tsx`
**Schema changes:** None for action; potential FK behavior fix as a separate migration

---

## Current repo state

- `main` at commit `307f7af`
- Local uncommitted: PR #68 + PR #69-A changes (all passing typecheck + build)
- Working tree: dirty (multiple files changed/added)

---

## Risks / open questions

1. **One estimate → one job enforcement:** The `estimate.converted_job_id` single FK enforces this at the data level. The action guard (`converted_job_id IS NULL`) prevents second job creation even if multiple quotes are accepted under the same estimate.

2. **`quotes.job_id ON DELETE CASCADE` vs SET NULL:** Original schema (`0002_crm_core.sql`) has `job_id UUID REFERENCES jobs(id) ON DELETE CASCADE`. In the new model, deleting a job should not delete its quotes (quote history is valuable). A future migration should change this to `ON DELETE SET NULL`. Not urgent while no jobs exist.

3. **Bridge model job statuses (`lead`, `site_visit_scheduled`, `quoted`):** Still in the `job_status` enum in Postgres. No UI path creates jobs at these statuses anymore. Do not remove enum values without a data audit (`SELECT status, COUNT(*) FROM jobs GROUP BY status`).

4. **`/jobs?view=estimates` bookmark redirect:** The jobs page now redirects `?view=estimates` to `/estimates` via `redirect('/estimates')`. Existing bookmarks will land correctly.
