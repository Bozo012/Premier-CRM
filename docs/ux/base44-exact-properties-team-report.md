# Base44-exact rebuild — Properties & Team (second slice)

- **Branch:** `rebuild/base44-exact-properties-team`
- **Premier base SHA:** `a262cfd295627e4165efffdc00aebd117b0b5b9e` (PR #125, merged — Base44-exact shell architecture via Customers)
- **Base44 reference SHA:** `497d0693cccafd89315ec17c3be9885cfaae5c84` (`C:\dev\Forge-Base44-UX`, read-only reference)
- **Scope:** `/properties`, `/properties/:propertyId`, `/team`, `/team/:memberId` (new)

## Routes moved

`git mv` only in the first commit, no behavior change:

| From | To |
|---|---|
| `apps/web/app/(app)/(legacy)/properties/page.tsx` | `apps/web/app/(app)/(forge)/properties/page.tsx` |
| `apps/web/app/(app)/(legacy)/properties/[propertyId]/page.tsx` | `apps/web/app/(app)/(forge)/properties/[propertyId]/page.tsx` |
| `apps/web/app/(app)/(legacy)/team/page.tsx` | `apps/web/app/(app)/(forge)/team/page.tsx` |
| `apps/web/app/(app)/(legacy)/team/actions.ts` | `apps/web/app/(app)/(forge)/team/actions.ts` |
| `apps/web/app/(app)/(legacy)/team/_components/*` | `apps/web/app/(app)/(forge)/team/_components/*` |

URLs unchanged (route groups are stripped from the URL). `apps/web/lib/branding.test.ts`'s Properties path assertion and `apps/web/app/(app)/route-groups.test.ts` were updated (Properties/Team moved from `LEGACY_ROUTES` into a new `FORGE_ROUTES` check alongside Customers; new assertions added for the `[propertyId]`/`[memberId]` routes and for `PropertiesShell`/`TeamShell` chrome). No absolute `@/app/(app)/...` import anywhere in `apps/web` referenced the old bare paths (grepped the whole tree) — no import fallout to fix, unlike the four fixes PR #125 needed.

## Base44 source → Forge destination mapping

| Base44 source (`Forge-Base44-UX/src/...`) | Forge destination |
|---|---|
| `components/forge/properties/PropertiesList.tsx` + `PropertiesTable.tsx` + `PropertyCard.tsx` | `apps/web/app/(app)/(forge)/properties/_components/properties-list.tsx` (merged into one responsive component, matching the `CustomersList` precedent rather than three files) |
| `contracts/properties.ts` | `apps/web/app/(app)/(forge)/properties/_lib/forge-properties-contracts.ts` (occupancy dropped — see gap table) |
| `routes/properties/PropertyDetailRoute.tsx` + `fixtures/recordDetails/propertyDetails.ts` (generic `RecordDetailView` kit) | `apps/web/app/(app)/(forge)/properties/[propertyId]/page.tsx` + `_lib/forge-property-detail-view-model.ts`, reusing the already-ported `RecordDetailView`/`DetailSections`/`DetailStatusBadge` |
| `components/forge/team/TeamList.tsx` | `apps/web/app/(app)/(forge)/team/_components/team-list.tsx` |
| `contracts/team.ts` | `apps/web/app/(app)/(forge)/team/_lib/forge-team-contracts.ts` (`onNavigate`/`onQuickAction`/`onSwitchOrganization`/`onSignOut` trimmed from `TeamCallbacks`, same trim `CustomerCallbacks` already made) |
| `routes/team/TeamMemberDetailRoute.tsx` + `fixtures/recordDetails/teamMemberDetails.ts` (generic `RecordDetailView` kit) | `apps/web/app/(app)/(forge)/team/[memberId]/page.tsx` + `_lib/forge-team-detail-view-model.ts` (new route) |

Both detail routes confirmed to use the generic `RecordDetailView` kit in Base44 itself (not a bespoke layout), so both follow the exact pattern PR #125 established for Customer Detail — no artificial abstraction was forced onto either.

## Adapters written and what they bind to

| Adapter | Binds to |
|---|---|
| `properties/_lib/forge-properties-view-model.ts` | `listProperties` (`packages/db/queries/properties.ts`) + `service_requests`/`jobs` joined by `property_id` (mirrors the pre-existing legacy page's extra queries) |
| `properties/_lib/forge-property-detail-view-model.ts` | `getPropertyMemory` (`PropertyMemory`/`PropertyGeofence` types) |
| `team/_lib/forge-team-view-model.ts` | `org_members` + `user_profiles` + `team_member_availability` + `site_visits`/`site_visit_appointments` + `auth.admin.listUsers()` email map — extracted UNCHANGED from the pre-existing `(legacy)/team/page.tsx`'s inline logic (`buildTeamMemberView`, `resolveDisplayedTeamAvailability`, filters) |
| `team/_lib/forge-team-detail-view-model.ts` | new `getTeamMemberById` (`packages/db/queries/team.ts`) + single-user `site_visits`/`site_visit_appointments` + `auth.admin.getUserById()` + `packages/shared/permissions.ts`'s `hasCapability` |
| `properties/_lib/forge-shell-context.ts`, `team/_lib/forge-shell-context.ts` | Self-contained copies of `customers/_lib/forge-shell-context.ts` (same architecture: each `(forge)` route builds its own shell chrome) |

## Backend contracts used (unchanged)

- `packages/db/queries/properties.ts`: `listProperties`, `getPropertyMemory` (`createPropertyForCustomer` referenced only to confirm no list-level create path exists — see below)
- `packages/db/queries/team-availability.ts`: `resolveDisplayedTeamAvailability`, `formatTeamAvailabilityLabel`, `TEAM_AVAILABILITY_STATUSES`, `upsertTeamMemberAvailability` (via the existing `updateTeamAvailabilityFormAction`)
- `packages/db/queries/org-invites.ts`: `listPendingInvites`, `resendOrgInvite`, `revokeOrgInvite` (via the existing, unchanged `team/actions.ts`)
- **New, additive:** `packages/db/queries/team.ts` → `getTeamMemberById(client, { orgId, memberId })`, exported through `packages/db/queries/index.ts` and `packages/db/index.ts`. No schema change, no migration.

## Fields mapped vs. unavailable

### Properties

| Field | Status | Notes |
|---|---|---|
| Address, city/state/zip | found-real | `properties.address_line_1` etc. |
| Linked customer + real link | found-real | `customer_properties` join, links to `/customers/:id` |
| Property type (residential/commercial) | adapter-derived | text-match on `property_type`, same heuristic the pre-existing legacy page used |
| Status (active/onboarding/inactive) | adapter-derived, presentation-only | derived from `customerCount`/`jobber_id`, documented with the same "not authoritative" doc-comment convention as `deriveCustomerPresentationStatus` |
| Open requests / active jobs | found-real | `service_requests`/`jobs` joined by `property_id` |
| Next visit | found-real | `jobs.scheduled_start` |
| Updated | found-real | `properties.updated_at` |
| Occupancy | **intentionally-deferred** | No `occupancy` column anywhere on `properties` — dropped from the contract rather than fabricated (Base44's fixture hardcodes "Owner occupied" text) |
| Structured pets field | **backend-completion-required** | No column; Base44's fixture text is hand-written. Not shown. |
| Structured parking field | **backend-completion-required** | Real free-text `parking_notes` exists and IS shown on detail (internal-only); no structured field |
| Lockbox / gate code | found-real | `properties.gate_code` (detail page, internal-only) |
| Structured hazard taxonomy | found-real (free text) | `properties.hazards: string[]` is real and shown; no taxonomy/category system exists beyond free text |
| Documents | **backend-completion-required** | `PropertyMemory` has photos (`recentPhotos`) but no documents/attachments list |
| Direct create/edit support at list level | **intentionally-deferred** | Verified: `createPropertyForCustomer` is only reachable from Customer Detail's "Add property" flow (`customers/_components/properties-card.tsx`); no list-level create route exists. "New property" button stays disabled with an honest tooltip, matching the pre-existing legacy page's behavior exactly. |
| Denormalized work counts | found-real | Computed live from `service_requests`/`jobs`, not denormalized/cached |

### Team

| Field/action | Status | Notes |
|---|---|---|
| Name, email, phone, role | found-real | `user_profiles` + `auth.admin` lookup |
| Availability | found-real | `team_member_availability`, `resolveDisplayedTeamAvailability` |
| Availability editing | found-real | `upsertTeamMemberAvailability`, wired on the detail page as its own form (see "Role/permission findings") |
| Skills | found-real, with a role-based default | `team_member_availability.skills` if set, else `DEFAULT_SKILLS_BY_ROLE[role]` (same fallback the pre-existing page used) — skills editing itself is **backend-completion-required** (no UI/action exists anywhere to edit skills directly) |
| Joined / last active | found-real | `org_members.joined_at`, `team_member_availability.last_seen_at` — last-active is ONLY as authoritative as "did this person last touch their own availability control," not a general login/activity timestamp (documented in `formatLastActive`'s doc comment) |
| Invite state (pending) | found-real | `org_invites` — surfaced on the list page (unchanged); not applicable to `org_members`-based detail (an accepted member has no "pending invite" state) |
| First-class job crew assignment | **intentionally-deferred** | Real source is `site_visits`/`site_visit_appointments` assignment only; labeled honestly as "assigned site visits"/"active assignments" in both the ported list card and detail page, not "jobs" |
| Completed-work aggregation | **backend-completion-required** | No query exists for "completed work by this member" within scope; omitted rather than fabricated |
| Detailed capability descriptions | found-real | Derived from `packages/shared/permissions.ts`'s existing `hasCapability`/`OrgRole` — no new capability name invented |
| Member notes | **backend-completion-required** | No per-team-member notes table/field exists; omitted |
| Activity history | **backend-completion-required** | No per-member activity log query exists; omitted |

## Actions wired vs. deferred

| Action | Status |
|---|---|
| Properties: New property (list) | Deferred — disabled button, honest tooltip, no fake success |
| Properties: Edit / create request / schedule visit / create estimate / create job / add photo / add note / archive (detail) | Deferred — verified no real route/action exists for any of these at the property scope; `primaryAction`/`secondaryActions` are empty, not simulated |
| Team: Invite member, resend invite, revoke invite | Wired — real, unchanged `team/actions.ts` (owner/admin-gated) |
| Team: Update availability | Wired — real, on both... **actually only on the detail page** (see below) |
| Team: Edit member / change role / deactivate / reactivate | Deferred — verified no such action exists anywhere in the codebase; not simulated |

**Deliberate change from the pre-existing list page:** the old `(legacy)/team/page.tsx` had an inline availability `<select>`/Save form on every card. The ported Base44 `TeamList` card has no such control. Rather than force a form into the props-driven presentation component (violating "no server-action imports" for ported components) or drop real functionality, availability editing moved to the Team Member Detail page — same real `upsertTeamMemberAvailability` binding, same `canEditAvailability` gate (`canManageTeam || isSelf`), just relocated. This is the one intentional behavior change from the pre-existing list page; documented here per the task's instruction to flag any Customers-adjacent defect fix — this isn't a Customers change, but it is a deliberate relocation worth calling out explicitly.

## Role/permission findings — Team Member Detail

- **Owner/admin gate:** reuses the exact `role === 'owner' || role === 'admin'` check from `team/actions.ts`'s `getTeamActionContext()` (same boolean, computed the same way, in `team/page.tsx` and `[memberId]/page.tsx`) — not a parallel/invented check.
- **Capability summary:** derived from `packages/shared/permissions.ts`'s existing `hasCapability(role, capability)` over a fixed list of already-defined capabilities (`canTriageRequests`, `canScheduleJobs`, `canCreateEstimates`, `canApproveEstimatePricing`, `canCreateQuote`, `canCreateInvoices`, `canRecordPayments`, `canManageDeposits`). No new capability name was added to `permissions.ts`.
- **Availability-edit gate:** `canEditAvailability = canManageTeam || isSelf`, matching the pre-existing list page's `canEditAvailability={canManageTeam || member.userId === user.id}` exactly.
- **Owner-only actions that don't render:** edit member, change role, deactivate/reactivate — never rendered for ANY viewer (not gated by role, because no such action exists at all; see the "Actions wired vs. deferred" table). This is stricter than merely hiding from non-owners.
- **Organization isolation:** `getTeamMemberById` filters `.eq('org_id', orgId)` before returning a row; a `memberId` (an `org_members.id`) belonging to a different org resolves to `ErrorCode.NOT_FOUND` → `notFound()`, the same pattern `getCustomer360`/`getPropertyMemory` use. Not manually re-verified against a live cross-org fixture in this pass (no `.env.test` — see Testing below) but the query-level enforcement mirrors the exact pattern already proven correct for Customers/Properties.

## Route-group verification

`apps/web/app/(app)/route-groups.test.ts` extended:
- `properties`/`team` removed from `LEGACY_ROUTES`, added to a new `FORGE_ROUTES` array alongside `customers`, asserting each lives under `(forge)/` only.
- New assertions: `properties/[propertyId]/page.tsx` and `team/[memberId]/page.tsx` exist; `properties/page.tsx` builds its own shell via `PropertiesShell`; `team/page.tsx` via `TeamShell`.
- All pre-existing assertions (middleware absence, shell-router absence, `(app)/layout.tsx` purity, `(legacy)/layout.tsx` renders `AppShell`, `(forge)/layout.tsx` is a pass-through) kept intact, unmodified.

## Test results

- **Unit (`pnpm test`):** 40 test files passed, 1 skipped (41 total); 312 tests passed, 6 skipped (318 total). Includes 4 new test files added in this PR:
  - `properties/_lib/forge-properties-view-model.test.ts`
  - `team/_lib/forge-team-view-model.test.ts`
  - `team/_lib/forge-team-detail-view-model.test.ts`
  - `route-groups.test.ts` (extended, not new)
- **Typecheck (`pnpm typecheck`):** all 6 workspace projects pass (`apps/web`, `packages/db`, `packages/shared`, `packages/ai`, `packages/automation`).
- **Build (`pnpm --filter web build`):** succeeds. Confirmed in the route table: `/properties`, `/properties/[propertyId]`, `/team`, `/team/[memberId]` all present as dynamic (ƒ) routes; no middleware compiled.
- **Lint:** `pnpm lint` has pre-existing errors (all in `scripts/*.mjs` Node scripts missing `no-undef` globals, and a couple of unrelated pre-existing e2e specs) — confirmed via `pnpm lint | grep -i "properties\|team"` that **none** of the flagged files are inside the new `(forge)/properties`/`(forge)/team` trees. The Next.js build's own integrated lint step (which does cover the new files) passed cleanly with only two pre-existing warnings in unrelated `quotes` files.

## E2E status — executed in a follow-up verification pass

The implementation pass had no `.env.test` in this worktree and honestly reported the specs as written-but-unrun. A follow-up verification pass copied `C:\dev\Premier-CRM\.env.test` into this worktree (confirmed gitignored here, confirmed non-production via `/api/e2e-health` → `premier-crm-e2e`, `slbnizoskumwhleeiccv`), started the dev server, and actually ran everything:

- **`properties-base44-shell-bot`**: found 2 real failures (horizontal overflow at tablet-landscape and desktop) — see "Implementation defect found and fixed" below. **Clean after the fix.**
- **`team-base44-shell-bot`**: **3 failures, all one root cause**: `premier-crm-e2e`'s applied migrations stop at `20260804000002` — it is missing `20260805084201_team_availability_model` (and everything after), so the `team_member_availability` table does not exist on that project at all (confirmed via direct `information_schema.tables` query — zero rows). Every Team test that loads `/team` hits `"Could not find the table 'public.team_member_availability' in the schema cache"` and fails. This is a **pre-existing environment gap** (the e2e project is out of sync with the repo's migration set), not a defect in this slice's code — the query logic was extracted unchanged from the pre-existing `(legacy)/team/page.tsx`, which has the identical dependency and would fail identically against this same environment. No migration was applied to fix this (out of this task's authorized scope — flagged for separate action).
- **`customers-base44-shell-bot`** (regression check): 14/14 passing, run in isolation.
- **`today-redesign-bot`** (regression check): 13/13 passing, run in isolation.

Both new spec files (`tests/e2e/properties-base44-shell-bot.spec.ts`, `tests/e2e/team-base44-shell-bot.spec.ts`) typecheck cleanly against `tests/e2e/tsconfig.json`. `tests/e2e/utils/selectors.ts`'s `team.heading` selector was corrected from a stale `"Team access"` heading name to the ported `TeamList`'s actual `<h1>Team</h1>`; a `memberCard` locator was added.

## Implementation defect found and fixed

`properties-base44-shell-bot`'s overflow assertions failed at 1024×768 and 1440×900 (208px of horizontal overflow). Root cause: the desktop table's Property/Customer `<td>` cells had no word-breaking, so a long unbroken token forced the table wider than the viewport — accumulated E2E fixture names like `E2E_TEST_CONV_ESTIMATE_1785700637047_k0l7sn` are the worst case in this environment, but a genuinely long real address or business name with no spaces could trigger the same thing in production. Fixed with `max-w-0 break-words` on both cells; verified both previously-failing assertions now pass, plus a full clean re-run of the whole Properties bot. Also converted one literal `text-amber-700 dark:text-amber-400` to the existing `--st-warning-fg` token while in the file, matching the convention already established for Requests/Customers in prior slices.

## Visual evidence — captured

12 real authenticated screenshots captured in the follow-up pass (`scripts/capture-properties-team-evidence.mjs`, viewport crops not fullPage, not committed): Properties list/detail at desktop light/dark + mobile light (6 files, all genuine — Properties has no dependency on the missing table), Team list/detail at desktop light/dark + mobile light (6 files — the **list** screenshots are genuine; the **detail** screenshots show the same "Team could not be loaded" error state as the list, since no member row exists to click through to a real detail view while the table is missing). Shared directly with the reviewer rather than committed (22MB+ of PNGs doesn't belong in git history, same reasoning as PR #125).

## Known limitations

1. Availability editing moved from the list page to the detail page (see "Actions wired vs. deferred").
2. Properties list search/filter is server-side for text (`?q=`) but status/type remain post-fetch filters over the bounded 250-row page, matching the pre-existing legacy page's exact limitation — not a regression introduced here.
3. Team Member Detail's "assigned"/"schedule" sections cover only `site_visits`/`site_visit_appointments`; no job-crew, completed-work, notes, or activity-history data exists to back the equivalent Base44 fixture sections (all explicitly omitted, not faked).
4. Cross-org isolation for `getTeamMemberById` was verified by code-reading (matches the proven `getCustomer360`/`getPropertyMemory` pattern) but could not be exercised against a live second-org fixture in this pass either, since the Team route is fully blocked by the missing-table issue.
5. **`premier-crm-e2e` is missing at least one migration** (`20260805084201_team_availability_model`, and possibly others after `20260804000002`) — this blocks not just this PR's Team E2E coverage but any future work touching team availability against this environment. Needs someone with migration-apply authorization to run `supabase db push` (or equivalent) against the e2e project specifically — not attempted here, out of this task's scope.

## Next recommended slice

Job crew assignment as a first-class model (a real `job_assignments`/`crew` table distinct from site-visit assignment) would resolve the single largest recurring gap across both Properties (job history is real but crew-per-job isn't) and Team (assigned/completed work sections are visit-scoped, not job-scoped) — worth scoping as its own slice before porting any more Base44 routes that assume a job-crew concept (e.g. Jobs or Calendar).

## Commits on this branch (in order)

1. `b7ae85e` — refactor(routing): move Properties and Team into the (forge) route group
2. `5934ac6` — feat(properties): port exact Base44 Properties list/detail onto real data
3. `ce61146` — feat(team): port exact Base44 Team list, add real Team Member Detail route
4. `c6ff0eb` — test(e2e): add properties/team base44-shell bot specs (written, not executed)
5. `b20c722` — docs(ux): add base44-exact-properties-team-report.md
6. `def5337` — fix(properties): stop desktop table overflowing on long unbroken names (found by actually running the E2E bot in a follow-up pass)
7. `78c8002` — chore: add properties/team visual-evidence capture script
8. (this commit) — docs(ux): update report with follow-up E2E execution, the overflow fix, and captured visual evidence
