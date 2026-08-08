# Job crew assignment model — audit, design, and query/action layer

Branch: `design/job-crew-assignment-model` (worktree `C:\dev\Premier-CRM-job-crew-model`)
Base commit: `45bc2a4e56c15e5173f2cd77d3ed547f8206eb8f` (PR #129 merged — Estimates + Service Catalog + Quotes)

**Output: SMALL ADDITIVE MODEL REQUIRED — READY FOR REVIEW.**

## Current assignment architecture — audit findings

Read every migration and query file touching jobs, site visits, team, org membership, availability, and scheduling before proposing anything.

| Structure | What it actually represents | Job-scoped? | Multi-person? | Lead concept? |
|---|---|---|---|---|
| `jobs` (`0002_crm_core.sql`) | The job record itself. **No assignee/crew/technician column of any kind** — only `created_by` (the creator, not necessarily who's doing the work). | — | — | — |
| `site_visit_appointments.assigned_user_id` (`20260802010300_site_visit_appointments.sql`) | A single, nullable assignee on a site-visit *appointment* — an inspection/estimate visit, not the job itself. | No — site-visit-scoped | No — single column | No |
| `team_member_availability` (`20260805084201_team_availability_model.sql`) | A staff member's current status (available/on_job/off_shift/on_leave) + skills tags. Not linked to any specific job. | No | N/A | N/A |
| `tasks` (`0003_vault_and_comms.sql`) `.assigned_to` | Generic internal to-do assignment (single `auth.users` FK), unrelated to field-work crew — a different product concept entirely. | No | No | No |
| `scheduling_slots` / `scheduling_slot_bookings` (`packages/db/queries/scheduling.ts`) | Customer-portal self-service capacity booking (time-slot + booking count), not staff assignment. | No | N/A | N/A |
| `org_members` (`0001_init.sql`) | The authoritative org-membership + role identity table (`org_id, user_id, role, status`). This is the correct FK target for any new assignment table — already used this way by `team_member_availability`'s composite FK. | — | — | — |
| Calendar (`(legacy)/calendar/page.tsx`) | No dedicated events table at all — a simple synthesized "next N days" list read directly from `jobs.scheduled_start/end` + `getTodaySiteVisits()`. No crew/assignee data shown because none exists to show. | — | — | — |
| Team Member Detail (`forge-team-detail-view-model.ts`) | Already shows "assigned site visits" (from `site_visit_appointments.assigned_user_id`) with an existing code comment flagging the exact gap this task closes: *"first-class job-crew assignment (real source is site-visit...)"*. | — | — | — |
| `activity_log` (`20260731010000_activity_log.sql`) | Generic, reusable `entity_type`/`entity_id` event log — explicitly designed to be reused by new entity types (its own doc comment: *"jobs, invoices, etc. can reuse it later"*) without a migration. Used for auditability below, no new audit table needed. | — | — | — |
| `role_has_capability()` / `packages/shared/permissions.ts` (`20260802020000_capability_matrix.sql`) | The canonical, reviewed capability matrix — both a SQL function and a TS map kept in parity by an automated test. `canScheduleJobs` (`owner`, `admin`, `employee`, `subcontractor`) already gates `apply_job_scheduling` and is the closest existing match for "who may change who's doing a job." | — | — | — |

**Conclusion: nothing in the current schema represents job-level, multi-person crew assignment.** The closest analog (`site_visit_appointments.assigned_user_id`) is single-person and scoped to a different entity (a site-visit appointment, not a job) — reusing or extending it would conflate two distinct concepts (who inspected/estimated vs. who's doing the actual job). `tasks.assigned_to` is a different product domain (ad-hoc internal to-dos) entirely. No option A or B candidate survives the evaluation below.

## Options evaluated

| | A. Reuse `jobs` field | B. Extend `site_visit_appointments` | C. Dedicated `job_assignments` table | D. Other |
|---|---|---|---|---|
| Exists today | No such field | Exists, but wrong entity/cardinality | — | — |
| Multi-person crew | Would need array/JSON hack | No — single-assignee by design | Yes — natively | — |
| Lead role | Would need a second field | No natural fit | Yes — `is_lead` + partial unique index | — |
| Org isolation | Trivial (already org-scoped) | Trivial | Composite FK to `org_members(org_id, user_id)` — structurally enforced, not just checked | — |
| RLS complexity | Low, but semantically wrong | Low, but semantically wrong | Low — matches two already-shipped, reviewed precedents exactly | — |
| Query complexity | Simple but limited | Simple but limited | One join table, standard pattern | — |
| Migration risk | N/A (no migration, but wrong model) | Alters a table with an active uniqueness/history invariant (`site_visit_appointments_one_active_per_visit`) — risky to overload | New table only, fully additive, zero risk to existing tables | — |
| Compatible with Jobs | No | No — wrong entity | Yes | — |
| Compatible with Calendar | No | Partial (site-visit-only) | Yes — job-level, exactly what Calendar needs | — |
| Team Member Detail | No | Already wired, but mislabeled as job info | Yes — new `listMemberJobAssignments` | — |
| Route planning | No | No | Yes — job + assigned staff is the actual routing unit | — |
| Audit/history | No | No | Yes — every mutation writes to the existing `activity_log` | — |

Option D (something else found in the repo) was considered — no other candidate exists; the audit table above is exhaustive for every field/table/function search term the task specified (assigned employee, lead technician, crew, technician, owner, job assignment, scheduled staff, visit assignment, event assignee).

**Chosen: Option C, the smallest mature version of it** — one new table, no destructive changes, reusing every available existing pattern (composite-FK-to-`org_members` from `team_member_availability`, partial-unique-index-for-"at most one" from `site_visit_appointments`, SECURITY DEFINER RPC + `get_actor_org_role`/`role_has_capability` from `site_visit_lifecycle_rpcs.sql`, `activity_log` reuse instead of a new audit table).

## Schema (proposed, NOT applied)

`supabase/migrations/20260808000000_job_assignments_model.sql` — full text in the repo, summarized here:

```sql
create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_lead boolean not null default false,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id),
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create unique index job_assignments_one_lead_per_job on public.job_assignments (job_id) where is_lead = true;
create index job_assignments_org_job_idx on public.job_assignments (org_id, job_id);
create index job_assignments_user_idx on public.job_assignments (user_id);
```

No speculative fields (no GPS, no live location, no dispatch-optimization fields, no `role`/`assignment_role` beyond the required `is_lead` boolean — the task only asked for a lead concept, not a richer crew-role taxonomy, so none was added).

## RLS

- `authenticated` gets `SELECT` only, gated by `user_is_in_org(org_id)` — matches `jobs_select_org_members`/`activity_log`'s own SELECT policy exactly. Viewing crew is not privileged.
- **No INSERT/UPDATE/DELETE grant or policy for `authenticated` at all.** Every mutation goes through one of three `SECURITY DEFINER` RPCs, each independently re-deriving `org_id` from the job row (never trusting a caller-supplied org_id, matching `schedule_site_visit`'s pattern) and re-checking `role_has_capability(get_actor_org_role(job.org_id), 'canScheduleJobs')`.
- This deliberately follows the **more recent, more hardened** pattern (`20260803070000_harden_jobs_and_quote_creation_boundary.sql`'s "hiding the button is not sufficient, the base table must not be directly writable either") rather than `team_member_availability`'s slightly older direct-RLS-write pattern — chosen because `job_assignments` needs the same atomicity (clearing an old lead + setting a new one in one step) and auditability (`activity_log` writes) that only a function boundary can give cleanly; `activity_log` itself has no authenticated INSERT policy, so a direct-RLS-write table could never also log to it.

## Permissions

- **View job crew**: any active org member — no capability check, matches how job/activity data is already readable org-wide.
- **Assign / unassign / set lead**: `canScheduleJobs` — an **existing** capability (`owner`, `admin`, `employee`, `subcontractor`), already governing `apply_job_scheduling`. No new capability was invented; assigning who's doing a job is the same class of decision as scheduling when it happens. `viewer` never gets any of the three mutation RPCs, matching the codebase-wide rule that `viewer` gets no write capability of any kind.
- Employees do **not** gain owner/admin power by being able to view or (per the existing capability matrix) assign crew — `canScheduleJobs` already includes employee today for job scheduling generally; this task did not widen that boundary, it reused it exactly as already defined.

## Query/action contract

`packages/db/queries/job-assignments.ts` (new):

| Function | Purpose |
|---|---|
| `listJobAssignments(client, { orgId, jobId })` | Every crew member on a job, with display name (joined to `user_profiles`). |
| `listMemberJobAssignments(client, { orgId, userId })` | Every job a member is assigned to, with job title/status/number — feeds a future Team Member Detail "assigned jobs" section. |
| `assignMemberToJob(client, { jobId, userId, isLead? })` | Calls `assign_member_to_job`. |
| `removeMemberFromJob(client, { jobId, userId })` | Calls `remove_member_from_job`. |
| `setJobLead(client, { jobId, userId })` | Calls `set_job_lead`. |

`apps/web/app/(app)/(legacy)/jobs/actions.ts` (extended): `listJobAssignmentsAction`, `assignJobCrewMemberAction`, `removeJobCrewMemberAction`, `setJobLeadAction` — each re-checks `hasCapability(role, 'canScheduleJobs')` as a UX mirror before calling the query layer (the RPCs are the real authority), following the exact `scheduleJobAction`/`getJobActionContext` pattern already in that file. All mutations use the caller's own RLS-scoped session client (`getServerSupabase()`), not the service client — the RPCs derive the actor from `auth.uid()` internally, matching `scheduleSiteVisitAction`'s pattern rather than `scheduleJobAction`'s older service-role + explicit-actor-param pattern.

**Temporary typing note**: since the migration is not yet applied, `packages/db/types.ts` (generated via `pnpm db:types`) has no knowledge of `job_assignments` or the three RPCs. Every call site is narrowly cast past `DbClient`'s strict generated typing, documented inline in both `job-assignments.ts` and the E2E spec. This is a one-time, self-cleaning debt: once the migration is applied and `pnpm db:types` re-run, the casts and the hand-written `JobAssignmentRow` interface should be deleted and replaced with the generated `Database['public']['Tables']['job_assignments']['Row']` type — flagged as the first thing to do in the follow-up that applies this migration.

## Tests

`tests/e2e/job-assignments-model-bot.spec.ts` (new, written + typechecked, **not executed** — no live migration to run it against yet). Follows `request-site-visit-workflow-bot.spec.ts`'s exact fixture pattern (real signed-in sessions via the Admin API, never service-role for the actions under test, a second org for cross-org isolation, full teardown). Covers:

1. Owner assigns a crew member — real row created, `activity_log` entry written.
2. Employee can read crew assignments; **also** can assign (this codebase's `canScheduleJobs` genuinely includes employee — documented in-test as the reason a "negative" employee-assignment case doesn't exist; the actual authorization boundary this table adds beyond capability is org membership, proven in test 3).
3. Cross-org assignment blocked (org2 owner cannot touch an org1 job).
4. Duplicate assignment prevented (unique constraint surfaces as an RPC error).
5. A second crew member can be assigned — multi-person crew proven.
6. Only one lead per job — `set_job_lead` atomically clears the previous lead.
7. `set_job_lead` rejects a user not yet assigned to the job.
8. Unassignment removes the row (and any lead flag with it).
9. Unassigning someone not on the job fails cleanly.
10. Deleting a job cascades to its assignments (`ON DELETE CASCADE` on `job_id`).
11. Removing someone from `org_members` cascades to their job assignments (`ON DELETE CASCADE` via the composite FK).

Team Member Detail / Job Detail **UI projection** testing is deliberately deferred — no new presentation was built this pass (see below), so there's nothing at the UI layer to test yet; the query functions that will feed those projections (`listJobAssignments`, `listMemberJobAssignments`) are exercised indirectly by tests 1–11 reading the same table those functions read from.

## What was deliberately NOT done in this pass

- **Migration not applied.** Designed and (self-)reviewed; application to `premier-crm-e2e` is a separate, explicitly-authorized next step, per the task's instruction.
- **No new presentation.** Team Member Detail's "assigned jobs" section, Job Detail's crew display, and any Calendar/route-planning UI are all future work — this pass proves the backend contract only, per the task's explicit instruction ("expose no new presentation yet beyond what is needed to prove the backend contract").
- **No dispatch optimization, no GPS/live-location tracking** — explicitly out of scope per the task.
- **No new capability** — `canScheduleJobs` reused as-is; the SQL/TS capability-parity test needed no changes since nothing was added to either side of that matrix.

## Verification performed this pass

- `pnpm typecheck` — clean across all 5 workspace projects.
- `pnpm test` — 321 passing (no new unit tests: the query layer is thin RPC/table wrappers with no pure logic to unit-test in isolation, matching `scheduling.ts`'s own precedent).
- `pnpm --filter web build` — clean; no new routes (no presentation added).
- ESLint on every changed/new file — clean (one documented, intentional `any` in the E2E spec's temporary type-escape helper).
- `npx tsc --noEmit -p tests/e2e/tsconfig.json` — the new spec produces zero errors.
- Migration SQL was read back in full and cross-checked line-by-line against the two precedents it's modeled on (`team_member_availability`'s composite FK, `site_visit_appointments`'s partial unique index, `site_visit_lifecycle_rpcs.sql`'s RPC/auth pattern) — not executed against any database.

## Exact blockers to proceeding further

None for this pass's own scope (audit/design/query-action-layer). To actually use this in production:

1. **Migration application** — needs the same audit-then-apply protocol this program has used for every prior migration gap (confirm target project, confirm non-destructive, apply via the Supabase MCP `apply_migration` tool, scoped to `premier-crm-e2e` first, `pnpm db:types` regenerated, casts removed, then a separate authorized step for production).
2. **Live E2E execution** — `job-assignments-model-bot.spec.ts` needs a live `premier-crm-e2e` with the migration applied.
3. **Presentation** — a genuinely separate, future slice (Team Member Detail's assigned-jobs section, Job Detail's crew display, Calendar/route-planning UI) — no blocker, just explicitly out of this pass's scope.
