# Base44-exact rebuild: Jobs + Calendar

Branch: `rebuild/base44-exact-jobs-calendar` (worktree `C:\dev\Premier-CRM-base44-jobs-calendar`)
Base commit: `63cc0e7f7e649c9b0776043d7e46859778ad859d` (PR #131 merged — job-crew-assignment backend)
This is the sixth slice of the Base44-exact rebuild program (after Customers; Properties + Team; Requests + Site Visits + Inspection; Estimates + Service Catalog + Quotes).

**Scope-honesty note, up front, matching the prior slice's standard:** given the size of this slice's task list (Job Detail, Job creation, job logs, job photos, crew management, Calendar with two view modes, and scheduling — six work streams in one pass), I did not fetch and diff every Base44 source file byte-for-byte before writing each component. I did fetch and read the load-bearing structural files (`JobDetailRoute.tsx`, `DetailRouteShell.tsx`, `RecordDetailView.tsx`, `jobDetails.ts` fixture, `contracts/jobs.ts`, `contracts/calendar.ts`, `JobsList.tsx`, `CalendarView.tsx`) to confirm Job Detail uses the generic `RecordDetailView` kit (already ported into this repo from a prior slice, at `apps/web/components/forge-shell/`) rather than a bespoke layout, and to get the real markup/layout/interaction shape for the Jobs list table and Calendar's Week/Month grids right. I did not fetch `ScheduleCreateForm.tsx`/`JobCreateForm.tsx`/`JobLogCreateForm.tsx`/`JobsRoute.tsx`/`EventDetailRoute.tsx` and instead reused this codebase's own already-real, already-working scheduling/log/photo forms and UI patterns (per the task's explicit instruction to reuse them, not duplicate them). Visual pixel-fidelity to Base44 is **not independently confirmed** by this pass — flagged for the verification pass, same as the prior slice's honesty standard.

## Routes moved

| Route | Old location | New location |
|---|---|---|
| `/jobs` | `(legacy)/jobs/page.tsx` | `(forge)/jobs/page.tsx` |
| `/jobs/[jobId]` | `(legacy)/jobs/[jobId]/page.tsx` | `(forge)/jobs/[jobId]/page.tsx` |
| `/jobs/new` | `(legacy)/jobs/new/page.tsx` | `(forge)/jobs/new/page.tsx` |
| `/calendar` | `(legacy)/calendar/page.tsx` | `(forge)/calendar/page.tsx` |

All `_components/`, `actions.ts`, and test files moved with `git mv` alongside `/jobs`. URLs and the `[jobId]` param name are unchanged. No cross-route-group relative-import fallout was found in either direction (grepped `apps/web` for `(legacy)/jobs`/`(legacy)/calendar` references before and after the move — only `branding.test.ts`'s hardcoded path string matched, fixed below).

## ForgeShell wiring

`jobs/page.tsx`, `jobs/[jobId]/page.tsx`, `jobs/new/page.tsx`, and `calendar/page.tsx` previously rendered inside `(legacy)/layout.tsx`'s `AppShell` (Jobs) or a bare `ForgePage`/`ForgeCard` wrapper with zero navigation chrome (Calendar — it already lived under a path that would have inherited nothing once route groups were introduced). New files, copied exactly from the established `requests`/`estimates` pattern (same `getActiveOrgContext` + user-profile lookup, same reused `signOutAction`/`switchActiveOrgAction`):

- `jobs/_lib/forge-shell-context.ts`, `jobs/_components/jobs-shell.tsx`
- `calendar/_lib/forge-shell-context.ts`, `calendar/_components/calendar-shell.tsx`

`route-groups.test.ts` moved `jobs`/`calendar` from `LEGACY_ROUTES` to `FORGE_ROUTES`, with new route-resolution and shell-chrome (`JobsShell`/`CalendarShell`) assertions. `branding.test.ts`'s Jobs page-title path updated to `(forge)/jobs/page.tsx`.

## Progress-source audit and decision (the single most important documented decision in this slice)

**Audit performed:** read `packages/db/queries/jobs.ts`'s `getJobById` (already selects and returns `job_phases` rows as `JobDetail.phases`), then queried the live `premier-crm-e2e` database directly:

```sql
select count(*) from job_phases;   -- 0
select count(*) from job_assignments; -- 0 (pre-population state at audit time)
```

and grepped the whole repository for any UI that creates, edits, or displays a phase as a progress source — the only consumer found is the existing Job Detail "Phase summary" card (moved unchanged in this slice, now annotated with the honest explanation below), which already renders "No phases are attached to this job yet" whenever the list is empty (i.e., always, today).

**Decision:** `job_phases` is real schema with a real, already-wired query path, but it is **empty and unused in practice** — no application code inserts a phase. Deriving a checklist/percentage from an always-empty table would fabricate progress via a technically-real-looking but practically-fictional division (0 of 0). Per the task's explicit instruction for exactly this finding, progress is instead derived from `job.status` (the real `job_status` lifecycle enum every job genuinely has), via `deriveJobProgress()` in `jobs/_lib/forge-jobs-view-model.ts`:

| Status | Stage bucket | Progress % |
|---|---|---|
| `lead` | on_hold | 0 |
| `site_visit_scheduled` | on_hold | 5 |
| `quoted` | on_hold | 10 |
| `approved` | scheduled | 20 |
| `scheduled` | scheduled | 35 |
| `in_progress` | in_progress | 65 |
| `on_hold` | on_hold | 65 |
| `completed` / `invoiced` / `paid` | completed | 100 |
| `cancelled` | on_hold | 0 |

This mapping is deterministic and status-only — two jobs in the same status always show identical progress (verified by a unit test), which is the honest ceiling of what a status-derived (not checklist-derived) bar can promise. The same function backs the Jobs list progress bar and Job Detail's `progress` section. The Job Detail "Phase summary" card was kept (moved unchanged) and now explicitly states phases exist but are unpopulated/unused, so a future slice that actually starts populating phases has an honest baseline to build "real checklist progress" from, rather than this decision being silently reversed without record.

## Job Detail

Ported onto the generic `RecordDetailView` kit (`apps/web/components/forge-shell/RecordDetailView.tsx`, already in this repo from an earlier slice — confirmed via `DetailRouteShell.tsx`/`JobDetailRoute.tsx` that Base44's own Job Detail uses this same generic kit, not a bespoke layout like the Site Visit Inspection wizard needed). New adapter: `jobs/_lib/forge-job-detail-view-model.ts` (`toJobDetailModel`), composed alongside the pre-existing real bespoke Cards for anything needing genuine interactive create/mutate controls — RecordDetailView's declarative section kinds (`fields`/`related`/`timeline`/`notes`/`media`/`progress`/`text`/`lines`) have no slot for those, matching PR #128's established precedent.

**Every currently-real capability from the pre-port `(legacy)/jobs/[jobId]/page.tsx` was audited and preserved** (per the PR #128 lesson): source-quote/estimate/request linkage, schedule form (`ScheduleJobForm`), scheduling-slot creation, quotes card + create-draft-quote, invoices card + create-invoice, deposit card (requirement/waive/deposit-invoice), working-invoice card + generate-final-invoice, change-orders card (draft/propose/withdraw), job logs form, job photos upload+gallery, phase summary, activity timeline, expenses link, financial snapshot. Nothing was silently dropped.

**Newly added via `RecordDetailView`:** identity/status header with context chips (customer/property/origin), summary tiles (stage/priority/scheduled/lead technician), the `progress` section (see above), a `schedule` fields section (scheduled/actual window, estimated duration, priority, service category, lead technician, assigned crew names, and property access notes/gate code/parking notes explicitly tagged `visibility: 'internal'` — the same "Internal only" pattern PR #127 established), a `related` section (customer/property/source), and an internal-only `ai-summary` text section when `job.ai_summary` is populated (real field, previously shown as a plain detail row).

**Honest gap, not fabricated:** `jobs.description` has no real customer-vs-staff visibility flag in the schema (verified — no such column exists), so the Scope section carries **no** `visibility` tag at all, rather than guessing "customer" (as Base44's fixture does) or inventing "internal." This is called out explicitly in the adapter's source comments and covered by a unit test.

## Crew management

New `jobs/_components/crew-section.tsx`, wired to exactly PR #131's `listJobAssignments`/`assignMemberToJob`/`removeMemberFromJob`/`setJobLead` via the existing `jobs/actions.ts` server actions (`listJobAssignmentsAction`/`assignJobCrewMemberAction`/`removeJobCrewMemberAction`/`setJobLeadAction`) — no second assignment model, no duplicated logic. Supports: zero-or-more assigned staff, add member (picker sourced from a new `listActiveTeamMembers` query, `packages/db/queries/team.ts` — extracted from the Team list page's existing inline `org_members`+`user_profiles`+`team_member_availability` join, not duplicated), remove member, set/change lead (visually distinguished with a "Lead" badge), member availability (reusing the real `team_member_availability.availability_status` value, formatted the same way `TEAM_AVAILABILITY_STATUSES`'s labels do), and a **real, not fabricated** conflict flag: a crew member whose own availability is `on_leave`/`off_shift` is flagged with an amber warning banner — there is no "is this person double-booked against another job" query anywhere in this codebase, and none was built here; that gap is documented below, not silently invented.

Mutation controls (`Assign`/`Make lead`/`Remove`) are hidden in the UI for roles without `canScheduleJobs`, matching the program's "UI hides, server re-checks, never the other way around" rule — the underlying RPCs independently re-verify the capability regardless of what the client sends.

## Job logs

Ported Base44's job-log concept onto the existing, unchanged `addJobLogAction` (writes to `activity_log`). Confirmed only 3 real event types exist: `job_note_general`/`job_note_material`/`job_note_safety` ("General note"/"Material note"/"Safety note"). Base44's broader suggested categories (work performed, time, materials, delay/blocker, safety, customer interaction) are **not** backed by distinct storage today — `ActivityLogEventType` in `packages/db/queries/activity-log.ts` is a plain string-literal union that could technically grow, but adding new literals with no distinct query/filter/reporting behavior behind them would be cosmetic-only fabrication, not a meaningfully distinct capability. Decision: kept the 3 real types, unchanged. **Job logs are internal-only, full stop** — `activity_log` has no visibility column at all (verified), so there is no customer-visible toggle to build or fake; the pre-existing form's "Staff-only — never shown to the customer" copy was already honest and is unchanged.

## Job photos

Reused the existing, unchanged `requestJobPhotoUploadAction`/`finalizeJobPhotoUploadAction` pipeline (`@/lib/site-visit-attachments`'s `finalizeSiteVisitUpload`) and the existing `AddJobPhotoForm`/photo-gallery presentation, moved unchanged into the ported page. Verified `vault_items`'s real schema (`supabase/migrations/0003_vault_and_comms.sql`): no visibility column exists distinguishing internal-vs-customer photos — so, same as job logs, no visibility toggle was fabricated; photos are effectively internal/staff-facing today via this pipeline, reported honestly rather than assumed otherwise.

## Calendar — data model decision

**Audit performed:** `grep -r calendar_event supabase/migrations/` returns nothing — no `calendar_events`-style table exists anywhere in the schema, confirmed directly rather than assumed. The pre-existing `(legacy)/calendar/page.tsx` already synthesized a flat 30-day list from `jobs.scheduled_start` (inline query) + `getTodaySiteVisits` (already range-generic despite its "Today" name — the legacy page already called it with a 30-day window, not just "today"). This synthesis genuinely supports Base44's Week/Month grid UI once given real date-range boundaries and crew context, so **no new events table was introduced.**

New additive query, `listJobsScheduledInRange` (`packages/db/queries/jobs.ts`), replaces the legacy page's inline ad-hoc query with a reusable, tested one that also joins customer/property/category (the inline version had none). `getTodaySiteVisits` is reused as-is with a computed range instead of a fixed 30-day window. New adapter `calendar/_lib/forge-calendar-view-model.ts` combines both into `CalendarEventModel[]`, enriched with real per-job lead technicians via the new `listJobLeadsForJobs` batched query (`packages/db/queries/job-assignments.ts`).

**View modes**: Base44's `CalendarView.tsx` implements both Week and Month grids (verified by reading the actual component, not assumed) — both are ported. Week is time-slotted (7am–7pm hourly rows); Month is a 6-week grid. Both support click-through to the real `/jobs/:id`/`/site-visits/:id` detail routes. Navigation (prev/next/today, Week/Month toggle) is real: it re-queries the server via `?start=YYYY-MM-DD&view=week|month` URL params, not client-side date math over a fixed fetch.

**"Schedule Work"**: routes to `/jobs/new`, this slice's real job-creation flow with its own real Schedule-and-crew step (below), rather than duplicating a second scheduling form embedded in Calendar — matching the task's explicit instruction to reuse `scheduleJobAction`/scheduling forms, not build a parallel mechanism.

**Conflict/warning presentation**: none added on Calendar. There is no real "is this job's crew double-booked against another job or site visit at the same time" query anywhere in this codebase, and deriving one honestly from `listMemberJobAssignments` + `site_visit_appointments` was assessed as out of scope for this pass's remaining time — documented as a gap below rather than fabricated.

**Known real gap in the site-visit event projection**: `site_visit_appointments` has no per-appointment crew field distinct from `site_visits.assigned_user_id`, and this slice's range query doesn't currently join that column — site-visit calendar events show `technician: 'Not assigned'` unconditionally today (a real gap, not a fabricated "Unassigned" that pretends to be derived from something). Job events *do* show a real lead technician.

## Job creation

Preserved the 4-step visual framing (progress bar, "Step X of 4" label) but consolidated the **functional** flow to two real steps given this pass's scope: **(1) Source** — the existing source-option cards, with corrected copy (see below) — and **(2) Job details, schedule & crew**, a single real form submission.

**Source options, corrected for honesty:**
- **From accepted quote** / **From customer request**: audited and found these are **already real, already-wired capabilities** — `createJobFromAcceptedQuote` (`packages/db/queries/job-lifecycle.ts`) is bound to a real "Create job" button on the Quote detail page (`quotes/_components/create-job-button.tsx`), and `createJobFromRequestAction` is bound to a real "Create job" button on the Request detail page (`requests/_components/create-job-button.tsx`). The pre-existing `/jobs/new` copy incorrectly implied "no dedicated real handoff action" exists for these — corrected to point at where the real action actually lives (open the quote/request itself), rather than either fabricating a duplicate button here or leaving the inaccurate claim in place.
- **From site visit**: audited — no direct site-visit-to-job path exists; a completed site visit flows to an estimate, then a quote, then "From accepted quote." Classified `backend-completion-required` if a direct shortcut is ever wanted.
- **Recurring service**: audited — grepped the schema for `recurring`/`schedule_rule` concepts; found only `properties.is_commercial_recurring` (a boolean flag with no scheduling logic behind it) and `recurring_templates_available` (a dead feature-toggle boolean, `default false`, unused). No real recurring-job-creation backend exists. Classified `backend-completion-required`, not built.
- **Manual job**: real, unchanged, now extended with the schedule/crew step below.

**Schedule and crew (new, real):** `createJobWithScheduleAction` (`jobs/actions.ts`) runs the job insert (identical to the pre-existing `createStandaloneJobAction`'s insert), then — only if a start time was supplied and the caller holds `canScheduleJobs` — calls the real `scheduleJob()`, then — only if crew members were selected — calls `assignMemberToJob()` once per selected member via the caller's own RLS-scoped session client (matching PR #131's established pattern for these RPCs, not the service-role pattern the job insert itself uses). **This is explicitly a real sequential multi-step server action, not a single atomic RPC** — no combined create-job-with-crew RPC exists, and building one would be a schema-adjacent change outside this slice's authorization (the task's own stop-condition). I did not build one and did not silently claim atomicity that doesn't exist: if a later step fails, the job (and any earlier steps) are **not** rolled back, and the returned `Result` communicates a `warning` string identifying exactly which step failed rather than a bare success/failure. This is flagged here per the task's instruction to stop and flag rather than build a fake combined RPC.

`CustomerPropertyWorkForm` (`apps/web/components/forms/customer-property-work-form.tsx`, shared by New Quote/New Job) gained a purely additive generic state-type parameter and an optional `extraFields` slot so the real `ScheduleCrewFields` component (`jobs/_components/schedule-crew-fields.tsx`) can inject real scheduled-start/end inputs and a real crew checklist (with a lead radio) into the same form submission — every other caller of this shared form is unaffected (verified by `pnpm typecheck`/`pnpm test` across the whole monorepo, not just this route).

## Scheduling

Job scheduling reuses the existing real `ScheduleJobForm`/`scheduleJobAction` unchanged on Job Detail (still gated by `canScheduleJobs`, still the shared `apply_job_scheduling` path the customer portal's slot-booking uses too) and now also via the new creation-time path above. Site visits were not touched — no parallel scheduling mechanism was built. No fabricated "internal block" calendar-entry type was added; Base44-style maintenance blocks have no backing schema concept here and are classified `backend-completion-required` below rather than faked.

## Permissions / RLS findings

No changes to `packages/shared/permissions.ts` or any existing action's authorization gating. `canScheduleJobs` continues to gate scheduling, crew assignment/removal/lead-setting (server-side, in the RPCs themselves — unchanged from PR #131), scheduling-slot creation, and job logs. `canCreateQuote`/`canManageDeposits`/`canCreateInvoices`/`canProposeChangeOrders` continue to gate their respective actions, unchanged. The new `createJobWithScheduleAction` re-checks `canScheduleJobs` before attempting the schedule/crew steps (mirroring, not replacing, the RPCs' own independent server-side checks) — a caller without the capability still gets a real (unscheduled, crew-less) job created, matching the honest "you can always do the part you're allowed to do" behavior rather than rejecting the whole submission. `job_assignments`' SELECT policy remains org-wide for any active member (read access to "who's assigned" is not gated behind `canScheduleJobs` — only mutation is), matching the crew section's own read-vs-write UI split.

## Gap table

| Item | Classification | Notes |
|---|---|---|
| `job_phases`-derived checklist/progress | Intentionally not built | Table is real but empty/unused (0 rows, no creating UI, verified against live `premier-crm-e2e`) — progress derived from `job.status` instead, documented above. |
| `jobs.description` customer-visibility flag | Intentionally not fabricated | No such column exists; Scope section carries no visibility tag. |
| Job log customer-visible toggle | Intentionally not fabricated | `activity_log` has no visibility column; all job logs are internal-only, honestly labeled. |
| Job photo customer-visible toggle | Intentionally not fabricated | `vault_items` has no visibility column for this purpose. |
| Crew conflict = real availability flag (`on_leave`/`off_shift`) | Found-real, correctly bound | Backed by real `team_member_availability.availability_status`. |
| Crew conflict = double-booking detection (same person, overlapping jobs/visits) | Backend-completion-required / deferred | No real query for this exists; an honest derivation from `listMemberJobAssignments` + `site_visit_appointments` is plausible but wasn't built this pass — flagged, not faked. |
| Calendar site-visit event technician | Found real gap, shown honestly | Shows "Not assigned" unconditionally — `site_visit_appointments` has no per-appointment crew field this range query currently joins. Job events do show a real lead. |
| Calendar `calendar_events` table | Not built, audited to confirm unnecessary | No such table exists in the schema; jobs+site-visits synthesis genuinely supports the Week/Month UI. |
| Job creation "From accepted quote" / "From customer request" | Found-real-correctly-bound elsewhere | Real capabilities exist (Quote/Request detail pages' own "Create job" buttons) — `/jobs/new`'s copy corrected to point at them rather than falsely implying no real path exists. |
| Job creation "From site visit" | Backend-completion-required | No direct site-visit-to-job path; only via estimate→quote→accept. |
| Job creation "Recurring service" | Backend-completion-required | No `recurring`/`schedule_rule` backend concept exists (verified: only a dead boolean toggle). |
| Atomic create-job-with-crew RPC | Explicitly not built (task stop-condition) | Sequential real writes implemented instead, with honest non-atomic `warning` reporting on partial failure — flagged per the task's own instruction, not silently decided. |
| Base44-style "internal calendar block" | Backend-completion-required | No backing schema concept; not faked. |
| Team Member Detail "assigned jobs" section | Explicitly out of this slice's route list | Real backend support now exists (`listMemberJobAssignments`, PR #131) — natural follow-up for a future slice, not wired here per the task's own scope note. |

## Testing

**Unit (`pnpm test`)**: re-run live during independent verification — 44 test files, 379 tests passing, all green. New: `jobs/_lib/forge-jobs-view-model.test.ts` (progress-source decision, origin derivation, row projection, missing-optional-data, filter counting), `jobs/_lib/forge-job-detail-view-model.test.ts` (progress-source decision, crew/lead projection, source-relationship resolution, missing-optional-data, internal-visibility tagging), `calendar/_lib/forge-calendar-view-model.test.ts` (week/month date math, job/site-visit projection, missing-optional-data, chronological ordering).

**Typecheck (`pnpm typecheck`)**: re-run live — clean across all 5 packages with a `typecheck` script (`apps/web`, `packages/ai`, `packages/automation`, `packages/db`, `packages/shared`).

**Build (`pnpm --filter web build`)**: succeeds. Route list confirms `/jobs`, `/jobs/[jobId]`, `/jobs/new`, `/calendar` all present exactly once, all server-rendered (`ƒ`), no middleware in the build output.

**E2E — executed live against `premier-crm-e2e` (`slbnizoskumwhleeiccv`), confirmed via `/api/e2e-health` before any test ran.** During independent verification, 4 real defects were found and fixed (1 product bug, 3 test-only bugs — see below), then all 22 tests in the two new specs (`jobs-base44-shell-bot.spec.ts`, `calendar-base44-shell-bot.spec.ts`) passed live, plus the 5 `today-kanban-board-semantics-bot.spec.ts` regression tests re-ran clean to confirm no cross-slice regression. Test-data residue check: the two new specs create no fixture data (navigation/assertion only — the "New job" test stops at the form, never submits), so no cleanup/residue risk.

Defects found and fixed during independent verification:
1. **Real product defect** — Jobs list desktop table horizontal overflow (481px at tablet-landscape 1024×768, 81px at desktop 1440×900). Root cause: the Job/Customer `<td>` cells had no word-break constraint and fixture data contains long unbroken tokens (e.g. `E2E_TEST_CUSTOMER_CRUD_1785726916701_ogazlg`) — the same recurring bug class as the Properties table (PR #126) and the Estimates/Quotes tables. Fixed with `max-w-0 break-words` on both cells in `jobs-list.tsx`.
2. Broken combined Playwright locator (`'tbody tr, [class*="rounded-xl"] >> text=JOB-'` resolved to 0 matches — Playwright's `>>` combinator chains across an entire comma-separated selector list, not per-branch). Fixed with `.or()`.
3. Strict-mode heading collision: non-exact `getByRole('heading', { name: 'Crew' })` matched both `RecordDetailView`'s "Schedule, crew & access" section heading and the Crew card's own heading — fixed with `exact: true` on 4 assertions.
4. A missing render-wait before a `.count()` check caused the crew "Assign" control test to skip even in isolation — fixed by adding the same heading-visibility wait the adjacent test already had.

## Visual evidence

Captured live during independent verification via a reproducible, uncommitted script (`scripts/capture-jobs-calendar-evidence.mjs`, not part of this branch) against the running dev server pointed at `premier-crm-e2e`. 9 viewport-cropped screenshots taken and visually confirmed correct: jobs list (desktop/mobile), job detail (desktop/mobile — confirms Progress/Schedule-crew-access/Crew/Job logs/Job photos sections all render with real data), job creation (desktop/mobile — confirms the honest source-option copy, including the "No recurring-service backend exists yet" gap note actually rendering in the UI), Calendar Week and Month views (desktop — confirm real job/site-visit events plotted with the Job/Site visit legend), and Calendar mobile. Shared directly with the requester; not committed to the branch.

## Known limitations / follow-ups

1. Base44 source files for the scheduling/log/photo forms specifically (`ScheduleCreateForm.tsx`, `JobCreateForm.tsx`, `JobLogCreateForm.tsx`) were not fetched/diffed — this slice reused the existing real Forge forms for those flows instead, per the task's explicit reuse instruction, rather than re-deriving Base44's exact form layout for capabilities that already work.
2. Calendar's site-visit events don't show a real technician (see gap table) — would need `site_visit_appointments`'s crew field (if any) joined into the range query, or `site_visits.assigned_user_id`.
3. No real double-booking/scheduling-conflict detection exists anywhere in this codebase yet (jobs, site visits, or crew) — flagged, not built, in both the crew section and Calendar.
4. `createJobWithScheduleAction`'s three-step sequence is not transactional — a rare partial-failure state (job created, schedule or one crew assignment failed) is reported via a `warning` string but the job itself is not rolled back. An atomic combined RPC would close this gap but requires a schema-adjacent change out of this slice's authorization.
5. Team Member Detail's "assigned jobs" section (real backend now exists via PR #131's `listMemberJobAssignments`) remains unwired — explicitly out of this slice's route list per the task, left for a future pass.
6. Jobs list and Calendar both do a batched `listJobLeadsForJobs`/per-range crew lookup rather than embedding crew via a single join — acceptable at this codebase's scale, but worth revisiting if job/event volume grows significantly.
7. Visual pixel-fidelity to the Base44 reference source was not independently diffed file-by-file for every component in this slice (see the scope-honesty note at the top) — the verification pass should treat this as unconfirmed, not assumed correct.

## Commits on this branch (in order)

1. `ff5af42` — Move Jobs and Calendar into `(forge)`, add ForgeShell chrome and route-group tests.
2. `c12049f` — db: additive query helpers for crew picker, per-job leads, and calendar range (`listActiveTeamMembers`, `listJobLeadsForJobs`, `listJobsScheduledInRange`).
3. `864a280` — Port Job Detail to `RecordDetailView` and add real crew management (progress-source decision, `crew-section.tsx`, unit tests).
4. `48d5e49` — Port Jobs list to Base44-exact table/card presentation (`jobs-list.tsx`, `jobs-list-container.tsx`, real lead technician + org-wide filter counts).
5. `2617eb1` — Job creation: real Schedule and crew step, honest source-option copy (`createJobWithScheduleAction`, `ScheduleCrewFields`, corrected `/jobs/new` source cards).
6. `445779e` — Port Calendar to Base44-exact Week/Month view over real jobs + site visits (`forge-calendar-view-model.ts`, `calendar-view.tsx`, `calendar-container.tsx`, unit tests).
7. `85f6860` — tests: new `jobs-base44-shell-bot.spec.ts`/`calendar-base44-shell-bot.spec.ts` E2E specs, `selectors.ts` route addition.
8. `3d75298` — Folded in a `jobs/_lib/forge-shell-context.ts` file and the `route-groups.test.ts`/`branding.test.ts` edits that a faulty multi-pathspec `git add` had silently left out of commit 1 (caught before hand-off; working tree was clean and all tests/typecheck/build were green with these changes present throughout — only the commit boundary was affected, not the actual delivered state).
