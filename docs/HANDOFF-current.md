# SESSION HANDOFF

## Current branch

`main`
At commit `f2701e1`. Branch is up to date with origin. Working tree clean. No open PRs.

---

## Current PR status

All PRs from this session are merged. No open PRs.

---

## What was completed this session

### Planning pass — Requests → Estimates → Quotes → Jobs

Before implementing, a full planning pass was done covering:

- Inspected all routes, DB query files, API handlers, migrations, and types
- Discovered that `service_requests` table is defined in migration `0012_service_requests_and_customer_accounts.sql` but **has never been applied** to the live DB (not present in `types.ts`; `0017` only grants on `tasks` and `customers`)
- Discovered that both public intake routes (`/api/v1/quote-requests` and `/api/v1/service-requests`) currently write to `tasks`, not `service_requests`
- Identified that `createServiceRequest` query function is dead code (never called from any route)
- Identified that there are **two files with the `0012_` prefix** — a naming collision that needs resolution before any schema work
- Defined the intended operational backbone: **Website Request → Requests → Estimate → Quote → Job**
- Produced a full 6-PR sequence (#58–#63) covering requests inbox, request detail + convert-to-job, estimates view on jobs, migration fix, and inbox switch to `service_requests`

### PR #56 — Quote metadata editing (merged earlier)
Already in main from a prior session.

### PR #57 — Accepted quote → job handoff (merged earlier)
Already in main from a prior session.

### PR #58 — Requests inbox at `/requests` (merged this session)

Delivered:
- **`packages/db/queries/requests.ts`**: `listRequests` query — reads `tasks` filtered by `title ILIKE 'Quote request from%'`, joins customer summary (name, email, phone), supports `showDone` flag for open/reviewed/all views
- **`apps/web/app/(app)/requests/page.tsx`**: Server-rendered Requests inbox with Open / Reviewed / All filter tabs, status + priority badges, customer contact summary, extracted service type line, "Job created" badge when `task.job_id` is set, empty state explaining the website form feeds this queue
- **`apps/web/components/navigation/app-bottom-nav.tsx`**: Requests replaces Properties in the bottom nav

Bottom nav is now: **Today | Jobs | Quotes | Customers | Requests**
Properties remains accessible at `/properties` and from customer detail pages.

---

## What is merged (this session's PRs)

| PR | Title | Status |
|---|---|---|
| #58 | feat(requests): intake inbox at /requests | MERGED |
| #57 | feat(quotes): accepted quote → approve job handoff | MERGED (prior session) |
| #56 | feat(crm): quote metadata editing for draft quotes | MERGED (prior session) |

---

## What is open

Nothing. All branches pushed and merged. No open PRs.

---

## Repo sync state

- `main`: at commit `f2701e1` (PR #58 merge)
- Working tree: clean
- No uncommitted changes anywhere
- No open PRs

---

## Current product-direction decisions

### Operational backbone
**Website Request → Requests → Estimate → Quote → Job**

This is the approved product direction. Each stage is operationally distinct.

### Stage definitions
- **Requests**: Inbound intake queue. Currently backed by `tasks` table (website form → `/api/v1/service-requests` → `createQuoteRequest` → `tasks`). UI now exists at `/requests`.
- **Estimates**: Internal scoping workspace. Currently no dedicated route. Pragmatic interim model: Jobs with `status='lead'` are the estimate stage. No new table needed yet.
- **Quotes**: Customer-facing commercial document. Fully built (PRs #47–#57). Draft → sent → viewed → accepted/declined/expired/revised.
- **Jobs**: Execution workspace. Fully built. Status enum includes `lead`, `site_visit_scheduled`, `quoted`, `approved`, `scheduled`, `in_progress`, `completed`, `invoiced`, `paid`, `cancelled`, `on_hold`.

### Estimates model (approved interim approach)
Jobs with `status='lead'` serve as the Estimate stage. No new `estimates` table for now. Creating a draft Quote on a lead-status job = creating an estimate. The AI estimator, when it arrives, is the trigger to evaluate whether a dedicated `estimates` table is required.

### `service_requests` table
Migration `0012_service_requests_and_customer_accounts.sql` exists but was **never applied**. Current intake writes to `tasks`. Plan is to apply this migration in a dedicated PR (#61) after the requests UI is proven. Do not attempt to apply it as a side effect of other PRs.

### Navigation model (final for now)
Bottom nav: **Today | Jobs | Quotes | Customers | Requests** (5 slots)
- Properties: accessible at `/properties` and from customer detail
- Services: accessible at `/services`
- Requests: daily-workflow entry point, slot 5

---

## Exact next PR

**PR #59 — Request detail page + "Convert to job" action**

Goal: Let Kevin open a single request, see all its details, and convert it into a lead-status Job in one click.

Fields to show on `/requests/[taskId]`:
- Full task title and structured description block (contact info, service, timeline, description, photos if any)
- Customer context card: name, email, phone (linked to `/customers/[id]`)
- Property context if `task.property_id` is set
- Status + priority badges
- "Convert to job" button (if not already converted — check `task.job_id`)
- "Open job" link if `task.job_id` is set
- Back link to `/requests`

"Convert to job" action:
- Creates a `jobs` row: `status='lead'`, `customer_id` and `property_id` from the task, `title` derived from task title (strip "Quote request from " prefix, use service if available), `org_id` from session
- Sets `tasks.job_id = new_job_id` (to mark as converted and link back)
- Navigates to `/jobs/[newJobId]`
- Revalidates `/requests/[taskId]` and `/requests`

No schema changes needed. `tasks.job_id` and `jobs.status='lead'` already exist.

Files expected:
- `apps/web/app/(app)/requests/[taskId]/page.tsx` (new)
- `apps/web/app/(app)/requests/actions.ts` (new — `convertRequestToJobAction`)
- `packages/db/queries/requests.ts` (add `getRequestById`)
- `packages/db/queries/index.ts` (export `getRequestById`)
- `packages/db/index.ts` (export `getRequestById`)

---

## Risks / blockers

### 1. `0012_` naming collision in migrations
`0012_drop_pending_approval.sql` and `0012_service_requests_and_customer_accounts.sql` both use the same prefix. Supabase migration runners treat prefix as ordering key — this collision is a latent bug. Before PR #61 (schema fix), confirm which file was applied and rename the other. Do not attempt to resolve as a side effect of PR #59 or #60.

### 2. `quotes.job_id NOT NULL` constraint
Every quote requires an existing job. The PR #59 "convert to job" flow creates the job first (from a request) and then a quote can be attached. This satisfies the constraint without schema changes. But if a future flow needs "create estimate with no job at all" (e.g., rough phone quote), this constraint must be relaxed (migration needed). Flag and confirm before attempting.

### 3. `createServiceRequest` is dead code
The function in `packages/db/queries/service-requests.ts` writes to the non-existent `service_requests` table and is never called. The `/api/v1/service-requests` route calls `createQuoteRequest` instead. This will be resolved in PR #61 when the migration is applied. Until then, leave it as-is — do not delete or wire it up without the migration.

### 4. `/requests` only shows tasks, not all request types
Currently the `listRequests` query filters by `title ILIKE 'Quote request from%'`. This means manually-created tasks, SMS leads, and phone inquiries are not visible. That's correct for now — the scope is website leads only. When `service_requests` table goes live (PR #62), the inbox switches to the richer model.

### 5. No mutation actions on `/requests` yet
The inbox is read-only. Kevin can see requests but cannot mark them done, snooze, or convert from the list. That is intentional for PR #58 — those actions land in PR #59 (detail page + convert action).

---

## Resume instructions for next session

1. Confirm repo state: `git status` should be clean on `main` at `f2701e1`
2. Re-read this file: `docs/HANDOFF-current.md`
3. Re-read `apps/web/app/(app)/requests/page.tsx` to understand what exists before adding the detail page
4. Re-read `packages/db/queries/requests.ts` to understand the current query shape before extending it
5. Re-read `packages/db/queries/jobs.ts` to understand job creation pattern before writing `convertRequestToJobAction`
6. Create branch: `git checkout -b feature/request-detail-convert-to-job`
7. Implement PR #59 per the "Exact next PR" spec above
8. Required checks: `pnpm --filter web exec tsc --noEmit` + `pnpm --filter web build`
9. Commit, push, open PR, evaluate merge rules, merge if qualified
