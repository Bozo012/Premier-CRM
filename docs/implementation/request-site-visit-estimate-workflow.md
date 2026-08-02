# Request → Site Visit → Estimate → Quote Workflow — Implementation Report

**Status as of this document:** Checkpoint B is **complete** — backend, Storage/upload finalization, template-aware validation, the full server-action layer, the complete staff UI, the customer portal presentation, the marketing-site public-intake fix, and permanent automated coverage for every category in the approved plan are all implemented and verified against `premier-crm-e2e` only. A subsequent independent senior-review audit found and fixed 4 real blocking defects (all cross-org authorization gaps in the TypeScript layer — the SQL/RPC layer was clean) — see §13. **Not applied to `premier-crm-prod`. Draft PR remains unmerged.**

**Branch:** `feature/request-site-visit-estimate-workflow`
**Supersedes:** the design in `C:\Users\somme\.claude\plans\mighty-watching-raven.md` (the approved plan) — this document records what was actually built, which matches that plan except where a real bug or a real regression forced a deviation (both are called out explicitly below).

This report is organized to separate what was built from how it was proven, per the explicit documentation requirement for the final checkpoint:

1. What this is
2. Completed backend (schema, RPCs, triggers, capability system)
3. Completed Storage / upload finalization
4. Completed staff UI
5. Completed customer portal presentation
6. Marketing-site (second repo) fix
7. Automated test coverage inventory
8. Manual verification record (anything not converted to a permanent spec, with justification)
9. Known limitations
10. Production migration sequence (not performed)
11. Rollback considerations
12. Final validation results
13. Senior-review audit findings and fixes (post-Checkpoint-B)

---

## 1. What this is

The request-to-quote lifecycle previously had no dedicated site-visit workflow: a fresh draft estimate could go straight to "create quote" with zero site-visit data ever captured. This work adds:

- An explicit, audited triage decision on every service request: **remote estimate**, **site visit required**, or **direct work order**.
- A site-visit lifecycle (`site_visits`) that originates from the **service request**, not from an estimate — an estimate is a later, optional *product* of a completed visit, never its parent.
- Structured appointment history (`site_visit_appointments`) — rescheduling never overwrites a prior appointment, it supersedes it.
- Versioned, immutable-once-published inspection templates.
- A private, quarantine-then-finalize Storage upload architecture for site-visit photos, with server-side EXIF/GPS stripping.
- Database-enforced (not just UI-enforced) estimate pricing review and quote-eligibility gating.
- A four-way capability split (`canEditEstimate` / `canApproveEstimatePricing` / `canCreateQuote` / `canSendQuote`) so an owner can approve pricing while an employee creates and sends the resulting quote, without the employee ever holding pricing-approval authority.
- A customer-safe RPC projection for site-visit status — no RLS `SELECT` policy was added on `site_visits` for the customer role at all, since RLS is row-level and cannot hide columns like `inspection_responses` within an authorized row.
- A complete staff UI (triage panel, site-visit detail page, estimate review with line items and pricing approval) and a customer portal presentation, both described below.

---

## 2. Completed backend

### New tables

| Table | Purpose | Key constraints |
|---|---|---|
| `site_visits` | One per service request | `UNIQUE(service_request_id)`; **no `estimate_id` column** — the only estimate-pointing relationship is `estimates.source_site_visit_id`, one direction only |
| `site_visit_appointments` | Structured scheduling history | Partial unique index: at most one `status='scheduled'` row per visit. Reschedule = cancel old + insert new with `supersedes_appointment_id` |
| `inspection_templates` | Real parent table for templates | `org_id NULL` = platform default |
| `inspection_template_versions` | Immutable-once-published versions | `UNIQUE(inspection_template_id, version)`; trigger blocks any `field_definitions`/`response_schema_version` change or delete once `publication_status != 'draft'` |
| `estimate_line_items` | Estimate line items, system-suggested vs. staff-reviewed | `is_system_suggested BOOLEAN` |
| `pending_uploads` | Private quarantine for original (pre-sanitization) photo uploads | `status IN ('pending','finalized','rejected','cancelled')`, `expires_at` for stale-cleanup |

### Modified tables (all additive)

| Table | New columns |
|---|---|
| `service_requests` | `triage_decision`, `triage_reason`, `triaged_by`, `triaged_at`, `triage_corrected_from`, `triage_corrected_at`, `triage_corrected_by`, `triage_correction_reason` |
| `estimates` | `source_site_visit_id UUID UNIQUE REFERENCES site_visits(id)`, `pricing_reviewed_at`, `pricing_reviewed_by` — **no `site_visit_status` column exists anywhere** |
| `jobs` | `authorization_type`, `authorized_customer_contact`, `authorized_at`, `authorization_note`, `not_to_exceed_amount`, `authorization_reference` |
| `vault_items` | `site_visit_id`, `estimate_id`, `storage_object_key UNIQUE` |
| `activity_log` | `related_ids JSONB` + a partial expression index on `related_ids->>'service_request_id'` |
| `organizations` | `timezone` column already existed; its **default changed from `'America/New_York'` to `'UTC'`** (portable), and Premier's own row was explicitly re-set to `'America/New_York'` by ID |

### Read-optimization view

`estimate_visit_state` — joins `estimates.source_site_visit_id → site_visits`, staff-only, DB-maintained (never a manually-synced column).

### State machines

**`site_visit_status`**: `awaiting_scheduling → scheduled → in_progress → completed`, with `→ cancelled` from either of the first two, and `scheduled → awaiting_scheduling` (appointment cancelled with no replacement). Terminal: `completed`, `cancelled`.

**`site_visit_appointments.status`**: `scheduled | cancelled | completed`. Reschedule = one transaction: cancel the active row + insert a new `scheduled` row with `supersedes_appointment_id` pointing at the old one. The old row's `scheduled_start/end` are never modified.

**Estimate pricing state**: `pricing_reviewed_at IS NULL` (draft/editable) → `approve_estimate_pricing()` sets it → editing `estimate_line_items`/`estimates.description` is blocked by trigger until `reopen_estimate_for_edit()` (itself blocked if an active quote already exists).

**`pending_uploads.status`**: `pending → finalized | rejected | cancelled`. `finalized_vault_item_id` links to the resulting permanent `vault_items` row once done.

### RPC / trigger security model

Every mutation goes through a `SECURITY DEFINER` RPC, following the same seven-point validation used throughout: authenticated actor → active org membership → capability → entity org ownership → current state → idempotency → required fields.

| RPC | Capability | Notes |
|---|---|---|
| `record_request_triage` | `canTriageRequests` (+`canCreateDirectWorkOrder` for that path) | Creates the estimate/site_visit/job in the same transaction as recording the decision |
| `correct_request_triage` | `canTriageRequests`, owner/admin only | Tears down the untouched downstream draft, records the correction, applies the new decision |
| `schedule_site_visit` / `reschedule_site_visit` / `cancel_site_visit_appointment` / `cancel_site_visit` | `canScheduleJobs` | |
| `start_site_visit` / `undo_site_visit_start` | `canScheduleJobs` or the visit's own `assigned_user_id` | `undo` blocked once any findings are saved |
| `complete_site_visit` | `canEditEstimate` | |
| `save_site_visit_inspection` | **no `authenticated` grant — service-role only** | See below |
| `generate_estimate_from_site_visit` | `canEditEstimate` | Idempotent (looks up by `source_site_visit_id`, catches `unique_violation` as a race backstop) |
| `approve_estimate_pricing` / `reopen_estimate_for_edit` | `canApproveEstimatePricing` | |
| `create_quote_from_estimate` | `canCreateQuote` | Requires pricing already approved by someone else who held `canApproveEstimatePricing` — the caller doesn't need that capability itself |
| `get_my_site_visit_summary` | customer, via `customer_accounts` join | Returns only `site_visit_id`, `safe_status`, `scheduled_start/end`, `is_rescheduled`, `is_cancelled` — nothing else, by construction |

**Quote eligibility is enforced twice**: once inside `create_quote_from_estimate()`, and independently by a `BEFORE INSERT` trigger on `quotes` (`enforce_quote_eligibility()`), scoped to only estimates whose request has `triage_decision IS NOT NULL` (the pre-existing manual-estimate flow is unaffected).

**Capability parity**: `packages/shared/permissions.ts`'s `CAPABILITIES` map and SQL `role_has_capability()` are hand-written from the same reviewed matrix and proven identical by an automated test enumerating 5 roles × 19 capabilities = 95 pairs. A mismatch here is treated as a security defect, not a UX bug.

### Inspection-response validation boundary

Two layers, deliberately not one:

- **Trusted server action** (`packages/shared/schemas/site-visit-inspection.ts`, Zod, full template-aware validation): field keys/types/options/units against the visit's bound `inspection_template_versions.field_definitions`. Wired into `saveSiteVisitInspectionAction()` (`apps/web/app/(app)/site-visits/actions.ts`), which also verifies any referenced photo `vault_items` belong to the same org/site visit (a DB check Zod alone can't perform).
- **`save_site_visit_inspection()` RPC** (coarse DB checks only): actor/org/state, JSON-object shape, a 1MB size ceiling, template-version consistency, post-completion immutability.

Because of that gap, `save_site_visit_inspection`'s `EXECUTE` grant is revoked from `authenticated` — only `service_role` may call it. Verified directly: a real authenticated client gets `permission denied`; the service-role path (via the server action) succeeds.

---

## 3. Completed Storage / upload finalization

Verified end-to-end in two dedicated spikes (Checkpoint A and A.1) before any schema was written, then implemented as real migrations and a real server action:

- Private bucket `site-visit-attachments`, `image/jpeg`/`image/png` only (HEIC/HEIF excluded — sharp's prebuilt binary doesn't support it), 15MB limit.
- Client uploads the **original** file to a private quarantine path `{org_id}/pending/{upload_id}` via a short-lived signed upload URL, issued by `requestSiteVisitPhotoUploadAction()` only after server-side validation (MIME allow-list, size, per-entity file-count cap).
- `finalizeSiteVisitUpload()` (`apps/web/lib/site-visit-attachments.ts` — the only file in the app that imports `sharp`, added as a runtime dependency of `apps/web/package.json` only, never the workspace root) downloads the pending object, verifies actual decoded content (not just declared MIME), processes it with `sharp(buffer).rotate().jpeg({quality:85}).toBuffer()` (bakes orientation, strips all EXIF/GPS since `.withMetadata()` is never called), writes the sanitized result to the deterministic permanent path `{org_id}/{entity_type}/{entity_id}/{upload_id}.jpg`, creates the `vault_items` row (`UNIQUE(storage_object_key)` makes retries idempotent), and deletes the pending object.
- No Storage policy of any kind permits a client to write directly to the permanent path — only the pending prefix.
- Real-phone orientation test: source `4032×3024`, EXIF orientation tag `6`; processed output `3024×4032` (correctly swapped), zero EXIF bytes remaining.
- `pending_uploads.expires_at` (default 1 hour) makes "which pending uploads are stale" a trivial indexed query; a scheduled cleanup worker is deferred (documented below), but the data needed to build one already exists.
- The client-side upload flow is wired into the staff UI's `PhotoUpload` component (`apps/web/app/(app)/site-visits/_components/photo-upload.tsx`), used from the mobile inspection form's `photo_list` fields.

---

## 4. Completed staff UI

All routes below are real Next.js App Router pages/components, typechecked and included in a clean production build (`pnpm --filter web build`).

| Screen | Path | Capabilities exercised |
|---|---|---|
| Request detail — triage panel | `apps/web/app/(app)/requests/[taskId]/page.tsx` (+ `_components/triage-panel.tsx`) | Decision recording (all three paths, including structured direct-work-order authorization fields), decision display, owner/admin correction sub-form |
| Site-visit detail | `apps/web/app/(app)/site-visits/[siteVisitId]/page.tsx` | Scheduling/rescheduling (`_components/schedule-form.tsx`), appointment cancellation, start/undo-start/cancel-visit (`_components/lifecycle-buttons.tsx`), mobile-first inspection form with debounced per-field autosave and save-state indicator (`_components/inspection-form.tsx`), photo upload/finalization (`_components/photo-upload.tsx`), inspection completion, generate-estimate action (`_components/generate-estimate-button.tsx`) with navigation to the resulting estimate |
| Estimate review | `apps/web/app/(app)/estimates/[estimateId]/page.tsx` (+ `_components/line-items-section.tsx`, `_components/pricing-review-panel.tsx`) | Line-item add/edit/remove (locked once pricing is approved, enforced by the DB trigger — not just hidden in the UI), system-suggested badge, pricing status display, approve/reopen, gated create-quote (only shown once pricing is approved for triage-originated estimates; the pre-existing manual-estimate quote button is hidden for triage-originated estimates to avoid a redundant, ungated entry point) |
| Direct work order | Folded into the request triage panel's `direct_work_order` decision branch (`_components/triage-panel.tsx`'s `AuthorizationFields`) | Structured `authorization_type` (`internal` / `standing_agreement` / `written_customer_authorization` / `verbal_customer_authorization` / `emergency`) with conditionally-required companion fields, owner/admin-gated by the RPC itself |

The request-triage panel and the estimate-review panel intentionally coexist with the pre-existing, older manual estimate/job creation flow on the request page — the older flow remains for organizations/workflows not using triage. For a triage-originated estimate, the older ungated "Approve → create quote" button is suppressed so there is exactly one, gated path to quote creation.

---

## 5. Completed customer portal presentation

`apps/web/app/portal/dashboard/page.tsx` now calls `getMySiteVisitSummary()` — which wraps the `get_my_site_visit_summary()` RPC — for every one of the signed-in customer's service requests, using the **portal-scoped, RLS-authenticated** Supabase client (never the service-role client). Each request card in the portal shows, when a site visit exists: a safe status label, the scheduled window (if any), and whether it's been rescheduled. Nothing else from `site_visits` is read anywhere in the portal.

**Proof that direct base-table access is denied**: `tests/e2e/request-site-visit-workflow-bot.spec.ts` test 9 signs in as the real portal customer and asserts `custClient.from('site_visits').select('*')` returns no rows (RLS has no customer-facing `SELECT` policy on `site_visits` at all — the RPC is the only path), while the same customer's call to `get_my_site_visit_summary()` succeeds and returns exactly the six safe fields (`site_visit_id`, `safe_status`, `scheduled_start`, `scheduled_end`, `is_rescheduled`, `is_cancelled`) — verified by asserting the exact key set, not just presence of data.

---

## 6. Marketing-site (second repo) fix

**Repository:** `Modern Service System Website` (separate git repo, `ppmnky.com`'s codebase — not a workspace package of Premier-CRM).
**Branch:** `fix/state-code-validation`
**Commit:** `e87976a` — `fix: constrain state field to a real two-letter state/DC list`
**Status:** committed, **not pushed**, isolated to `src/app/pages/RequestService.tsx` only (this repo has extensive unrelated tracked `node_modules` changes that were deliberately left untouched).

**What changed**: the public intake form's `state` field was a free-text `<input>`; it is now a `<select>` populated from a `US_STATE_CODES` constant (50 states + DC), mirroring the CRM API's own allow-list added in this same effort (`packages/shared/schemas/website-service-request-payload.ts`). Since there is no shared package between the two repositories, the constant is duplicated with an explicit comment noting the manual-sync requirement.

**`preferredDateTime`**: already a native `<input type="datetime-local">` in this form prior to this session — no further client-side fix was needed. The CRM API side (`apps/web/app/api/v1/service-requests/route.ts`) independently tightened its own validation to reject anything that isn't a well-formed `datetime-local` string, which is what actually closes the original bug (a stray free-text value reaching the database).

**Verification**: `npx tsc --noEmit -p tsconfig.json` clean; `pnpm build` (`vite build`) clean. No test runner is configured in this repository (`package.json` has no `test` script), so build + typecheck is the full available verification surface.

**Deployment implications**: this commit is not deployed and not merged. Deploying it requires a separate decision — it changes the public-facing `ppmnky.com` intake form, a different Vercel project from the CRM. Not performed as part of this checkpoint.

---

## 7. Automated test coverage inventory

All of the following are permanent, named test cases (not one-off manual verification), run via `pnpm test` (Vitest) or `npx playwright test` (E2E), and re-verified in the final validation pass (§12).

**`tests/e2e/request-site-visit-workflow-bot.spec.ts`** — 19 tests total, real API calls with real signed-in sessions (never service-role for the action under test):

*Golden path, gating, isolation (tests 1–10):* triage creates only a `site_visits` row; schedule + reschedule preserves appointment history; start → findings save (server-action-only boundary) → complete; idempotent/concurrency-safe estimate generation; quote creation rejected pre-approval (RPC **and** raw-trigger-bypass both proven); subcontractor capability separation (negative case); owner approves pricing + line-item edit-lock; employee creates quote after approval (positive case) with line-item snapshot verification + subcontractor denial; customer-safe summary field-set proof + direct base-table denial; cross-org denial.

*Lifecycle guards, corrections, DWO authorization (tests 11–18, added this pass):*
11. Appointment uniqueness — a raw `INSERT` of a second `scheduled` appointment for the same visit is rejected by the partial unique index, even bypassing the RPC.
12. Visit transition protection — completing an unstarted visit is rejected; a raw `scheduled → completed` jump (skipping `in_progress`) is rejected by the transition trigger.
13. Partial inspection autosave — a responses patch persists and the visit remains `in_progress` without completing.
14. Completed inspection immutability — further `save_site_visit_inspection` calls after completion are rejected.
15. Reopen-for-edit — subcontractor reopen attempt denied; owner reopen clears `pricing_reviewed_at` and unlocks line-item edits.
16. Triage correction matrix — subcontractor correction attempt denied; a correctable (untouched) site visit is corrected and its old row is actually deleted; correcting a visit that has already progressed (started/completed) is rejected.
17. Structured direct-work-order authorization — missing `authorization_type` rejected; `written_customer_authorization` missing contact/timestamp rejected; complete data succeeds and the resulting job's authorization columns are verified.
18. Timeline linkage/ordering — `activity_log` rows for a request, queried via the `related_ids->>'service_request_id'` expression index, are chronologically ordered (`created_at, id`) and include events from every stage exercised.

*Capability parity (test 19):* all 95 role×capability pairs match between `packages/shared/permissions.ts` and SQL `role_has_capability()`.

**`apps/web/lib/site-visit-attachments.test.ts`** — 6 tests (real Vitest integration test against `premier-crm-e2e`, using `sharp` directly): valid JPEG end-to-end + EXIF-strip + idempotent retry, PNG-declared-as-JPEG rejection, decompression-bomb rejection, undecodable-content rejection, unsupported-MIME rejection, and a real phone-photo fixture proving orientation-swap + EXIF strip on genuine camera output.

**`apps/web/app/api/v1/service-requests/route.test.ts`** — includes two tests added this pass proving `parsePreferredDateTime()` is timezone-safe by construction (it parses the `datetime-local` string as literal wall-clock text and never constructs a `Date` object or converts zones): a value inside a DST spring-forward window parses unambiguously, and the identical value parses identically regardless of the org's configured timezone (Eastern vs. Pacific fixture).

**A genuine bug found and fixed by this new coverage** (test 16, triage correction): `correct_request_triage()`'s cleanup-of-the-old-downstream-row logic used `IF v_site_visit IS NOT NULL THEN` on a `record` variable — a row-wise test requiring **every** field to be non-null, not "was a row found." Since a fresh `site_visits`/`estimates`/`jobs` row always has several legitimately-nullable columns, this check silently evaluated false even when a row existed, so the correction's cleanup step never actually ran. Fixed in `supabase/migrations/20260802020700_fix_correct_triage_record_null_check.sql` by testing the primary-key column specifically (`v_site_visit.id IS NOT NULL`), which has no such pitfall. Verified: all three affected branches (`remote_estimate`, `site_visit_required`, `direct_work_order`) audited for the same pattern; only these three were affected (every other `record IS NULL` check in this migration set is the safe direction — "was nothing found," which the row-wise NULL test handles correctly).

---

## 8. Manual verification record

Everything from the original approved test-category list (~25 categories) is now permanent automated coverage — see §7. Nothing remains manual-only. The following were verified manually **during earlier spikes** (Checkpoint A/A.1) before the corresponding permanent coverage existed, and are noted here for completeness even though they are now superseded by §3's and §7's permanent tests:

- Cross-org Storage/DB denial (Checkpoint A spike) — now covered permanently by the upload-finalization integration test's org-scoping and by the workflow bot's cross-org test.
- Signed-upload-URL mechanics and retry-safety (Checkpoint A/A.1 spikes) — now covered permanently by `site-visit-attachments.test.ts`'s idempotent-retry case.

No category was left as manual-only without a technical reason; there is no remaining gap between the approved plan's test-category list and this codebase's permanent suite.

---

## 9. Known limitations and follow-up items

- **SQL/TypeScript capability dual-maintenance**: both sides are hand-written from the same reviewed matrix; the parity test catches drift but doesn't prevent it structurally. A shared single-source-of-truth generation remains deferred technical debt (explicitly acknowledged in the approved plan).
- **Employee pricing-approval default** (`canApproveEstimatePricing` = owner/admin only) is a deliberate initial business-policy choice, not a technical default — changeable later with a one-line capability-map edit, not a schema change.
- HEIC/HEIF upload support remains unavailable (sharp's prebuilt binary limitation) — JPEG/PNG only for v1.
- `pending_uploads` stale-cleanup is a deferred scheduled job — the indexed `expires_at` column needed to build one already exists, but no worker has been written.
- The marketing-site fix (§6) is committed but not pushed or deployed — a separate decision, out of scope for this checkpoint.
- `docs/PREMIER_PLATFORM_VISION.md` does not exist and was not created — per the existing roadmap this is an explicit Milestone B/Phase 5 deliverable, not part of this checkpoint's approved documentation plan.
- **`employee-onboarding-admin-invite-bot.spec.ts`** — see §12 for its final re-run result and regression-comparison against `origin/main`.
- Migration version numbers actually recorded in `premier-crm-e2e`'s `schema_migrations` table (timestamps like `20260802163116`, assigned by the raw `apply_migration` MCP tool at apply-time) do not match this branch's local migration filenames (`20260802010000`–`20260802020700`, assigned in authoring order). This is cosmetic to the e2e sandbox's migration history only — a real deployment via `supabase db push` reads from the local files in filename order and will assign its own sequential version numbers, which is what actually matters for production. Documented here rather than silently left unexplained.

---

## 10. Production migration sequence (not performed)

1. Dry-run all 18 migrations (`supabase/migrations/20260802010000_*.sql` through `20260802020700_*.sql`, in filename order) against `premier-crm-prod` (`apnbpcauqrjvkoleisde`) via `supabase db push --dry-run`, confirm the plan matches what's applied to e2e.
2. Apply migrations to prod. Production is currently a verified blank slate for customer/property/workflow data (see `docs/production/cleanup/2026-08-01-production-cleanup.md`), so this is a zero-data-risk schema change in practice, but standard dry-run discipline still applies.
3. Regenerate `packages/db/types.ts` against prod (or confirm the e2e-generated types already match, since the schema is identical after step 2).
4. Confirm/set `organizations.timezone` for the real Premier org row (the migration's data-update targets Premier's org by ID explicitly, so this should already be correct — verify, don't assume).
5. Merge this branch to `main` only after this report is reviewed and approved.
6. Deploy `apps/web`. Confirm `sharp` is present as a production runtime dependency (it is already committed to `apps/web/package.json`, not the workspace root — verify the deployed build actually includes it, since a missing native dependency would fail silently until the first upload).
7. Smoke-test the real flow against prod with a real (non-fixture) request: triage → schedule → complete a site visit with at least one real photo upload → generate estimate → approve pricing → create and send a quote. Include at least two visibly-rotated real phone photos in the smoke test, per the standing instruction from Checkpoint A.1.

**Explicitly not performed, and not to be performed without further explicit approval**: applying these migrations to prod, deploying `apps/web` or the marketing site, creating the Demonstration organization, onboarding Brandon, tagging Platform v1.0, or beginning Base44 work.

---

## 11. Rollback considerations

- **Migrations are additive only** — no existing column was altered destructively and no existing table was dropped. `organizations.timezone`'s default changed from `'America/New_York'` to `'UTC'`, but Premier's own row is explicitly set by ID in the same migration, so no real-org behavior changes.
- **If a rollback is needed after applying to prod but before any real triage decisions exist**: the new tables (`site_visits`, `site_visit_appointments`, `inspection_templates`, `inspection_template_versions`, `estimate_line_items`, `pending_uploads`) can be dropped and the additive columns on `service_requests`/`estimates`/`jobs`/`vault_items`/`activity_log` can be dropped, with zero data loss, since nothing pre-existing depends on them.
- **If real triage decisions/site visits/estimates exist by the time a rollback is needed**: dropping the new tables would destroy real operational data (visit findings, appointment history, photos' `vault_items` rows). At that point, rollback is a data-migration decision, not a schema-revert — out of scope to pre-plan in the abstract; assess against the actual data present at rollback time.
- **The `enforce_quote_eligibility` trigger and the `save_site_visit_inspection` grant revocation are the two changes with the widest blast radius if reverted incorrectly**: removing the trigger would silently re-open the ability to create a quote for an unapproved triage-originated estimate; removing the grant revocation would silently re-open direct-client bypass of the Zod validation boundary. Neither should be reverted without re-deriving why they were added (§2).
- **Storage**: the `site-visit-attachments` bucket and its RLS policies are additive; removing them would only affect this feature's uploads, not any pre-existing bucket.

---

## 12. Final validation results

- **`pnpm typecheck`**: clean across all packages (`apps/web`, `packages/db`, `packages/shared`, `packages/ai`, `packages/automation`).
- **`pnpm --filter web build`** (real production build): clean. Two pre-existing lint warnings in files this work didn't touch (unrelated unused-variable warnings in `jobs/[jobId]/page.tsx` and `quotes/_components/line-item-editor.tsx`), not errors, not regressions.
- **`pnpm test`** (Vitest, full suite): 104/104 pass, including the 6 real upload/finalization integration tests and the 2 new DST/non-Eastern-timezone tests.
- **`tests/e2e/request-site-visit-workflow-bot.spec.ts`**: 20/20 pass (10 golden-path/gating/isolation + 1 new IDOR regression test (§13) + 8 lifecycle-guards/corrections/DWO-authorization + 1 capability-parity, enumerating 95 role×capability pairs).
- **Full existing E2E suite, final re-run after the §13 defect fixes** (serial, `CI=1 --workers=1`, matching this repo's actual CI configuration, 163 total specs): **122 passed, 3 failed, 24 skipped, 14 did not run.** All 3 failures and all 14 "did not run" (their `test.describe.serial` siblings) are confined to the single pre-existing, unrelated file `employee-onboarding-admin-invite-bot.spec.ts` — see below. No other file failed. Two earlier full-suite attempts in this checkpoint hit an unrelated dev-server-health artifact (documented below) before this clean result.
- **`employee-onboarding-admin-invite-bot.spec.ts`**: failed 3 of its `describe.serial` blocks on this run (1 on the prior clean run before the §13 fixes) — the specific number of affected blocks varies run to run, consistent with genuine Supabase Auth invite-propagation timing flakiness rather than a deterministic bug. **Confirmed pre-existing and unrelated to this branch by direct comparison**: the identical test, identical assertion ("invited user should exist in auth.users by now"), identical failure point, was run against a **clean `origin/main` worktree** (a separate checkout, separate dev server on port 3001, same `premier-crm-e2e` project) under equivalent conditions and failed identically. This spec file does not touch any table, RPC, route, or component this branch modifies (triage/site-visits/estimates/vault-items/inspection templates); it exercises `admin.inviteUserByEmail()` timing/propagation, an orthogonal auth-infrastructure concern. Not fixed here per the explicit instruction not to absorb unrelated fixes into this branch.
- **Invoice-flake comparison**: `data-consistency-bot.spec.ts`'s "invoice total equals the sum of its line items" test was run 4 times in isolation with retries disabled — 1 failure, 3 passes (~25% flake rate). It targets `/invoices`, a route untouched by this branch. It passed in the final full-suite run. Classified as pre-existing flakiness, unrelated to this branch.
- Two earlier full-suite attempts in this checkpoint showed 47 additional failures, all timing out at an identical `#email` locator on `/login` — traced to **three simultaneously-running `pnpm dev` processes** competing for port 3000 (an artifact of this session's own process management, not a code issue), causing intermittent `503`s on Next.js's static JS chunks so the client bundle never loaded. Fixed by killing all stray Node processes, clearing `.next`, and running exactly one dev server; re-verified clean immediately after (`auth-bot`: 6/6). A second, unrelated artifact recurred once more mid-audit: running `pnpm --filter web build` (a production build) while the dev server was live corrupted the shared `.next` directory's webpack module IDs — fixed the same way (stop dev server before any build, clear `.next`, restart after).
- **Marketing-site repo** (`Modern Service System Website`, branch `fix/state-code-validation`): `tsc --noEmit` clean, `vite build` clean.
- **Migration consistency**: all 18 feature migrations present locally and applied to `premier-crm-e2e` in matching logical order (see §9 for the version-numbering caveat). Zero writes of any kind performed against `premier-crm-prod` at any point in this session — confirmed before every migration and every test run via `playwright.config.ts`'s hard production-ref guard and manual review before each Supabase MCP call.
- **DB types**: `packages/db/types.ts` already reflects the full e2e schema (generated in an earlier pass of this checkpoint); this pass's one migration (the `correct_request_triage` bug fix) changes only a function body, not any table/column shape, so no regeneration was required.

---

## 13. Senior-review audit findings and fixes (post-Checkpoint-B)

After Checkpoint B was reported complete, an independent final merge-readiness audit was performed against the full PR #80 diff (a fresh code/security review plus a full migration review, each done by a separate reviewer with no access to this document's claims until after forming their own conclusions). The migration/SQL-layer audit came back clean — see §2's RPC table and the migration files themselves; no blocking defects were found there. The TypeScript/application-layer audit found **4 real blocking defects**, all in the same family: authorization checks that the design intended but the implementation didn't actually perform. All 4 are fixed in this branch.

1. **Cross-org read of site-visit detail (IDOR).** `getSiteVisitById()` (`packages/db/queries/site-visits.ts`) took no `orgId` and queried `site_visits` by ID alone, called from the site-visit detail page using the **service-role client** (which bypasses RLS entirely). Any authenticated staff user of any org could view any other org's site visit — including inspection responses, customer PII, and cancellation reasons — by navigating to `/site-visits/{uuid}`. **Fixed**: `getSiteVisitById()` now takes and filters on `orgId`; the page passes the caller's own org. A permanent regression test (`request-site-visit-workflow-bot.spec.ts`, test 10b) proves a cross-org lookup now returns `NOT_FOUND`.

2. **Cross-org write of inspection findings.** `save_site_visit_inspection()` runs as `service_role` and, by design, cannot check `auth.uid()`-based org membership itself (documented in §4/§5) — that responsibility was supposed to sit in the calling server action, `saveSiteVisitInspectionAction()`, but the action never actually performed the check. Any authenticated staff user of any org could overwrite another org's in-progress site-visit inspection data, given the visit ID (which defect 1 made trivially discoverable before its own fix). **Fixed**: the action now verifies the target visit belongs to the caller's org (via the RLS-scoped client) before validating or saving anything.

3. **`remote_estimate` triage path was functionally dead-ended for quote creation.** The estimate page only showed the pricing-approval UI (and hid the legacy ungated "Create quote" button) when `estimate.sourceSiteVisitId` was set — which is never true for `remote_estimate`-triaged estimates (they have no source site visit). But the DB trigger `enforce_quote_eligibility()` gates *any* estimate whose source request went through triage (`triage_decision IS NOT NULL`), which includes `remote_estimate`. There was no UI path to approve pricing for a `remote_estimate` estimate, so its only visible "Create quote" button always failed with a DB exception. **Fixed**: `EstimateDetail` now carries `isQuoteEligibilityGated` (true whenever the source request's `triage_decision IS NOT NULL`, regardless of path), and the page gates on that instead of `sourceSiteVisitId` specifically — both triage paths now show the correct, working pricing-approval UI.

4. **Subcontractor capability bypass on the legacy quote-creation button.** The pre-existing `createQuoteFromEstimateAction` (wired to the button defect 3 caused to render incorrectly) authorized via `canCreateEstimates` — which subcontractors hold, since they're allowed to draft/edit estimates — never `canCreateQuote`, which subcontractors do not hold. The new `enforce_quote_eligibility` trigger only checks *state* (pricing approved, visit completed), not actor capability, so this path was a real capability bypass for any reachable estimate. **Fixed**: the action now explicitly checks `canCreateQuote` in addition to the existing `canCreateEstimates` context check, independent of the defect-3 UI fix (defense in depth — the two together mean a subcontractor cannot reach quote creation through this action even if some future change re-exposes the button).

**A related, lower-severity gap** was found and fixed at the same time, in the same family: `requestPendingUpload()`/`finalizeSiteVisitPhotoUploadAction()` never verified that the `site_visit_id`/`estimate_id` a photo upload targets, or the `pending_uploads` row being finalized, actually belongs to the caller's org. Exploitability is lower than defects 1-2 (upload IDs are random UUIDs never displayed anywhere a user could discover them, unlike the defect-1-exposed site-visit ID), but the same org-ownership check was added to both functions for consistency and defense-in-depth.

**What was verified after fixing:**
- `pnpm typecheck` and `pnpm --filter web build`: clean after all 4+1 fixes.
- `tests/e2e/request-site-visit-workflow-bot.spec.ts`: 20/20 pass (19 from Checkpoint B + the new IDOR regression test).
- Full serial E2E suite re-run after the fixes — see the updated §12 for final totals.
- Defects 2, 3, and 4's fixes are TypeScript/Next.js Server Action and page-render logic, not RPCs — the existing E2E infrastructure calls RPCs directly and doesn't exercise Server Actions or rendered pages, so **only defect 1 got a new dedicated automated regression test** in this pass. Defects 2-4 were verified by direct code reading (confirming the fix matches the vulnerability exactly), full-suite regression (confirming nothing broke), and typecheck/build. This is stated plainly as a real limitation, not glossed over: a future pass should add Server-Action-level test coverage (e.g., via a lightweight harness that imports and calls the actions directly with a mocked/real Supabase client) for the same reason the RPC layer already gets this coverage — a passing typecheck proves types line up, not that authorization logic is correct.

**Why the original code review and the E2E suite didn't catch these**: the E2E workflow bot deliberately tests at the RPC layer (documented in its own file header: "real API calls with real signed-in sessions... never the service-role key for the actions under test"), which is exactly why it proved the *SQL* layer's org/capability checks are correct — but none of these 4 defects were in the SQL layer. They were all in the TypeScript server-action/query/page layer that sits *in front of* the RPCs, deciding what data to fetch and which client (service-role vs. RLS-scoped) to fetch it with. This is a genuine gap in the original design/build process's own verification, not a flaw in the RPC-security-model approach itself — it's exactly why an independent, adversarial final audit (rather than only the original author's own regression suite) is valuable before merge.
