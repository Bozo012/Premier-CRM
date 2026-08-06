# Base44 UX Batch 8: Requests + Site Visits + Inspection — Report

## Summary

Consolidated Request Detail's two competing triage UIs down to one
(the RPC-backed `TriagePanel`), converted the remaining literal Tailwind
colors on the Requests and Inspection routes to the app's `--st-*` semantic
tokens, and improved the inspection photo upload UI (multi-file, per-file
failure reporting) within the existing upload/finalize contract. No schema,
RLS, or backend action signature changes.

- **Base SHA**: Premier-CRM `origin/main@76bbad7c09ee0a7d51d703e42d9f878b233f53c4` (PR #121, "Expose active org switcher on mobile" — one small commit on top of Batch 7's merge, PR #120)
- **Frozen Base44 reference SHA**: `Forge-Base44-UX@497d0693cccafd89315ec17c3be9885cfaae5c8`
- **Branch**: `agent/forge-ux-batch-8-requests-site-visits-inspection`

## Triage equivalence findings (Task 1)

Audited each legacy action against `record_request_triage`
(`supabase/migrations/20260802020100_triage_rpcs.sql`):

| Legacy action | RPC equivalent | Equivalent? | Disposition |
|---|---|---|---|
| `createEstimateFromRequestAction` | `remote_estimate` decision | **No** — creates the same `estimates` row shape, but does not set `triage_decision`/`triage_reason`/`triaged_by`/`triaged_at`, and (pre-existing, documented separately as Finding F2 in `apps/web/app/(app)/requests/actions.test.ts`) has no `canTriageRequests` capability gate at all, unlike the RPC | Visible trigger (`CreateEstimateButton`) removed from Request Detail. Action/component code left in place — untouched, still callable directly, F2 remains a separately tracked finding, not something this batch's UI change fixes or was authorized to fix (no action-layer/permission changes in this batch) |
| `createJobFromRequestAction` | `direct_work_order` decision | **No** — enforces the same `canCreateDirectWorkOrder` gate as the RPC, but creates the job with `authorization_type`/`authorized_customer_contact`/`authorized_at`/`authorization_note`/`not_to_exceed_amount`/`authorization_reference` all left `NULL` (no authorization documentation at all), and does not set `triage_decision` | Visible trigger (`CreateJobButton`) removed from Request Detail. Action/component code left in place, unchanged |
| `markRequestReviewedAction` | none — no triage decision produces a `'reviewing'` status | **Genuinely distinct.** Confirmed via `packages/db/queries/requests.ts`: the requests list defaults to `status='new'` only, `'reviewing'` is a real, separate list-visibility state | Retained — `MarkReviewedButton` stays on Request Detail, unchanged |

Repo-wide usage check confirmed `create-estimate-button.tsx` and
`mark-reviewed-button.tsx` are referenced only from
`requests/[taskId]/page.tsx` and `requests/actions.test.ts` — removing their
triggers has zero cross-route impact. `requests/_components/create-job-button.tsx`
and `quotes/_components/create-job-button.tsx` are confirmed independently-named,
unrelated components in this codebase's per-route `_components/` convention
(not a shared component) — the quotes one was not touched.

Result: **one primary triage experience** on Request Detail —
`TriagePanel`'s decision form pre-triage, its decision summary +
correction form post-triage. No other visible trigger creates a
downstream estimate/job.

## Files changed

**Requests:**
- `apps/web/app/(app)/requests/[taskId]/page.tsx` — removed `CreateEstimateButton`/`CreateJobButton` imports and rendering, removed the now-unused `canCreateDirectWorkOrder` plumbing, converted the error panel to `--st-error-*` tokens
- `apps/web/app/(app)/requests/_components/triage-panel.tsx` — converted `bg-slate-900`/`hover:bg-slate-700` buttons to `bg-primary`/`text-primary-foreground`, converted `amber-*` correction-form/corrected-from colors to `--st-warning-*` tokens

**Site Visits / Inspection:**
- `apps/web/app/(app)/site-visits/_components/inspection-form.tsx` — converted the "Complete inspection" button and `SaveIndicator`'s saved/error colors to Forge tokens; no mechanism changes (autosave debounce, field rendering, `inspectionDetailProgress()` all untouched)
- `apps/web/app/(app)/site-visits/_components/photo-upload.tsx` — see Photo capability audit below

## Photo capability audit (Task 4)

Confirmed before implementing: the existing contract
(`requestSiteVisitPhotoUploadAction` → signed-URL PUT →
`finalizeSiteVisitPhotoUploadAction`) supports sequential per-file calls; it
was never built or verified for concurrent/parallel calls. There is no
existing query or action anywhere in the codebase that returns a
preview/thumbnail URL for a `vault_items` row, and `photo_list` field values
(`{ vaultItemId, caption? }[]`) have no wiring in `InspectionForm`'s
`onChange` path to remove an already-added entry.

**Implemented** (presentation layer only, binds to the existing two
actions, no new backend calls):
- `<input multiple>` + sequential per-file upload loop (not parallel — matches the verified contract)
- Per-file progress indicator ("Uploading N of M…")
- Per-file failure reporting by filename, with a clear "reselect the failed one(s) to retry" message — this is the existing manual-reselect UX, made honest and specific rather than a single generic error
- **Blocked, explicitly not built**: thumbnails/preview URLs (no backend query exists to generate one), automatic retry (no retry-without-reselect mechanism exists), removing an already-uploaded photo (no removal wiring in `photo_list`'s value model). These would each require a new backend/storage contract or a schema-adjacent change, both out of this batch's scope per the plan.

## Backend contracts

Preserved exactly, verified by re-running the full existing suite (see
Test results below): `RequestListItem`/`RequestDetail` shapes,
`getRequestById(client, { taskId, orgId })`, `recordRequestTriageAction`/
`correctRequestTriageAction` and their surviving-legacy-action counterparts'
signatures and gating, `SiteVisitDetail`/`SiteVisitListItem` shapes, all
site-visit lifecycle RPC wrappers, `saveSiteVisitInspectionTrusted`'s
service-role-only boundary, `startSiteVisitAction`/
`completeSiteVisitWithValidationAction`/`saveSiteVisitInspectionAction`/
`requestSiteVisitPhotoUploadAction`/`finalizeSiteVisitPhotoUploadAction`.

## A correction made mid-batch to the plan's own test assumption

The plan assumed all 4 cited "existing API/RPC-level E2E bots" needed no
changes to prove zero-behavior-change. That was true for 3 of them, but
**`tests/e2e/request-conversion-bot.spec.ts` is a hybrid UI+DB bot** — it
drove the two legacy conversion buttons directly by clicking
`getByRole('button', { name: /start inspection flow/i })` and
`/create work order/i`. Removing those buttons from the page (per the
triage-consolidation decision above) would have broken this bot outright
had it not been updated. It was rewritten to submit through `TriagePanel`'s
decision form instead, preserving every DB-level assertion (draft estimate
linked to the request, approved job with no quote/estimate backing, the
double-submission guard) — now exercised through the RPC path that is the
actual sole production trigger going forward. The other 3 cited bots
(`authorization-service-requests-bot`, `customer-intake-bot`,
`request-site-visit-workflow-bot`) were confirmed, by direct grep, to have
no dependency on the removed buttons and needed no changes.

## Tests added

- `apps/web/app/(app)/site-visits/triage-consolidation.test.ts` (new, 5 tests) — proves `recordRequestTriageAction`/`correctRequestTriageAction` pass each decision through to the RPC unmodified, and that the RPC's "already triaged" rejection is surfaced verbatim on a repeat submission (not swallowed, not retried, exactly one RPC call)
- `tests/e2e/request-conversion-bot.spec.ts` (rewritten, not new) — see correction above
- `tests/e2e/requests-redesign-bot.spec.ts` (new) — list→detail navigation, single-triage-UI assertion (decision `<select>` visible, both legacy button labels return zero matches, Mark-as-reviewed still present), direct-work-order authorization-type `required` attribute, responsive (390×844 / 768×1024 / 820×1180) no-horizontal-overflow checks
- `tests/e2e/site-visits-inspection-redesign-bot.spec.ts` (new) — inspection field rendering by label, autosave-to-"Saved" indicator, completing through the real button, and the persisted-completion-summary check across a direct detail-route load, a hard refresh, and the now-read-only inspection route — plus the same responsive sweep

## Test results

- **Unit (`pnpm test`, full suite)**: **249/249 passed**, zero regressions, including all pre-existing `requests`/`site-visits` view-model and action tests plus the 5 new triage-consolidation tests
- **`pnpm typecheck`**: clean across all packages
- **`pnpm --filter web build`**: not run in this session (see Known limitations)
- **New/updated E2E bots** (`request-conversion-bot`, `requests-redesign-bot`, `site-visits-inspection-redesign-bot`): typechecked clean via `tests/e2e/tsconfig.json` (introduced zero new errors — the tsconfig run surfaced a number of pre-existing errors in unrelated, untouched bot files, e.g. `integrated-lifecycle-bot.spec.ts`, `quote-response-bot.spec.ts`; that debt predates this batch and is out of scope here). **Not executed** in this session — no `.env.test` / Playwright browser available in this environment. Documented honestly rather than claimed.

## Known limitations

- `pnpm --filter web build` and the E2E bot suite were not run in this
  session (environment has no `.env.test`, no `premier-crm-e2e` reachability,
  no Playwright browser install verified). Typecheck and the full unit suite
  were run and are clean. Whoever runs this branch next against
  `premier-crm-e2e` should run: `pnpm --filter web build`,
  `authorization-service-requests-bot`, `customer-intake-bot`,
  `request-conversion-bot`, `request-site-visit-workflow-bot`,
  `today-redesign-bot`, `today-action-queue-bot`, `today-appearance-bot`,
  `requests-redesign-bot`, `site-visits-inspection-redesign-bot` before merge.
- Photo thumbnails, automatic retry, and photo removal remain unbuilt —
  documented above as blocked on backend capability, not silently dropped.
- `service_requests.job_id` NULL backfill (SR-000013/SR-000010) — untouched, tracked separately in `docs/integration/base44-deferred-data-integrity.md`.

## Migration status

Verified before and after this batch's changes: 78 repository migration
files, 78 applied on `premier-crm-prod`, zero pending. No migrations added
or modified by this batch.

## Deferred

- `service_requests.job_id` backfill — see `docs/integration/base44-deferred-data-integrity.md`.
- App-wide `forge/presentation.tsx` vs. `components/ui/*` standardization — not scheduled (Decision Log #2, carried forward unchanged).
- Hazards taxonomy — untouched, blocked on product decisions (Decision Log #3, carried forward unchanged).

## PR

Not yet opened as of this report — see final message for the PR URL once pushed.
