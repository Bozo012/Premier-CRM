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

## premier-crm-e2e migration sync

`premier-crm-e2e`'s applied migrations stopped at `20260804000002`, missing two later ones present in the repo and already applied to **production** (`apnbpcauqrjvkoleisde`): `20260805075928_forge_expenses_foundation` and `20260805084201_team_availability_model`. Verified before applying anything:

- Both confirmed present on `main` and already applied to production (`apnbpcauqrjvkoleisde`'s migration list includes both).
- Both fully additive/non-destructive: new enums, a new `expenses` table, three new nullable columns on `invoice_line_items` (no backfill needed — existing rows just get `NULL`), a new `team_member_availability` table. No `DROP`, no rewrite of existing data.
- All dependencies (`public.set_updated_at()`, `public.user_is_in_org()`, the `payment_method` enum, and every referenced table — `jobs`/`customers`/`properties`/`invoices`/`vault_items`/`invoice_line_items`/`org_members`/`organizations`) confirmed already present on `premier-crm-e2e` before applying.
- Neither table existed yet on `premier-crm-e2e` (confirmed via direct schema query) — clean state, no partial-application risk.

Applied both, in order, via the Supabase MCP `apply_migration` tool against project `slbnizoskumwhleeiccv` (`premier-crm-e2e`) — the tool the repo's own `scripts/run-migrations.mjs` documents as the correct one for applying a single new migration to an existing database. No migration file content was altered. `production` was never touched.

**Post-apply verification**: migration history now includes both (tracked under new version stamps reflecting apply time, since that's how this tool records them — names and schema content are exact matches to the checked-in files). `team_member_availability`: all 11 expected columns present, `relrowsecurity = true`, all 4 expected RLS policies present (`select_org_members`, `insert_self_or_admin`, `update_self_or_admin`, `delete_admin`), `authenticated` grants correct (SELECT/INSERT/UPDATE/DELETE). `expenses`: RLS enabled, all 7 expected indexes present.

## E2E status — fully executed, Team included

Ran against `premier-crm-e2e` (`.env.test` copied from the main checkout, confirmed gitignored, confirmed non-production via `/api/e2e-health`, deleted after use):

- **`properties-base44-shell-bot`**: found 2 real failures (horizontal overflow at tablet-landscape and desktop) — see "Implementation defects found and fixed" below. **Clean after the fix**, re-verified in a combined re-run.
- **`team-base44-shell-bot`**: after the migration sync, **12/13 passed immediately**; the 13th (`an employee account does not see invite-management actions that an owner/admin sees`) found a **second real defect** — see below. **13/13 clean after the fix.**
- **`customers-base44-shell-bot`** (regression check): 14/14 passing.
- **`today-redesign-bot`** (regression check, isolated): 13/13 passing.
- Combined re-run of properties + team + customers together: 38/38 clean.

Both new spec files typecheck cleanly against `tests/e2e/tsconfig.json`. `tests/e2e/utils/selectors.ts`'s `team.heading` selector was corrected from a stale `"Team access"` heading name to the ported `TeamList`'s actual `<h1>Team</h1>`; a `memberCard` locator was added.

## Implementation defects found and fixed

1. **Properties table overflow.** `properties-base44-shell-bot`'s overflow assertions failed at 1024×768 and 1440×900 (208px of horizontal overflow). Root cause: the desktop table's Property/Customer `<td>` cells had no word-breaking, so a long unbroken token forced the table wider than the viewport — accumulated E2E fixture names like `E2E_TEST_CONV_ESTIMATE_1785700637047_k0l7sn` are the worst case in this environment, but a genuinely long real address or business name with no spaces could trigger the same thing in production. Fixed with `max-w-0 break-words` on both cells. Also converted one literal `text-amber-700 dark:text-amber-400` to the existing `--st-warning-fg` token while in the file.

2. **Team "Invite member" button not role-gated.** Once the schema was synced, `team-base44-shell-bot` found that an `employee`-role account (the persistent `TEST_STAFF` identity, confirmed via direct query to genuinely hold `role='employee'`, `status='active'`) could see the "Invite member" button, even though the `#invite-member` section it scrolls to was already correctly gated server-side (`role === 'owner' || 'admin'` in `page.tsx`). Root cause: the ported `TeamList` presentation component is intentionally permission-free (props-driven, no auth knowledge of its own) and always rendered the button — nothing upstream told it not to; only the target section, not the trigger, was gated. Fixed by adding `canInvite: boolean` to `TeamListViewModel`, threading it through `toTeamListViewModel()`, and wiring `page.tsx`'s existing `canManageTeam` value into it; `TeamList` now conditionally renders the button on `model.canInvite`. Added a focused regression test (`canInvite defaults to false and only becomes true when explicitly passed`) covering both the fail-closed default and the explicit-true case.

## Visual evidence — captured, including real Team screens

12 real authenticated screenshots (`scripts/capture-properties-team-evidence.mjs`, viewport crops not fullPage, not committed — shared directly with the reviewer). All 12 are now genuine working pages, including Team list and Team Member Detail, which were blocked by the missing table in the first verification pass and are now real after the migration sync and the `canInvite` fix.

## Known limitations

1. Availability editing moved from the list page to the detail page (see "Actions wired vs. deferred").
2. Properties list search/filter is server-side for text (`?q=`) but status/type remain post-fetch filters over the bounded 250-row page, matching the pre-existing legacy page's exact limitation — not a regression introduced here.
3. Team Member Detail's "assigned"/"schedule" sections cover only `site_visits`/`site_visit_appointments`; no job-crew, completed-work, notes, or activity-history data exists to back the equivalent Base44 fixture sections (all explicitly omitted, not faked).
4. Cross-org isolation for `getTeamMemberById` was verified by code-reading (matches the proven `getCustomer360`/`getPropertyMemory` pattern); not additionally exercised against a live second-org fixture in this pass — the existing `team-base44-shell-bot` suite doesn't include a cross-org case, and adding one was outside this fix's scope.

## Next recommended slice

Job crew assignment as a first-class model (a real `job_assignments`/`crew` table distinct from site-visit assignment) would resolve the single largest recurring gap across both Properties (job history is real but crew-per-job isn't) and Team (assigned/completed work sections are visit-scoped, not job-scoped) — worth scoping as its own slice before porting any more Base44 routes that assume a job-crew concept (e.g. Jobs or Calendar).

## Commits on this branch (in order)

1. `b7ae85e` — refactor(routing): move Properties and Team into the (forge) route group
2. `5934ac6` — feat(properties): port exact Base44 Properties list/detail onto real data
3. `ce61146` — feat(team): port exact Base44 Team list, add real Team Member Detail route
4. `c6ff0eb` — test(e2e): add properties/team base44-shell bot specs (written, not executed)
5. `b20c722` — docs(ux): add base44-exact-properties-team-report.md
6. `def5337` — fix(properties): stop desktop table overflowing on long unbroken names
7. `78c8002` — chore: add properties/team visual-evidence capture script
8. `b90cb27` — docs(ux): update report with follow-up E2E execution results
9. `bcb1766` — fix(team): gate the "Invite member" trigger button by role, not just its target section
10. `f17d76f` — test(team): add regression coverage for canInvite gating
11. (this commit) — docs(ux): final update after premier-crm-e2e migration sync and the invite-button fix
