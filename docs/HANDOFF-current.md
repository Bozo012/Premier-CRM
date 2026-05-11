# SESSION HANDOFF

## Current branch

`main`
At commit `307f7af`. Branch is up to date with origin. Working tree clean. No open PRs.

---

## Current PR status

All PRs merged. No open PRs.

---

## What was completed this session

### PR #66 — Wire request → estimate creation (merged)

- `estimate_created` enum value added to `service_request_status`
- `createEstimateFromRequestAction`: creates `estimates` row (draft), sets `service_requests.estimate_id` + `status='estimate_created'` + `converted_at`
- `CreateEstimateButton` component replaces `ConvertToJobButton`
- Request detail page: "Create estimate" CTA → on success redirects to `/estimates/[id]`; if estimate exists shows "Open estimate →"
- `estimateId` field added to `RequestListItem` and `RequestDetail`
- Status badge + list row badges updated for `estimate_created`

### PR #67A — Add `estimate_id` FK to quotes (merged)

- `ALTER TABLE quotes ADD COLUMN estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL`
- Partial index on non-null `estimate_id`
- Types regenerated: `quotes.Row.estimate_id: string | null`

### PR #67B — Make `quotes.job_id` nullable (merged)

- `ALTER TABLE quotes ALTER COLUMN job_id DROP NOT NULL`
- `ADD CONSTRAINT quotes_has_job_or_estimate CHECK (job_id IS NOT NULL OR estimate_id IS NOT NULL)`
- Applied to `premier-crm-prod`. Table was empty — zero data risk.
- `packages/db/types.ts`: `quotes.Row.job_id: string | null`
- `packages/db/queries/quotes.ts`:
  - `createDraftQuote`: now accepts either `input.jobId` (job path, unchanged) or `estimateId + title` (estimate path, no job fetch)
  - `listQuotes`: null-safe jobIds filter, conditional job fetch, `QuoteListJobSummary.id: string | null`
  - `getQuoteById` + `getQuoteByToken`: early return if `job_id` null (guard for future estimate-only quote detail, PR #68)
  - `addQuoteLineItem`: conditional job property fetch when `job_id` null
- `apps/web/app/(app)/quotes/actions.ts`: `approveJobAction` null guard on `quote.job_id`

---

## What is merged (all sessions)

| PR | Title | Status |
|---|---|---|
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
| #58 | feat(requests): intake inbox at /requests | MERGED (prior session) |

---

## What is open

Nothing. All branches pushed. No open PRs.

---

## Repo sync state

- `main`: at commit `307f7af` (PR #67B)
- Working tree: clean
- No open PRs

---

## Current product-direction decisions

### Operational backbone (target)
**Website Request → Estimate → Quote → Job → Invoice**

All schema steps are now complete. The remaining work is UI wiring for the estimate workspace.

### Stage definitions

- **Requests** (`/requests`): Inbound intake. "Create estimate" CTA converts request → estimate (sets `service_requests.estimate_id`, `status='estimate_created'`).
- **Estimates** (`/estimates`): First-class entity. List + stub detail pages live. Full detail + quote creation in PR #68.
- **Quotes** (`/quotes`): Fully built. Now decoupled from `job_id` (nullable with CHECK constraint). Can be created from either a job or an estimate. `getQuoteById` / `getQuoteByToken` still assume job presence — PR #68 will add the estimate-only detail path.
- **Jobs** (`/jobs`): Execution workspace. Full lifecycle.

### Quote FK state (final)
- `quotes.job_id`: nullable, `CHECK (job_id IS NOT NULL OR estimate_id IS NOT NULL)` enforces at least one anchor
- `quotes.estimate_id`: nullable FK → `estimates(id)` ON DELETE SET NULL
- `createDraftQuote`: accepts either `{ input: { jobId } }` (job path) or `{ estimateId, title }` (estimate path)
- `approveJobAction`: guards against `job_id IS NULL` — estimate-only quote approval deferred to PR #69

### Known deferred items
- `getQuoteById` / `getQuoteByToken` return NOT_FOUND if `job_id` is null — PR #68 extends these for estimate context
- `approveJobAction` returns VALIDATION_ERROR for estimate-only accepted quotes — PR #69 handles this path
- `QuoteListJobSummary.id` is now `string | null` — quote list UI currently renders `job.id` as a link; null case not yet reached in practice

---

## Risks / blockers

### 1. Quote detail for estimate-only quotes not yet wired
`getQuoteById` / `getQuoteByToken` return NOT_FOUND when `job_id` is null. No estimate-only quotes exist yet, so this is safe. PR #68 extends both.

### 2. Accept-quote → approve-job for estimate-only quotes
`approveJobAction` returns VALIDATION_ERROR for quotes without `job_id`. Correct behavior for now. PR #69 wires the accept-quote → approve-estimate → create-job flow.

### 3. Bridge model at /jobs?view=estimates
`/jobs?view=estimates` still exists (lead-status jobs). Superseded by `/estimates`. Can be removed in a housekeeping PR after nav is finalised.

### 4. `quote-requests` route still writes to tasks
`/api/v1/quote-requests` → `createQuoteRequest` → `tasks`. Harmless but stale.

---

## Suggested next work (ordered)

### PR #68 — Estimate detail page + quote creation from estimate
This replaces the stub at `/estimates/[estimateId]/page.tsx`.

Build:
1. Fetch estimate with customer + property + linked quotes (JOIN `quotes WHERE estimate_id = ?`)
2. Status workflow display (draft → site_visit_scheduled → site_visit_complete → quoted → accepted)
3. "Create quote" action: calls `createDraftQuote(client, { createdBy, orgId, estimateId, title: estimate.title })`
4. On quote created: `estimates.status` updates to `quoted` (or keep as `draft` until quote is sent — decision needed)
5. Link to existing quote detail page `/quotes/[id]` from estimate detail
6. Extend `getQuoteById` to work when `job_id` is null (build job summary from estimate context instead)

### PR #69 — Approve estimate → create job
- `approveEstimateAction`: creates job from estimate fields, sets `estimates.converted_job_id` + `converted_at`, `estimates.status='converted'`
- Updates `quotes WHERE estimate_id = ?` to set `job_id` (so existing quote detail / token pages continue to work without changes)

### PR #70 — Nav: add Estimates slot
- Add Estimates to bottom nav (replace one of the 5 current slots, or decision to use a different nav model)
- Currently deferred; user decision needed on which slot to swap

---

## Resume instructions for next session

1. Confirm repo state: `git log --oneline -3` should show `307f7af` at HEAD on `main`
2. Re-read this file: `docs/HANDOFF-current.md`
3. Proceed with PR #68 — Estimate detail page + quote creation from estimate
   - Key decision before building: should `estimates.status` advance to `quoted` when a quote is created, or only when the quote is sent? Recommend: `quoted` on quote creation (visible signal to team). Verify with Kevin if needed.
