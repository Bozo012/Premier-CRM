# Today Kanban board semantics — root cause and fix

Branch: `fix/today-kanban-board-semantics` (worktree `C:\dev\Premier-CRM-today-kanban-fix`)
Base commit: `45bc2a4e56c15e5173f2cd77d3ed547f8206eb8f` (PR #129 merged)

## Reported defect

A site visit ("Kitchen remodel," Aug 10 6:35 PM appointment, status `in_progress`, 0/14 inspection fields filled) was invisible on the Today Kanban board (Scheduled/In Progress/On Hold all showed 0) despite genuinely being active, in-progress work.

## Root causes confirmed

**Cause 1 — the board reused the Today schedule's strict date filter.** `TodayPage` fetched `getTodaySiteVisits()` (and an inline jobs query filtered to `scheduled_start` between midnight and midnight) and passed the **same** result to both `buildTodaySchedule()` and `buildKanbanCards()`. `getTodaySiteVisits()` explicitly filters `scheduled_start >= startOfDay AND < endOfDay` — correct for "what does my day look like," wrong for "what work is currently active," since an appointment two days out is excluded even if the underlying inspection is already running.

**Cause 2 — every site-visit card was hard-coded to `stage: 'scheduled'`.** `buildKanbanCards()` never received or evaluated `site_visits.status` at all — `getTodaySiteVisits()`'s select list didn't even fetch it. Confirmed by tracing `start_site_visit()` (`supabase/migrations/20260802020200_site_visit_lifecycle_rpcs.sql`): it updates `site_visits.status` to `'in_progress'` but **never touches `site_visit_appointments.status`**, which stays `'scheduled'` for the entire duration of an in-progress inspection. The appointment's own status therefore cannot distinguish "not started" from "in progress" — only `site_visits.status` (the real lifecycle field) can.

## Authoritative stage mapping

**Site visits** (`site_visit_status` enum, `20260802010200_site_visit_status_and_table.sql`): `awaiting_scheduling | scheduled | in_progress | completed | cancelled`. No on-hold concept exists for site visits — the board never fabricates one. Board mapping: `scheduled → Scheduled`, `in_progress → In Progress`, `completed → Completed`; `awaiting_scheduling` (no appointment yet, nothing to place on a schedule-based board) and `cancelled` are excluded before reaching the view-model.

**Jobs** (`job_status` enum, `0002_crm_core.sql`): `lead, site_visit_scheduled, quoted, approved, scheduled, in_progress, completed, invoiced, paid, cancelled, on_hold`. Board mapping (unchanged from the pre-existing `normalizeJobStage`, which was already correct — jobs' only defect was Cause 1, the date filter, not stage mapping): `scheduled → Scheduled`, `in_progress → In Progress`, `on_hold → On Hold`, `completed/invoiced/paid → Completed`; earlier pre-execution statuses (`lead`, `site_visit_scheduled`, `quoted`, `approved`) and `cancelled` are excluded.

## Board time-horizon decision

No existing repository decision was found for this exact question (checked `docs/ux/forge-v1.1-ux-modernization-plan.md`, the only doc mentioning "board"). Adopted the task's own documented default:

- **Scheduled**: today through the next 7 days (`BOARD_SCHEDULED_HORIZON_DAYS = 7`, `today/_lib/view-model.ts`). A record with **no** scheduled_start at all counts as within-horizon (absence of a date is not evidence it's far away — hiding it would recreate the exact defect class this fix addresses).
- **In Progress**: every in-progress job/site visit, regardless of when it started.
- **On Hold**: every on-hold job (site visits have no on-hold state).
- **Completed**: completed today. Site visits use the real `completed_at` timestamp (set by `complete_site_visit()`). Jobs have no populated completion timestamp — `jobs.closed_at` exists in the schema but is dead (confirmed by a repository-wide grep: no application code anywhere sets it) — so `updated_at` is used as an honest proxy, documented as such rather than silently treated as precise.

The horizon cut is applied in the view-model (`buildKanbanCards`, pure and unit-tested with an injectable `now`), not in SQL — the query layer fetches every currently-relevant record and lets the presentation-adjacent "how far ahead is too far" decision stay a testable, adjustable constant rather than being baked into a query string.

## Query changes

`packages/db/queries/today-actions.ts` — two new functions, `getTodaySiteVisits()` and the inline today-jobs query left **completely untouched** (still feed `buildTodaySchedule` only):

- **`getBoardSiteVisits(client, { orgId, completedSince })`** — queries `site_visits` (not `site_visit_appointments`) as the primary table, selecting the real `status` and `completed_at`, joined to `service_requests` for `service_title`/`contact_name`/`property_address`. A separate query fetches each visit's currently-active (`status='scheduled'`) appointment for `scheduled_start` display — the same two-query shape `listSiteVisits()` already uses (`packages/db/queries/site-visits.ts`), needed because `complete_site_visit()` flips the appointment's own status to `'completed'` too, so a completed visit has no `'scheduled'`-status appointment left to join against (its `completed_at` is what the board shows instead).
- **`getBoardJobs(client, { orgId, completedSince })`** — the same fix for jobs, extracted from `page.tsx`'s previous inline query (which only ever fetched today's `scheduled_start`) into a proper query-layer function, per the repo's own "DB query → packages/db/queries" convention.

Both DB-side filters are a single, simple `.or('status.in.(...),and(status.eq.completed,completedSince.gte...))')` — deliberately not a fully precise multi-branch filter; the `awaiting_scheduling`/`cancelled` exclusion and the scheduled-horizon cut both happen in TypeScript, matching this codebase's stated preference for simple, explicit multi-step queries over complex encoded filter strings.

## View-model changes

`apps/web/app/(app)/(legacy)/today/_lib/view-model.ts`:

- `buildKanbanCards(jobs: BoardJob[], siteVisits: BoardSiteVisit[], now: Date = new Date())` — real stage mapping (`job.status`/`visit.status` used directly, no more hard-coded `'scheduled'`), plus the horizon filter for the `scheduled` bucket only. `now` is an injectable parameter specifically so the horizon cut is deterministically unit-testable.
- `buildTodaySchedule` is **unchanged** — still takes the strictly-today-scoped datasets, still produces "what's on my schedule today."
- Site-visit cards now show the real `service_title` ("Kitchen remodel") instead of the previous `"${contactName} visit"` fallback.
- Completed-visit cards show `completedAt`, not the (now-superseded) original `scheduledStart`.

`page.tsx` fetches both the existing today-scoped datasets (for the schedule) and the two new board datasets (for the board) in the same `Promise.all`, and passes each to the correct builder — the split the task asked for.

## Tests

**Unit** (`view-model.test.ts`, 10 new cases): job/visit stage mapping for every real status, horizon-boundary inclusion/exclusion (within 7 days vs. beyond), in-progress/on-hold records ignoring the date filter entirely, completed-visit time-label sourcing from `completedAt`, real service-title rendering, and customer/property placeholder fallbacks.

**E2E** (`tests/e2e/today-kanban-board-semantics-bot.spec.ts`, new, 5 tests, run live against `premier-crm-e2e`):

1. An in-progress site visit with a future (2-days-out) appointment appears under **In Progress**, not Scheduled, with its real title — the exact reported defect.
2. A same-day scheduled site visit appears under **Scheduled**.
3. A completed site visit lands in **Completed**; a cancelled visit appears nowhere on the board.
4. An in-progress job started 5 days ago, and an on-hold job with no `scheduled_start` at all, both remain visible.
5. The Today schedule (not the board) remains strictly today-only — a visit scheduled 2 days out never appears there, confirming the split didn't regress the schedule.

## E2E results (live, `premier-crm-e2e`)

- `today-kanban-board-semantics-bot` (new): **5/5**
- `today-redesign-bot` (regression): **13/13**
- `site-visits-base44-shell-bot` (regression): **9/9**
- `request-site-visit-workflow-bot` (business-critical triage/lifecycle regression): **20/20**
- `estimates-lifecycle-bot` (regression, touches job creation/status): **1/1**
- Zero test-data residue confirmed via direct SQL query after every run.

## Regression gates

`pnpm test`: 331 passing (321 + 10 new). `pnpm typecheck`: clean across all 5 workspace projects. `pnpm --filter web build`: clean, no new routes. ESLint on every changed file: clean.

## Manual live verification

Reproduced the exact reported scenario against `premier-crm-e2e`: created a site visit titled "Kitchen remodel," scheduled 2 days in the future, started via the real `start_site_visit` RPC. Screenshot confirms it renders under **In Progress** with the correct title — shared directly with the reviewer, not committed.

## Known limitations

1. Jobs' "completed today" window uses `updated_at` as a proxy (no populated completion timestamp exists in the schema — `closed_at` is dead). If a job's `updated_at` changes for a reason unrelated to completion (e.g., a title edit) shortly after actually completing, the completed-window boundary could be marginally imprecise. Adding a real `completed_at` column (mirroring site_visits') would resolve this cleanly but is a schema change, out of scope for a "smallest coherent correction" bugfix — flagged for a future slice if it proves to matter in practice.
2. The 7-day scheduled-horizon and "completed today" window are both the task's own documented defaults, not a rediscovered pre-existing product decision — worth confirming with product ownership if the real-world board turns out too sparse or too noisy in practice.
