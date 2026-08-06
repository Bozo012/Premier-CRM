# Base44-exact rebuild: Requests + Site Visits + Inspection

Branch: `rebuild/base44-exact-requests-visits` (worktree `C:\dev\Premier-CRM-base44-requests-visits`)
Base commit: `7c20ed9c91a40a24e587f130e321e0125701f48` (PR #126 merged — Properties + Team)
This is the fourth slice of the Base44-exact rebuild program (after Customers, then Properties + Team).

## Scope

Moved Requests and Site Visits (including the inspection workflow) from `(legacy)` to `(forge)`, wired the real `ForgeShell` chrome (the routes had none before — they inherited `(legacy)/layout.tsx`'s `AppShell` and would have rendered with zero navigation chrome once moved into `(forge)`'s pass-through layout), and replaced the flat single-page inspection form with a Base44-exact 5-step wizard bound to the existing real inspection backend. The triage architecture (`TriagePanel` → `record_request_triage`/`correct_request_triage` RPCs) was left untouched and is confirmed as the sole triage trigger.

## Routes moved

| Route | Old location | New location |
|---|---|---|
| `/requests` | `(legacy)/requests/page.tsx` | `(forge)/requests/page.tsx` |
| `/requests/[taskId]` | `(legacy)/requests/[taskId]/page.tsx` | `(forge)/requests/[taskId]/page.tsx` |
| `/requests/new` | `(legacy)/requests/new/page.tsx` | `(forge)/requests/new/page.tsx` |
| `/site-visits` | `(legacy)/site-visits/page.tsx` | `(forge)/site-visits/page.tsx` |
| `/site-visits/[siteVisitId]` | `(legacy)/site-visits/[siteVisitId]/page.tsx` | `(forge)/site-visits/[siteVisitId]/page.tsx` |
| `/site-visits/[siteVisitId]/inspection` | `(legacy)/site-visits/[siteVisitId]/inspection/page.tsx` | `(forge)/site-visits/[siteVisitId]/inspection/page.tsx` |

All `_components/`, `_lib/`, `actions.ts`, and test files moved with `git mv` alongside their routes. URLs and the `[taskId]` param name are unchanged.

### Import fallout found and fixed

- `apps/web/app/(app)/(legacy)/estimates/_components/pricing-review-panel.tsx` had a relative import `'../../site-visits/actions'` that resolved to `(legacy)/site-visits/actions` — broken once site-visits moved out of `(legacy)`. Fixed to the absolute path `'@/app/(app)/(forge)/site-visits/actions'`.
- `apps/web/lib/branding.test.ts` and `apps/web/app/(app)/route-groups.test.ts` had hardcoded `(legacy)/requests` / `(legacy)/site-visits` path assertions — updated to `(forge)`, and `requests`/`site-visits` moved from `route-groups.test.ts`'s `LEGACY_ROUTES` list to its `FORGE_ROUTES` list (alongside `customers`, `properties`, `team`), with new route-resolution assertions added for all six request/site-visit pages.
- All relative imports *within* the moved trees (e.g. `triage-panel.tsx`'s `'../../site-visits/actions'`, `inspection-form.tsx`'s `'../actions'`) needed no change since both endpoints moved together — verified by grep and by a clean `pnpm typecheck`.

## ForgeShell wiring (the real architectural gap this slice closes)

`requests/page.tsx`, `requests/[taskId]/page.tsx`, `requests/new/page.tsx`, `site-visits/page.tsx`, `site-visits/[siteVisitId]/page.tsx`, and `site-visits/[siteVisitId]/inspection/page.tsx` previously rendered bare content (`ForgePage`/`ForgeCard` from `components/forge/presentation.tsx` — a `<main>`/`<section>` wrapper with no navigation) because they lived under `(legacy)/layout.tsx`, which supplied `AppShell`. Moving them into `(forge)` without adding shell wiring would have made every request/site-visit page render with **zero sidebar, topbar, or mobile nav**. New files, copied exactly from the established `properties`/`customers` pattern:

- `requests/_lib/forge-shell-context.ts`, `requests/_components/requests-shell.tsx`
- `site-visits/_lib/forge-shell-context.ts`, `site-visits/_components/site-visits-shell.tsx`

Every page now builds `shellData`/`mobileNav` from `getActiveOrgContext` + the user's profile and wraps its content in `<RequestsShell>`/`<SiteVisitsShell>`, matching `customers-shell.tsx`/`properties-shell.tsx` exactly (same reused `signOutAction`/`switchActiveOrgAction`).

## Requests list/detail

The existing `(legacy)` pages already bound real data (`listRequests`, `getRequestById`) through `toForgeRequestSummary`/`toForgeRequestDetailModel` (`requests/_lib/forge-request-view-model.ts`, unchanged/reused) and already used `TriagePanel`/`MarkReviewedButton` correctly. This slice's work here was: (1) add ForgeShell chrome (above), (2) verify structurally against Base44's `RequestsList.tsx`/`RequestDetail.tsx` — search bar, status pill + number header, filter tabs, concern-first detail layout, customer/property context card, triage section, actions/related-records section — all present. Base44's `RequestDetail.tsx` triage section is a plain array of buttons calling a generic `onTriage` callback with no backing logic; per the task's explicit instruction this was **not** ported literally — the real `TriagePanel` (RPC-bound) renders in that slot instead.

**Search/filter mechanism**: kept as the pre-existing server-driven `<form action="/requests">` + `Link`-based filter tabs (full navigation, real re-query via `listRequests`/`listSiteVisits` search params) rather than converting to the client-side debounced `router.replace` pattern `customers-list-container.tsx` uses. Both are real, server-backed search — this is a presentation-layer difference, not a functional gap — and is called out below as a follow-up, not implemented in this slice to keep risk down on the highest-stakes area of the codebase.

## Site Visits list/detail

Same treatment: `listSiteVisits`/`getSiteVisitById` binding (`forge-site-visit-view-model.ts`) was already real and unchanged. `SiteVisitDetail` shows: appointment/schedule card (`ScheduleForm`), inspection-handoff progress + lifecycle actions (`StartInspectionButton`, `GenerateEstimateButton`, `LifecycleButtons`), related records (source request, customer), and — for completed visits — a `CompletedInspectionSummary` that reads `visit.inspectionResponses` directly from the `getSiteVisitById` query result (persisted data, not client state).

**Deliberate scope decision on Base44's `SiteVisitDetail.tsx`**: Base44's version uses a fixed, tabbed section taxonomy (`hazards`/`measurements`/`quantities`/`materials`/`photos`/`notes`/`completion`) built from fixture data with fields (hazard severity/acknowledgement, photo upload status enums, etc.) that have no counterpart in this codebase's real template-driven schema (`inspection_template_versions.field_definitions`, a flat list of typed fields with `visibility`/`estimateMappingHint`, not a fixed section object). Reproducing Base44's tab UI literally would have meant fabricating fields the backend doesn't have. This slice ported Base44's card/section *visual language* onto the real, field-definition-driven progress/actions structure instead of inventing a matching section taxonomy — documented here as a reversible presentation decision per the task's own carve-out for "how to group inspection fields."

## Inspection — 5-step wizard (the main new content this slice adds)

New files:
- `site-visits/_components/inspection-field-editor.tsx` — `FieldEditor`/`ListFieldEditor`/`SaveIndicator`, extracted **unchanged** from the old flat `inspection-form.tsx` so every field type (text/longtext/number/boolean/multiselect/photo_list/measurement_list/quantity_list/material_list) renders identically wherever it's used. `photo_list` still uses the existing `PhotoUpload` component untouched (sequential multi-file upload, per-file progress, reselect-to-retry — verified this hasn't regressed by reading `photo-upload.tsx` before and after the move: identical file, byte-for-byte).
- `site-visits/_components/inspection-workflow.tsx` — the new orchestrator, ported from Base44's `InspectionWorkflow.tsx` (step rail with numbered/checkmarked pills, sticky bottom Cancel/Back/Continue/Complete bar) but driving REAL field definitions instead of Base44's fixture-only `InspectionDraft` contract (which has no backing schema here — see below).
- **Deleted** `site-visits/_components/inspection-form.tsx` (the old flat form) — fully superseded, no remaining references (verified by grep before deletion; only the inspection page and its own test/E2E references existed, both updated).

### Field grouping (documented decision)

The one seeded template (`supabase/migrations/20260802010400_inspection_templates.sql`, "General Property Maintenance") has 14 fields. Grouped by key:

| Step | Fields |
|---|---|
| Arrival | `customerConcerns` (required), `accessIssues`, `hazards` |
| Findings | `observedConditions` (required), `notes` |
| Measurements & Photos | `measurements`, `quantities`, `materialsNeeded`, `photos` |
| Recommendations | `laborAssumptions`, `recommendations`, `proposedScope` (required), `estimatedDurationHours`, `followUpNeeded` |
| Review | (no fields — read-only summary of every filled field + the Complete button) |

Any future template field not in this map falls back to the Findings step rather than being silently dropped (`stepForField()` in `inspection-workflow.tsx`).

### What was intentionally NOT ported from Base44's `InspectionWorkflow`/`InspectionReviewStep`/`CompletedInspectionSummary`

Base44's contract (`src/contracts/inspection.ts`) has a fixture-only shape: a `checklist` array, `findings` with `condition`/`severity`/`likelyCause`/`customerVisible`, a `customerSummary` free-text field, `recommendedServiceIds`, photo placeholder tiles with `tone` gradients, etc. — none of this exists in the real schema. Rather than fabricate it, the Review step here shows every **real** filled field with its real `label`, using the real `visibility` attribute (`staff_only` | `internal_and_estimate_source`) already present on every field definition to badge each entry "Internal only" or "Feeds estimate" — the actual customer/internal-visibility mechanism this schema has, not an invented one. In the seeded template every field is currently `staff_only`, so no field is customer-facing today; this is reported honestly rather than assumed.

### Persistence and completion — unchanged mechanism

`inspection-workflow.tsx` calls the exact same `saveSiteVisitInspectionAction` (debounced 1200ms autosave per field, unchanged) and `completeSiteVisitWithValidationAction` (unchanged) server actions the old flat form called — no new persistence path, no new RPC, no client-side bypass of `validateRequiredFieldsPresent`/`validateInspectionResponses`. The "Complete inspection" button only exists on the Review step (last step) and is disabled while `validateRequiredFieldsPresent` (imported directly from `@premier/shared`, the same function the server action re-validates with) reports any missing required field — this is a UX mirror, not the authority; the server action re-checks independently.

**Read-only/completed visits** open directly on the Review step (rather than Arrival) so a returning user immediately sees the full recorded summary — this also means `CompletedInspectionSummary`-equivalent data is visible without extra clicks, and — importantly — this comes from `getSiteVisitById`'s query result (`visit.inspectionResponses`), passed as `initialResponses` prop, not from client-only navigation state.

### Persistence-survives-refresh verification

Verified by **code reading**, not a live run (no `.env.test` in this worktree — see Testing below): `inspection-workflow.tsx` takes `initialResponses` as a prop populated server-side from `getSiteVisitById(serviceClient, siteVisitId, orgId).data.inspectionResponses`, and the Site Visit Detail page's `CompletedInspectionSummary` (unchanged, inline in `[siteVisitId]/page.tsx`) reads the same persisted field. Direct URL load or a hard refresh re-runs the server component, so there is no code path where the completed summary could come from anything but the database. The existing RPC-level bot `request-site-visit-workflow-bot.spec.ts` and the existing UI-level bot `site-visits-inspection-redesign-bot.spec.ts` (updated this slice, see Testing) both assert this at the E2E level; neither was executed live this session.

## Triage preservation — explicit confirmation

- `TriagePanel` (`requests/_components/triage-panel.tsx`, unmodified) calling `recordRequestTriageAction`/`correctRequestTriageAction` remains the **sole** visible triage trigger on Request Detail. It is rendered in a `ForgeCard` in `requests/[taskId]/page.tsx`, unchanged from before this slice except for the new ForgeShell wrapper around the whole page.
- `create-estimate-button.tsx` and `create-job-button.tsx` were moved (`git mv`, path-only) but **not re-wired** — no import of either file was added anywhere. Grep-verified: only their own file exists on disk; nothing references them.
- `MarkReviewedButton`/`markRequestReviewedAction` remains wired as the genuinely-distinct secondary action (sets `status='reviewing'`).
- The new `requests-base44-shell-bot.spec.ts` E2E spec asserts, on a real request detail page, that no `"Create estimate"`/`"Create job"` button is present alongside a visible `"Triage"` section — a regression guard for this exact requirement, written this session (not yet executed — see Testing).

## Permissions / RLS findings

No changes made to `packages/shared/permissions.ts`, `requests/actions.ts`, or `site-visits/actions.ts` gating — all pre-existing and verified unchanged by reading `requests/[taskId]/page.tsx` (`hasCapability(role, 'canTriageRequests')` still gates the `MarkReviewedButton` render) and `TriagePanel`'s RPC calls (still the sole path enforcing `canTriageRequests`/authorization-field requirements for `direct_work_order` server-side). `getRequestById`/`getSiteVisitById` continue to scope by `orgId` — unchanged. No new client-only permission checks were added anywhere in this slice; the only new client logic (`inspection-workflow.tsx`'s `canComplete`) mirrors, but does not replace, the server-side `validateRequiredFieldsPresent` check inside `completeSiteVisitWithValidationAction`. `saveSiteVisitInspectionTrusted`/`save_site_visit_inspection`'s service-role-only boundary was not touched.

## Gap table

| Item | Classification | Notes |
|---|---|---|
| Requests/Site Visits search & filter as full-page navigation, not client-debounced `router.replace` | Intentionally deferred | Real, server-backed; matches pre-existing `(legacy)` behavior. Converting to the `customers-list-container.tsx` pattern is a reasonable next-slice item, deferred here to limit surface area in the highest-stakes part of the codebase. |
| Base44's tabbed hazards/measurements/quantities/materials/photos/notes/completion `SiteVisitDetail` sections | Adapter-derived / restructured | Real backend has a flat field-definition list with `visibility`, not Base44's fixture-only fixed section taxonomy — ported visual language, not the literal tab structure. |
| Inspection field customer-visibility split (Base44's `customerVisible`/`Eye`/`EyeOff` UI) | Found-real, correctly bound | Backed by the real `field.visibility` (`staff_only` \| `internal_and_estimate_source`) attribute already in the schema — no field in the seeded template is currently customer-facing, reported honestly rather than assumed otherwise. |
| Inspection page's `propertyAddress` (passed to `InspectionWorkflow`) | Backend-completion-required | `getSiteVisitById`'s `SiteVisitDetail` type does not select `propertyAddress` (only the list query, `SiteVisitListItem`, does) — passed `null` rather than fabricated; a real gap if this header line is wanted, not fixed in this slice since it needs a query-layer change outside this slice's PR-doc scope. |
| Base44's `checklist`/`findings[].condition/severity`/`recommendedServiceIds`/photo-tone placeholders | Intentionally not ported | No backing schema; fabricating these would violate the "never fabricate business records or unsupported workflow state" rule. |
| Base44's "crew"/job-linkage sections | Not present in Base44 source for this domain (verified: neither `RequestDetail.tsx` nor `SiteVisitDetail.tsx` shows a crew section) | N/A — nothing to port or omit. |

## Testing

**Unit (`pnpm test`)**: 40 test files passed, 1 skipped (41 total); 315 tests passed, 6 skipped (321 total). No unit test needed behavior changes beyond the mechanical import-path fallout described above — `forge-request-view-model.test.ts`, `forge-site-visit-view-model.test.ts`, `triage-consolidation.test.ts`, `error-translation.test.ts`, and both `actions.test.ts` files all use relative imports (`./actions`, `./error-translation`) and needed **no changes**, since both they and what they import moved together.

**Typecheck (`pnpm typecheck`)**: clean across all 5 packages with a `typecheck` script (`apps/web`, `packages/ai`, `packages/automation`, `packages/db`, `packages/shared`). One real type error was found and fixed during this slice: `inspection-workflow.tsx` was initially passed `visit.propertyAddress`, which doesn't exist on the `SiteVisitDetail` query type (see gap table above) — fixed to pass `null` with an explanatory comment rather than widening the type or fabricating data.

**Build (`pnpm --filter web build`)**: succeeds. Route list confirms all six routes present exactly once: `/requests`, `/requests/[taskId]`, `/requests/new`, `/site-visits`, `/site-visits/[siteVisitId]`, `/site-visits/[siteVisitId]/inspection`. No middleware in the build output. ESLint (integrated into the build) reports only two pre-existing warnings in unrelated `(legacy)/quotes` files — zero warnings/errors in any file touched this slice.

**E2E — written and typechecked, not executed.** No `.env.test` exists in this worktree (confirmed absent before starting, per the task's stop condition for this exact scenario) — same honest-reporting pattern as PRs #125/#126.

- New: `tests/e2e/requests-base44-shell-bot.spec.ts`, `tests/e2e/site-visits-base44-shell-bot.spec.ts` — shell/list/detail chrome, responsive/no-overflow at 4 viewports, search/filter URL updates, direct-URL/refresh/Back, TriagePanel-presence + dead-button-absence assertion (requests bot).
- Updated: `tests/e2e/site-visits-inspection-redesign-bot.spec.ts` — adapted its 3 core tests (field visibility on load, autosave + completion, persisted-summary-survives-refresh) to the new 5-step structure: fields are now asserted per-step with `Continue` clicks between them, the `Complete inspection` button is asserted to not exist until the Review step, and the completed/read-only view is asserted to open on Review (where the previously-filled `proposedScope` value is visible without navigation). No assertion was weakened — the persistence-survives-refresh proof (test 3) is unchanged in substance.
- Not re-run this session (no safe environment): `request-conversion-bot.spec.ts`, `request-site-visit-workflow-bot.spec.ts` — read in full before starting; neither required changes, and nothing in this slice altered the RPCs or server actions they exercise. Also not re-run: `customers-base44-shell-bot`, `properties-base44-shell-bot`, `team-base44-shell-bot`, `today-redesign-bot` (unaffected by this slice's changes; would be worth a regression pass before merge).
- `tests/e2e/utils/selectors.ts` gained `routes.newRequest` and `routes.siteVisits` (the latter didn't exist before; `routes.requests` already did).

All new/edited spec files typecheck cleanly against `tests/e2e/tsconfig.json` (verified with `npx tsc --noEmit -p tests/e2e/tsconfig.json`; the only errors reported are pre-existing, in unrelated spec files this slice didn't touch).

## Visual evidence

Not captured. No safe running environment was available this session (no `.env.test`), matching the same honest-reporting pattern used when a live environment isn't available.

## Known limitations / follow-ups

1. Requests/Site Visits list search+filter still uses full-page `<form>`/`<Link>` navigation rather than the client-debounced pattern used by `customers-list-container.tsx`/`properties`. Both are real and server-backed; unifying them is a reasonable low-risk follow-up.
2. `SiteVisitDetail`'s query doesn't expose `propertyAddress` — worth adding if the inspection page header is meant to show it.
3. No live E2E execution this session — running the full existing + new bot suite against `premier-crm-e2e` (once a `.env.test` is available) is the natural next step before merge, per the task's own guidance.
4. Base44's tabbed inspection-section UI on Site Visit Detail was intentionally not replicated 1:1 (see gap table) — if a future slice wants closer visual parity, it would need either a schema change (grouping metadata on `field_definitions`) or a client-side-only grouping convention layered on top of the existing flat field list (same grouping table already built for the inspection wizard could be reused).

## Commits on this branch (in order)

Run `git log --oneline rebuild/base44-exact-requests-visits` after the final commit for exact SHAs — recorded here at hand-off:

1. Move Requests and Site Visits into `(forge)`; wire ForgeShell chrome; fix cross-route-group import fallout; update `route-groups.test.ts`/`branding.test.ts`.
2. Port the 5-step Base44 inspection workflow onto the existing real inspection backend (new `inspection-workflow.tsx`/`inspection-field-editor.tsx`, delete the superseded flat `inspection-form.tsx`).
3. Tests: new `requests-base44-shell-bot.spec.ts`/`site-visits-base44-shell-bot.spec.ts`, updated `site-visits-inspection-redesign-bot.spec.ts` for the 5-step structure, `selectors.ts` route additions.
4. Documentation (this file).
