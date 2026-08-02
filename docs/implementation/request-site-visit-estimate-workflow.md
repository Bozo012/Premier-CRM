# Request → Site Visit → Estimate → Quote Workflow — Implementation Report

**Status as of this document:** implemented and verified against `premier-crm-e2e` only. **Not applied to `premier-crm-prod`.** Backend (schema, RPCs, triggers, capability system), the real upload/finalization workflow (server-side sharp processing, quarantine-then-finalize), template-aware inspection validation, the full server-action layer, and the public-intake timezone/state fix are all complete and tested. Full UI screens are **not** built in this pass — see "What is not built yet" below. This is an update to the original backend-only report — see §11 for what changed since.

**Branch:** `feature/request-site-visit-estimate-workflow`
**Supersedes:** the design in `C:\Users\somme\.claude\plans\mighty-watching-raven.md` (the approved plan) — this document records what was actually built, which matches that plan except where a real bug or a real regression forced a deviation (both are called out explicitly below).

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

---

## 2. Final schema

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

`estimate_visit_state` — joins `estimates.source_site_visit_id → site_visits`, staff-only, DB-maintained (never a manually-synced column). This is how badges/filters read "does this estimate need a completed visit" without a denormalized status column.

---

## 3. State machines

**`site_visit_status`**: `awaiting_scheduling → scheduled → in_progress → completed`, with `→ cancelled` from either of the first two, and `scheduled → awaiting_scheduling` (appointment cancelled with no replacement). Terminal: `completed`, `cancelled`. No `not_required` value (a remote-estimate-path request simply never gets a `site_visits` row). No `rescheduled` value (that's an appointment-table event, not a visit-status value).

**`site_visit_appointments.status`**: `scheduled | cancelled | completed`. First scheduling inserts one `scheduled` row. Reschedule = one transaction: cancel the active row (`cancellation_reason`, `cancelled_at/by`) + insert a new `scheduled` row with `supersedes_appointment_id` pointing at the old one. The old row's `scheduled_start/end` are never modified.

**Estimate pricing state**: `pricing_reviewed_at IS NULL` (draft/editable) → `approve_estimate_pricing()` sets it → editing `estimate_line_items` or `estimates.description` is now blocked by trigger until `reopen_estimate_for_edit()` is called (which itself is blocked if an active quote already exists).

**`pending_uploads.status`**: `pending → finalized | rejected | cancelled`. `finalized_vault_item_id` links to the resulting permanent `vault_items` row once done.

---

## 4. RPC / trigger security model

Every new mutation goes through a `SECURITY DEFINER` RPC, following the same seven-point validation used throughout: authenticated actor → active org membership → capability → entity org ownership → current state → idempotency → required fields. This mirrors the existing `change_order_revisions` RPC-only precedent already in this codebase.

| RPC | Capability | Notes |
|---|---|---|
| `record_request_triage` | `canTriageRequests` (+`canCreateDirectWorkOrder` for that path) | Creates the estimate/site_visit/job in the same transaction as recording the decision |
| `correct_request_triage` | `canTriageRequests`, owner/admin only | Tears down the untouched downstream draft, records the correction, applies the new decision |
| `schedule_site_visit` / `reschedule_site_visit` / `cancel_site_visit_appointment` / `cancel_site_visit` | `canScheduleJobs` | |
| `start_site_visit` / `undo_site_visit_start` | `canScheduleJobs` or the visit's own `assigned_user_id` | `undo` blocked once any findings are saved |
| `complete_site_visit` | `canEditEstimate` | |
| `save_site_visit_inspection` | **no `authenticated` grant — service-role only** | See §5 |
| `generate_estimate_from_site_visit` | `canEditEstimate` | Idempotent (looks up by `source_site_visit_id`, catches `unique_violation` as a race backstop) |
| `approve_estimate_pricing` / `reopen_estimate_for_edit` | `canApproveEstimatePricing` | |
| `create_quote_from_estimate` | `canCreateQuote` | Requires pricing already approved by someone else who held `canApproveEstimatePricing` — the caller doesn't need that capability itself |
| `get_my_site_visit_summary` | customer, via `customer_accounts` join | Returns only `site_visit_id`, `safe_status`, `scheduled_start/end`, `is_rescheduled`, `is_cancelled` — nothing else, by construction |

**Quote eligibility is enforced twice**: once inside `create_quote_from_estimate()`, and independently by a `BEFORE INSERT` trigger on `quotes` itself (`enforce_quote_eligibility()`), which fires for every role including `service_role` — a raw `INSERT INTO quotes` bypassing the RPC entirely is still rejected. **Important scoping fix, found via the full regression run (§7)**: this trigger only gates quotes whose estimate went through the new triage system (`service_requests.triage_decision IS NOT NULL`) — it does not touch the pre-existing manual-estimate → quote flow, which never sets `triage_decision` and must keep working exactly as before.

**Capability parity**: `packages/shared/permissions.ts`'s `CAPABILITIES` map and SQL `role_has_capability()` are hand-written from the same reviewed matrix and are proven identical by an automated test (`tests/e2e/request-site-visit-workflow-bot.spec.ts`, "capability parity" describe block) that enumerates all 5 roles × 19 capabilities = 95 pairs against both implementations. **A mismatch here is treated as a security defect, not a UX bug**, since SQL is the actual enforcement boundary.

---

## 5. Inspection-response validation boundary

Two layers, deliberately not one:

- **Trusted server action (Zod, full template-aware validation)**: field keys/types/options/units against the visit's bound `inspection_template_versions.field_definitions`. **Not yet built** — see §8.
- **`save_site_visit_inspection()` RPC (coarse DB checks only)**: actor/org/state, JSON-object shape, a 1MB size ceiling, template-version consistency, post-completion immutability. It cannot and does not claim to validate arbitrary dynamic field content.

Because of that gap, **`save_site_visit_inspection`'s `EXECUTE` grant is revoked from `authenticated`** — it is only callable by `service_role` (i.e., a server action that has already run Zod validation). This was verified directly: a real authenticated client calling it gets `permission denied for function save_site_visit_inspection`; the service-role path succeeds. Every other RPC remains directly client-callable since their checks are fully expressible in SQL.

---

## 6. Storage architecture

Verified end-to-end in two dedicated spikes (Checkpoint A and A.1) before any schema was written, then implemented as real migrations:

- Private bucket `site-visit-attachments`, `image/jpeg`/`image/png` only (HEIC/HEIF excluded — see §9), 15MB limit.
- Client uploads the **original** file to a private quarantine path `{org_id}/pending/{upload_id}` via a short-lived signed upload URL, issued only after server-side validation (MIME allow-list, size, per-entity file-count cap).
- A trusted server-side finalization step (not yet wired into a real Next.js server action — see §8, but the RPC/pattern is proven) downloads the pending object, verifies actual decoded content (not just declared MIME), processes it with `sharp(buffer).rotate().jpeg({quality:85}).toBuffer()` (bakes orientation, strips all EXIF/GPS since `.withMetadata()` is never called), writes the sanitized result to the deterministic permanent path `{org_id}/{entity_type}/{entity_id}/{upload_id}.jpg`, creates the `vault_items` row (`UNIQUE(storage_object_key)` makes retries idempotent), and deletes the pending object.
- No Storage policy of any kind permits a client to write directly to the permanent path — only the pending prefix.
- Real-phone orientation test (Checkpoint A.1): source `4032×3024`, EXIF orientation tag `6`; processed output `3024×4032` (correctly swapped), zero EXIF bytes remaining.
- HEIC/HEIF: confirmed **not reliably supported** by sharp's prebuilt binary (`sharp.format.heif.input.fileSuffix` is restricted to `.avif` only — a well-documented licensing limitation, consistent across local/CI/Vercel). MIME allow-list narrowed to JPEG/PNG accordingly, per the explicit fallback instruction.
- `pending_uploads.expires_at` (default 1 hour) makes "which pending uploads are stale" a trivial indexed query (`pending_uploads_stale_idx`); a scheduled cleanup worker is deferred, but the data needed to build one already exists.

---

## 7. Verification performed

- **Full golden-path E2E spec** (`tests/e2e/request-site-visit-workflow-bot.spec.ts`, 11 tests, all real API calls with real signed-in sessions, never the service-role key for the actions under test): triage → schedule → reschedule (appointment history preserved) → start → findings save (server-action-only boundary proven) → complete → idempotent/concurrent-safe estimate generation → quote rejected pre-approval (RPC **and** raw-trigger-bypass both proven) → subcontractor blocked from pricing approval/quote creation → owner approves → edit-lock proven → employee creates the quote (capability separation, positive case) → line-item snapshot verified → customer-safe RPC returns only approved fields → direct base-table `SELECT` denied outright → cross-org denial. **All 11 pass.**
- **Capability parity test**: all 95 role×capability pairs match between TypeScript and SQL. **Passes.**
- **Full existing E2E suite regression check**: run twice. The first parallel run showed ~28-30 failures across totally unrelated bots (`auth-bot`'s basic "app loads", `permissions-bot`, etc.) — re-running a sample in isolation showed they passed cleanly, and a full **serial** run (matching this repo's actual CI configuration) came back **130/131 passed**, confirming the parallel-run failures were dev-server/worker contention, not regressions. **The one serial failure** (`employee-onboarding-admin-invite-bot`, "invited user should exist in auth.users by now") is a pre-existing Supabase Auth invite-email/timing issue unrelated to this work — not investigated further as part of this checkpoint, flagged for separate follow-up.
- **One real regression was found and fixed** during this process: the quote-eligibility trigger initially gated *every* estimate-linked quote, which broke the pre-existing, explicitly-protected "manual estimate → approve → quote" flow (`estimates-lifecycle-bot.spec.ts`). Fixed by scoping the gate to only estimates whose request has `triage_decision IS NOT NULL` (i.e., actually went through the new system) — see migration `20260802020600_fix_quote_eligibility_trigger_scope.sql`. Re-verified both the new bot and `estimates-lifecycle-bot` pass together after the fix.
- **`pnpm typecheck`**: clean across all packages (two real errors found and fixed along the way — an over-loose RPC argument cast, and two pre-existing `Record<Capability, string>` exhaustive maps in `invoices/actions.ts` and `quotes/actions.ts` that needed the seven new capability keys added).
- **`pnpm --filter web build`** (the real production build, not just typecheck): clean. Two pre-existing lint warnings in files this work didn't touch (unrelated unused-variable warnings), not errors.
- **Migration application**: all 17 migrations applied directly to `premier-crm-e2e` (`slbnizoskumwhleeiccv`) via the Supabase MCP `apply_migration` tool, each verified individually; `premier-crm-prod` (`apnbpcauqrjvkoleisde`) was never targeted by any write in this session — confirmed before every migration and every test run.
- **TypeScript types regenerated** from the live e2e schema into `packages/db/types.ts`.

**Bugs found and fixed during verification** (all real, all caught by actually running the code, not assumed away):
1. Missing `_apply_triage_decision()` inspection-template binding — `save_site_visit_inspection` always failed with "no valid template version bound" until fixed (`20260802020500`).
2. `REVOKE ... FROM PUBLIC` on `save_site_visit_inspection` also stripped `service_role`'s implicit access — needed an explicit `GRANT ... TO service_role`.
3. PostgREST's schema cache needed an explicit `NOTIFY pgrst, 'reload schema'` after applying new RPCs via the raw `apply_migration` tool (the Supabase CLI's normal `db push` handles this automatically — this is an artifact of the tool used in this session, not something the real migration chain needs to carry).
4. The quote-eligibility trigger scoping regression described above.
5. Three TypeScript errors caught by `pnpm typecheck` (described above).

---

## 8. What is NOT built yet (explicitly deferred, not silently dropped) — updated after §11

- **Full staff UI screens**: request triage panel, site-visit schedule/start/inspection-form/complete screens, estimate review screen, quote-send UI. The full server-action layer these would call is now built and tested (§11), but no React components/routes exist yet.
- **Customer portal presentation**: the `get_my_site_visit_summary()` RPC is built, verified, and proven to return only approved fields — but it is not yet wired into any portal page.
- **Marketing-site (second repo) fix**: the CRM-API half of the public-intake fix (datetime/state validation) is complete and tested; the marketing-site form's own client-side validation (state/DC allow-list, datetime-local input constraints) has not been touched — that repo was not opened in this session.
- **Remaining test categories not preserved as permanent named specs**: template-version-immutability, DST/non-Eastern-timezone parsing, direct-work-order authorization-type validation, triage-correction allowed/forbidden matrix, signed-token-reuse as permanent coverage. (Photo upload/finalization, cross-org Storage denial, and malformed-content/decompression-bomb rejection **are** now permanent coverage — see §11.) The backend logic for the still-missing ones was verified manually during the Checkpoint A/A.1 spikes, but not recaptured as lasting test cases.
- **`docs/PREMIER_PLATFORM_VISION.md`** — does not exist yet; per the existing roadmap this is an explicit Milestone B/Phase 5 deliverable, not part of this checkpoint. Not created here, to avoid getting ahead of the established sequencing.

## 11. Update — upload/finalization, template validation, and server actions (same branch, later in Checkpoint B)

Everything in this section was implemented, typechecked, built, and tested for real after the original report above.

**Real upload/finalization implementation**: `packages/db/queries/vault-items.ts` (pure DB/Storage helpers, no `sharp` dependency by design) + `apps/web/lib/site-visit-attachments.ts` (the trusted `finalizeSiteVisitUpload()`, the only place in the app that imports `sharp` — added as a runtime dependency of `apps/web/package.json` specifically, **not** the workspace root). Verified with a real integration test (`apps/web/lib/site-visit-attachments.test.ts`, run via `pnpm test`/Vitest against `premier-crm-e2e`) covering: EXIF/GPS fully stripped, correct idempotent retry (no duplicate row/object), MIME-mismatch rejection, decompression-bomb rejection, undecodable-content rejection, unsupported-MIME rejection before any upload occurs, and — supplementing the earlier synthetic orientation test — a real phone photo (the same one used in Checkpoint A.1, stored locally at `.test-fixtures/real-phone-photo.jpg`, gitignored) confirming EXIF is stripped and dimensions swap correctly for a non-normal orientation. All 6 tests pass.

**Template-aware inspection validation**: `packages/shared/schemas/site-visit-inspection.ts` — a generic, field-definition-driven Zod validation layer (not hardcoded to the one seeded template), validating stable keys, types, required-ness, options, units/numeric limits, array/text limits, and rejecting unknown fields. Wired into `saveSiteVisitInspectionAction()` (`apps/web/app/(app)/site-visits/actions.ts`), which also verifies any referenced photo `vault_items` belong to the same org/site visit (a DB check Zod alone can't perform) before calling the service-role-only `saveSiteVisitInspectionTrusted()` RPC wrapper. Direct-client denial of the underlying RPC was already proven in the golden-path bot (test 3) and remains proven after this change.

**Full server-action layer**: `apps/web/app/(app)/site-visits/actions.ts` — thin, capability-agnostic wrappers (the RPCs enforce their own capabilities; re-checking here would be a second, driftable copy) around every RPC from the original report: triage, triage correction, scheduling/rescheduling/cancellation, start/undo/complete, inspection save, upload request/finalize, estimate generation, pricing approval/reopen, and quote creation. Follows this repo's existing `'use server'` + `Result<T>` + `getServerSupabase()`/`getActiveOrgContext()` conventions exactly (matching `estimates/actions.ts`'s established shape).

**Regressions found and fixed during this phase**:
1. A pre-existing unit test (`apps/web/app/api/v1/service-requests/route.test.ts`) used a free-text `"Thursday morning"` as its `preferredDateTime` fixture — the new strict datetime-local validation correctly rejects that (proving the fix works), so the fixture was updated to a real datetime-local string, and the test's mocked service client was extended to cover the new `organizations.timezone` lookup it hadn't needed before. This is a fixture fix, not a validation weakening — the new stricter behavior was preserved exactly.
2. Real lint (`import()` type annotations forbidden) and strict-null-check errors in the new integration test, caught by `pnpm typecheck` (the production build's own linting doesn't cover `*.test.ts` files, so these were only caught by running typecheck explicitly — a reminder that `pnpm --filter web build` passing is not sufficient on its own for test files).

**Documentation reconciliation** (separate concern, same session): `docs/SESSION_STATE.md`, `docs/CLAUDE_CONTEXT.md`, `docs/RESUME_PROMPT.md`, and `docs/production/cleanup/2026-08-01-production-cleanup.md` — previously stranded on a local, unpushed `fix/auth-confirm-route` branch — were brought forward onto this branch (manually reconciled for `SESSION_STATE.md`, since it diverged on both branches; the other three copied as-is since they didn't exist here) so the full production-stabilization → cleanup → blank-slate → Storage-checkpoints → site-visit-backend story is told in one place.

**Re-verification near completion**: full serial E2E suite re-run — 135 passed, 1 flaky-then-passed-on-retry (an existing invoice test, unrelated), 27 skipped. The pre-existing `employee-onboarding-admin-invite-bot` failure was re-run in isolation and **reproduced consistently again** (not transient) — confirmed pre-existing and unrelated to this branch, per the explicit instruction not to fix it here. Full vitest suite: 102/102 pass. The new golden-path E2E bot re-verified standalone: 11/11 pass.

**Employee pricing-policy decision, restated as final** (not a placeholder): owner/admin get all four estimate/quote capabilities; employee gets edit/create-quote/send-quote but never pricing approval; subcontractor gets edit only (findings/draft scope), never quote creation or sending. This is documented as the deliberate initial business policy for this phase, not an open blocker.

## 9. Known limitations and follow-up items

- **SQL/TypeScript capability dual-maintenance**: both sides are hand-written from the same reviewed matrix; the parity test catches drift but doesn't prevent it structurally. A shared single-source-of-truth generation remains deferred technical debt (explicitly acknowledged in the approved plan).
- **Employee pricing-approval default** (`canApproveEstimatePricing` = owner/admin only) is a business-policy choice, not a technical default — flagged for Kevin's confirmation, changeable later with a one-line capability-map edit.
- **Git branch state**: `docs/SESSION_STATE.md` and the earlier production-cleanup/Jobber-purge documentation exist only on the local, **unpushed** `fix/auth-confirm-route` branch — they were never merged to `origin/main`, so this new branch (created fresh from `origin/main`) doesn't have them. `docs/SESSION_STATE.md` on this branch is newly created and reflects only this checkpoint's state. Reconciling the two branches' documentation is a separate housekeeping item, flagged here rather than silently worked around.
- HEIC/HEIF upload support remains unavailable — documented, not solved (§6).
- The one pre-existing E2E failure (`employee-onboarding-admin-invite-bot`) was observed but not investigated as part of this checkpoint.

## 10. Production deployment steps (not performed — for future reference only)

1. Dry-run the 17 migrations against `premier-crm-prod` (`apnbpcauqrjvkoleisde`), confirm output matches what was applied to e2e.
2. Apply migrations to prod (production is currently a verified blank slate for customer/property/workflow data, so this is a zero-data-risk schema change in practice, but standard dry-run discipline still applies).
3. Regenerate `packages/db/types.ts` against prod (or confirm the e2e-generated types already match, since schema is identical).
4. Confirm `organizations.timezone` for the real Premier org row.
5. Merge this branch to `main` only after the UI (§8) and remaining test coverage are built and reviewed — this checkpoint's backend-only state is not a mergeable, feature-complete PR on its own by the standard the rest of this session has held to.
