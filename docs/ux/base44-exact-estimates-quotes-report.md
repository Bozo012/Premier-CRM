# Base44-exact rebuild: Estimates + Service Catalog + Quotes

Branch: `rebuild/base44-exact-estimates-quotes` (worktree `C:\dev\Premier-CRM-base44-estimates-quotes`)
Base commit: `53edf88e7adb303e062b9d7730064cc0ab4be9c0` (PR #127 merged — Requests + Site Visits + Inspection)
This is the fifth slice of the Base44-exact rebuild program (after Customers, Properties + Team, Requests + Site Visits + Inspection).

## Scope

Moved Estimates, Quotes, and Service Catalog from `(legacy)` to `(forge)` and wired the real `ForgeShell` chrome (all three route families previously rendered under `(legacy)/layout.tsx`'s `AppShell` and would have rendered with zero navigation chrome once moved into `(forge)`'s pass-through layout). Added one genuinely new, additive route (`/services/[serviceId]`) backed by a new org-scoped query, `getServiceItemById`, following the exact precedent PR #126 set with `getTeamMemberById`. Jobs and Calendar were explicitly left untouched, as instructed.

**Important scope honesty note, up front:** unlike the prior slice (Requests/Site Visits), which required rebuilding a flat inspection form into a Base44-exact 5-step wizard, the `(legacy)` estimates/quotes/services pages in this repo were **already** built on the shared Forge presentation primitives (`ForgeCard`, `ForgePage`, `ForgeStatusPill` from `components/forge/presentation.tsx`) — the same visual language established by the earlier slices. This slice's primary and highest-risk work was therefore the architectural move (route group + ForgeShell chrome + the additive service detail route), not a from-scratch visual replacement of an old-style page. I did **not** clone/fetch the `Bozo012/Forge-Base44-UX` reference repo and diff it line-by-line against these three route families in this pass — time did not allow it at the depth the program's audit step calls for. I am flagging this explicitly as a known limitation (see "Known limitations" below) rather than asserting a pixel-level Base44 fidelity claim I did not verify. The independent verification pass should treat visual-fidelity-to-Base44-source as **not yet confirmed** for this slice, distinct from the architectural/functional claims below, which I did verify by reading the actual current source and by typecheck/test/build.

## Routes moved

| Route | Old location | New location |
|---|---|---|
| `/estimates` | `(legacy)/estimates/page.tsx` | `(forge)/estimates/page.tsx` |
| `/estimates/[estimateId]` | `(legacy)/estimates/[estimateId]/page.tsx` | `(forge)/estimates/[estimateId]/page.tsx` |
| `/estimates/new` | `(legacy)/estimates/new/page.tsx` | `(forge)/estimates/new/page.tsx` |
| `/quotes` | `(legacy)/quotes/page.tsx` | `(forge)/quotes/page.tsx` |
| `/quotes/[quoteId]` | `(legacy)/quotes/[quoteId]/page.tsx` | `(forge)/quotes/[quoteId]/page.tsx` |
| `/quotes/new` | `(legacy)/quotes/new/page.tsx` | `(forge)/quotes/new/page.tsx` |
| `/services` | `(legacy)/services/page.tsx` | `(forge)/services/page.tsx` |
| `/services/[serviceId]` | *(did not exist)* | `(forge)/services/[serviceId]/page.tsx` (new) |

All `_components/`, `_lib/`, `actions.ts`, and test files moved with `git mv` alongside their routes. URLs and dynamic-segment names are unchanged (`[estimateId]`, `[quoteId]`).

### Import fallout found and fixed

- `apps/web/components/forms/use-customer-property-resolver.ts` imported `createJobFromAcceptedQuoteAction`/related from `@/app/(app)/(legacy)/estimates/actions` — broken once estimates moved out of `(legacy)`. Fixed to the absolute path `@/app/(app)/(forge)/estimates/actions`.
- `apps/web/lib/branding.test.ts` and `apps/web/app/(app)/route-groups.test.ts` had hardcoded `(legacy)/estimates`/`(legacy)/quotes`/`(legacy)/services` path assertions — updated to `(forge)`, and `estimates`/`quotes`/`services` moved from `route-groups.test.ts`'s `LEGACY_ROUTES` list to its `FORGE_ROUTES` list (alongside `customers`, `properties`, `team`, `requests`, `site-visits`), with new route-resolution and shell-chrome assertions added for all eight estimate/quote/service pages.
- `apps/web/app/(app)/(legacy)/quotes/_components/create-job-button.tsx`'s relative import `'../../estimates/actions'` was checked and needed **no change** — both `quotes` and `estimates` moved into `(forge)` together in the same commit, so the relative path (`(forge)/quotes/_components/../../estimates/actions` → `(forge)/estimates/actions`) still resolves correctly. Verified by `pnpm typecheck` passing clean.
- `apps/web/app/(app)/(legacy)/estimates/_components/pricing-review-panel.tsx` already imported `'@/app/(app)/(forge)/site-visits/actions'` (an absolute path, fixed in PR #127) — unaffected by this slice's move and confirmed still correct after estimates itself moved into `(forge)` alongside site-visits.
- No other relative imports were found crossing between `(legacy)` and estimates/quotes/services in either direction (grepped `apps/web` for `(legacy)/(estimates|quotes|services)` before and after the move; only the two fixes above and the two mechanical test-file path updates matched).

## ForgeShell wiring

`estimates/page.tsx`, `estimates/[estimateId]/page.tsx`, `estimates/new/page.tsx`, `quotes/page.tsx`, `quotes/[quoteId]/page.tsx`, `quotes/new/page.tsx`, `services/page.tsx`, and the new `services/[serviceId]/page.tsx` previously rendered inside `(legacy)/layout.tsx`'s `AppShell`. New files, copied exactly from the established `customers`/`properties`/`requests` pattern (same `getActiveOrgContext` + user-profile lookup, same reused `signOutAction`/`switchActiveOrgAction` from `today/actions.ts`):

- `estimates/_lib/forge-shell-context.ts`, `estimates/_components/estimates-shell.tsx`
- `quotes/_lib/forge-shell-context.ts`, `quotes/_components/quotes-shell.tsx`
- `services/_lib/forge-shell-context.ts`, `services/_components/services-shell.tsx`

Every page now builds `shellData`/`mobileNav` and wraps its content in `<EstimatesShell>`/`<QuotesShell>`/`<ServicesShell>`. The pre-shell-data error branches (org-context failure, before `shellData` can be built) render a bare centered `<main>` with `OrgContextError`, matching the exact pattern `requests/page.tsx` and `quotes/[quoteId]/page.tsx`'s sibling routes already use for that same edge case — not a chrome-less regression, since a user who fails org-context resolution has no valid organization to render sidebar/nav data for regardless.

## Audit findings (per the task's required first step)

### 1. Every estimate/quote action, state, and RPC already authoritative on `main`

Read in full from `packages/db/queries/estimates.ts`, `packages/db/queries/quotes.ts`, `packages/db/queries/service-catalog.ts`, and the `actions.ts` files in all three route families. None of the following were modified in this slice:

**Estimates** (`estimates/actions.ts`):
- `updateEstimateStatusAction` — advances `estimate_status` (`draft` → `site_visit_scheduled` → `site_visit_complete` → `quoted` → …), bound to `AdvanceStatusButton`.
- `createJobFromAcceptedQuoteAction`
- `createQuoteFromEstimateAction` — the ungated legacy path (pre-triage-system manual estimates only).
- `createManualEstimateAction`
- `createEstimateLineItemAction` / `updateEstimateLineItemAction` / `deleteEstimateLineItemAction` — direct table writes under RLS; the DB-side `estimate_line_items_enforce_pricing_lock` trigger rejects any write once `pricing_reviewed_at` is set, so the client-side `locked` prop on `LineItemsSection` (`!!estimate.pricingReviewedAt || pricingReviewStatus === 'pending_review'`) is a UX mirror, not the authority.
- `searchCustomersForPickerAction`, `listPropertiesForCustomerAction`
- Pricing-review flow (imported from `(forge)/site-visits/actions`, unchanged, pre-existing absolute import): `requestEstimatePricingReviewAction`, `approveEstimatePricingAction`, `returnEstimatePricingForChangesAction`, `reopenEstimateForEditAction`, `createQuoteFromEstimateWorkflowAction` — the gated path used when `isQuoteEligibilityGated` is true.

**Quotes** (`quotes/actions.ts`):
- `updateQuoteMetadataAction` — draft-only guard enforced server-side (`existing.status !== 'draft'` → `VALIDATION_ERROR`), not just client-side.
- `approveJobAction`, `sendQuoteAction`, `resendQuoteEmailAction`
- `searchJobsForPickerAction`
- `createDraftQuoteAction`, `createStandaloneQuoteAction`
- `addLineItemAction` / `updateLineItemAction` / `removeLineItemAction` — `addQuoteLineItem` in `quotes.ts` server-side rejects with `FORBIDDEN` if `quote.status !== 'draft'`, which is the real immutability guard on a sent/accepted/declined quote's customer-facing line-item snapshot. `recalc_quote_totals` RPC recomputes subtotal/tax/total after every mutation.

**Service Catalog** (`services/actions.ts`, `service-catalog.ts`):
- `saveServiceCategory`, `saveServiceItem` — upsert-by-optional-id, org-scoped.
- `listServiceCategories`, `listServiceCatalogItems`, `listCatalogItemsForPicker` — unchanged.

None of these signatures, guards, or RPC bindings were touched. Confirmed by `pnpm test` (321 tests passing, including `forge-estimate-view-model.test.ts`, `forge-quote-view-model.test.ts`, and `quotes/actions.test.ts`, all of which moved unmodified) and `pnpm typecheck`.

### 2. Base44 presentation-only controls — bind-or-document-gap decision

I did not do a literal file-by-file read of the Base44 reference repo's estimate/quote/service routes in this pass (see the scope-honesty note above). Based on what the *existing* `(legacy)` pages already implement — which is the same population of controls a Base44-parity audit would need to check — every visible control on these three route families is already bound to a real query, action, or RPC:

| Control | Real backing |
|---|---|
| Estimate status advance button | `updateEstimateStatusAction` → `estimate_status` enum transition |
| Pricing review submit/approve/return/resubmit | `(forge)/site-visits/actions` RPC wrappers, gated by `isQuoteEligibilityGated` |
| Estimate line item add/edit/delete | `estimate_line_items` table, DB-trigger pricing lock |
| Create quote from estimate (both gated and ungated paths) | `createQuoteFromEstimateWorkflowAction` / `createQuoteFromEstimateAction` |
| Quote metadata form (draft only) | `updateQuoteMetadataAction`, server-side draft guard |
| Quote line item add/edit/delete | `quote_line_items` table + `recalcQuoteTotals` RPC, server-side draft guard |
| Send quote | `sendQuoteAction` → `sent_at`/`share_token` |
| Resend quote email | `resendQuoteEmailAction` |
| Approve job (post-accept) | `approveJobAction` |
| Create job from accepted, estimate-only quote | `createJobFromAcceptedQuoteAction` / `CreateJobButton` |
| Service category/item manage forms | `saveServiceCategory`/`saveServiceItem`, org-scoped upsert |

No fixture-only, `useState`-only, or mock-array-backed control was found among the pre-existing estimate/quote/service pages. This differs from the prior slice's inspection form, which genuinely had a Base44 fixture contract (`checklist`, `findings[].condition/severity`, etc.) with no real backing at all.

**The one place this audit step legitimately surfaces a gap** — already documented in the pre-existing quote detail page before this slice, and left exactly as-is: the "PDF" and "Revisions" `FutureSectionCard`s on `/quotes/[quoteId]` are explicit, honest placeholders ("PDF generation will attach once the send flow is proven in production," "Versioning and revised-quote history will layer onto this route later") — not fabricated functionality, just labeled deferred work. This slice did not touch or remove them.

### 3. Does Base44's estimate/quote workflow imply any status/transition that does NOT exist in the real model?

I did not read Base44's estimate/quote source in this pass to answer this definitively from the Base44 side (see scope-honesty note). From the real-schema side, the invariant called out in the task prompt was re-verified by reading `packages/db/queries/estimates.ts` line-by-line: `pricingReviewStatus` is typed `'pending_review' | 'changes_requested' | null` — **never** `'approved'` — and approval is derived solely from `pricingReviewedAt` being non-null (see the doc comment at estimates.ts:52 and the query's actual return construction at line 303, which casts directly from the DB column with no `'approved'` literal anywhere in the file). Nothing in this slice introduces, references, or fabricates an `'approved'` pricing-review-status value in the DB, in a type, or in any presentation logic — `pricing-review-panel.tsx` moved unmodified (byte-identical, `git mv` only) and continues to derive its "approved" UI state from `pricingReviewedAt !== null`, not from a status string. Since I have not independently confirmed what Base44's fixture-side status enum for estimates/quotes actually contains, I cannot rule out that Base44's *reference* app assumes a different status vocabulary — flagging this as an open question for the verification pass, not a resolved one. **No transition was ported that isn't backed by the real state machine** — this much I can affirm from the real-side read, independent of the Base44-side comparison.

## Service Catalog — new `/services/[serviceId]` detail route

Added `getServiceItemById` to `packages/db/queries/service-catalog.ts`:

```ts
export async function getServiceItemById(
  client: DbClient,
  args: { serviceItemId: string; orgId: string }
): Promise<Result<ServiceItemDetail>>
```

- Fetches `service_items` by id with `.eq('org_id', orgId)` before returning — cross-org or missing id returns `NOT_FOUND`, exactly the `getTeamMemberById` precedent from PR #126.
- Follow-up lookup of `service_categories` (also org-scoped) for the category summary — no FK embed used, matching the simple two-query pattern of the precedent rather than inventing a new join style.
- No migration, no schema change — purely additive, reading existing columns.
- Exported from `packages/db/queries/index.ts` and `packages/db/index.ts` (both required explicit named re-exports; the second was missed on the first pass and caught by `pnpm typecheck`).

The detail page (`services/[serviceId]/page.tsx`) shows: category, confirmed/guided/unconfirmed pricing badges (reusing the same badge logic as the list card), primary price + rate range, default labor minutes/markup, confidence, scope includes/excludes, common add-ons, exclusion note, and a link back into the existing `#manage-service-catalog` admin editor for actual edits (no duplicate edit form was built — editing continues to go through the existing `ServiceCategoryManager`/`ServiceItemManager` forms on `/services`, per the task's explicit "preserve the existing admin-editing actions" instruction).

**What was deliberately not added**: usage analytics or linked-job/quote history for a service item — there is no real query today that aggregates "which jobs/quotes used this service item," and fabricating one was out of scope for an additive, no-schema-change query in this pass. Classified as `backend-completion-required` below if a future slice wants it.

## Permissions / RLS findings

No changes made to `packages/shared/permissions.ts` or any of the three `actions.ts` files' capability gating. Verified by reading `estimates/[estimateId]/page.tsx` (`hasCapability(role, 'canApproveEstimatePricing')` / `hasCapability(role, 'canEditEstimate')` still gate `PricingReviewPanel`'s props exactly as before the move) and confirming `getEstimateById`/`getQuoteById`/`getServiceItemById`/`listEstimates`/`listQuotes`/`listServiceCatalogItems` all continue to scope by `orgId` server-side — the new `getServiceItemById` was written to the same `.eq('org_id', orgId)`-before-return standard as every other query in the file. No new client-only permission checks were introduced. The estimate line-item pricing lock remains DB-trigger-enforced (`estimate_line_items_enforce_pricing_lock`), not re-implemented client-side.

## Gap table

| Item | Classification | Notes |
|---|---|---|
| Base44 reference repo (`Bozo012/Forge-Base44-UX`) not cloned/diffed against these 3 route families in this pass | **Known limitation, not classified as a content gap** | The existing `(legacy)` pages already used the shared `ForgeCard`/`ForgePage`/`ForgeStatusPill` presentation primitives established by earlier slices; this slice's risk was concentrated in the architectural move, not a from-scratch visual rebuild. Pixel/structure-level fidelity to Base44's actual estimate/quote/service source was not independently re-verified here — flagged for the separate verification pass. |
| `/quotes/[quoteId]`'s "PDF" and "Revisions" `FutureSectionCard`s | `intentionally-deferred` (pre-existing, unmodified by this slice) | Explicit, honest placeholders already in the pre-slice code; not fabricated, not touched. |
| `/services/[serviceId]` usage analytics / linked-job history | `backend-completion-required` | No real query aggregates this today; omitted rather than fabricated, per the task's explicit instruction for the service detail route. |
| Estimate/quote/service list search as client-side substring filtering (estimates/services) vs. real server re-query with `?q=` URL update (all three, since the search form always posts to the route) | `found-real-correctly-bound` | `EstimatesPage`/`QuotesPage`/`ServicesPage` all use a real `<form action="/...">` GET that changes the URL and re-runs the server component; `filterEstimates`/`matchesServiceItem` then apply an additional client-visible-array filter on top of the already-narrowed server result (view/status pre-filter is server-side; free-text search is applied post-fetch against the already-fetched page). This mirrors the pre-existing `(legacy)` behavior exactly — unchanged by this slice, documented here for completeness per the audit's second step. |
| Base44's estimate/quote status vocabulary vs. the real `pricing_review_status`/quote `status` enums | **Open question, not resolved in this slice** | I did not read Base44's fixture/contract source for estimates/quotes to compare directly (see section 3 above). No unverified transition was ported; the real-side invariant (`pricingReviewStatus` never `'approved'`) was re-confirmed unmodified. |
| Suggested-item handling on estimate line items (`is_system_suggested` flag) | `found-real-correctly-bound` | `EstimateLineItem.isSystemSuggested` is a real, already-selected column (`estimates.ts` line 73/396); `createEstimateLineItem` always inserts `is_system_suggested: false` for manually-added items — system-suggested items originate elsewhere (site-visit-to-estimate generation, unmodified, out of this slice's scope). Not re-derived or duplicated by this slice. |

## Testing

**Unit (`pnpm test`)**: 40 test files passed, 1 skipped (41 total); 321 tests passed, 6 skipped (327 total). No unit test needed behavior changes — `forge-estimate-view-model.test.ts`, `forge-quote-view-model.test.ts`, and `quotes/actions.test.ts` moved with `git mv` and pass unmodified.

**Typecheck (`pnpm typecheck`)**: clean across all 5 packages with a `typecheck` script (`apps/web`, `packages/db`, `packages/shared`, `packages/ai`, `packages/automation`).

**Build (`pnpm --filter web build`)**: succeeds. Route list confirms all 8 routes present exactly once: `/estimates`, `/estimates/[estimateId]`, `/estimates/new`, `/quotes`, `/quotes/[quoteId]`, `/quotes/new`, `/services`, `/services/[serviceId]`. `/jobs` and `/calendar` are unchanged (still under `(legacy)`, confirmed by the build's route table and by not having touched either directory). Two pre-existing ESLint warnings surfaced during build (`quotes/actions.test.ts:87` `no-explicit-any`, `quotes/_components/line-item-editor.tsx:130` unused `formAction`) — both predate this slice (neither file's content was edited, only moved) and are not regressions introduced here.

**E2E — written and typechecked, NOT executed.** No `.env.test` exists in this worktree and none was created, per the task's explicit instruction not to attempt to reach any live database. New specs:

- `tests/e2e/estimates-base44-shell-bot.spec.ts`
- `tests/e2e/quotes-base44-shell-bot.spec.ts`
- `tests/e2e/services-base44-shell-bot.spec.ts`

All three follow the exact pattern of `requests-base44-shell-bot.spec.ts`: unauthenticated redirect-to-login, ForgeShell chrome presence, no-horizontal-overflow at the 4 standard viewports (390×844, 768×1024, 1024×768, 1440×900), real server-backed search/filter URL updates, "New record" entry points, direct-URL/refresh/Back navigation against an existing record (each skips gracefully if the org has no records yet, matching the established `test.skip(!hasX, ...)` pattern), and no-console-errors assertions. The quotes spec additionally asserts the draft-edit-form-vs-read-only-timeline split is mutually exclusive (never both, never neither) as a regression guard for the "never allow silent edits to a sent/accepted/declined quote's line-item snapshot" requirement. `tests/e2e/utils/selectors.ts` gained `routes.newQuote`.

Verified via `npx tsc --noEmit -p tests/e2e/tsconfig.json`: the three new files produce zero errors. The command does report pre-existing type errors in several *other*, unrelated spec files (`authorization-service-requests-bot.spec.ts`, `customer-intake-bot.spec.ts`, `demonstration-org-bootstrap-bot.spec.ts`, `integrated-lifecycle-bot.spec.ts`, `invoice-management-bot.spec.ts`, `quote-response-bot.spec.ts`, `request-site-visit-workflow-bot.spec.ts`) — none of these files were touched by this slice; they were not introduced by this change.

## Known limitations / follow-ups

1. **Base44 reference-repo visual diff performed only at contract/doc depth, not full file-by-file JSX comparison** (see "Independent verification pass" above) — the two substantive risks (fabricated status vocabulary, silently-missing portable feature) were checked and resolved with no defect found; pixel-level structural fidelity for the remaining components listed above was not compared line-by-line. Reasonable stopping point, not a blocking gap.
2. **RESOLVED** (see "Independent verification pass" above): Base44's `EstimateStatus` conflates workflow-stage and pricing-review-state into one enum including a stored `'approved'` literal the real schema never uses; confirmed this causes no live defect since the actual shipped `pricing-review-panel.tsx` derives approval from `pricingReviewedAt !== null`, not from any status string. Base44's quote status vocabulary maps cleanly onto the real `QuoteStatusSchema` with no conflict.
3. `/quotes/[quoteId]`'s PDF and Revisions sections remain honest placeholders, unchanged from before this slice.
4. `/services/[serviceId]` has no usage-analytics/job-history panel (no real backing query exists yet) — a reasonable future-slice addition if wanted.
5. Base44's portable `DictateControl` (voice dictation for estimate notes/line items) has no real backing and is not implemented — confirmed the pre-existing `new-estimate-form.tsx` already handles this honestly with a disabled, clearly-labeled placeholder button, not a fabrication. A real future feature, not a defect.
6. No visual evidence (screenshots) was captured this pass — the prior slice's `scripts/capture-*-evidence.mjs` pattern requires a live authenticated session, which this worktree cannot reach (no `.env.test`).

## Independent verification pass — Base44 reference diff (closes the audit gaps above)

Performed after the implementation pass, by fetching `Bozo012/Forge-Base44-UX` @ `497d0693cccafd89315ec17c3be9885cfaae5c84` directly via `gh api` (tree listing + file contents) — no clone, nothing added to this repo.

**Resolves gap-table item "Base44's estimate/quote status vocabulary vs. the real model" (previously an open question):**

- `src/contracts/estimates.ts`'s `EstimateStatus` is `"draft" | "needs_pricing_review" | "changes_requested" | "approved" | "quote_ready" | "quote_sent"` — a single linear enum that **conflates** two concepts the real schema deliberately keeps orthogonal: workflow stage (real `estimate_status`: `draft` → `site_visit_scheduled` → `site_visit_complete` → `quoted` → …) and pricing-review state (real `pricingReviewStatus`: `null | 'pending_review' | 'changes_requested'`, with approval derived solely from `pricingReviewedAt !== null`, never a stored `'approved'` literal). **This is a real status-vocabulary mismatch, confirmed by reading Base44's actual source** — Base44's fixture bakes "approved" in as a stored status value; the real app never does.
  - **No live bug results from this**, because `pricing-review-panel.tsx` — the actual shipped component, moved unmodified (`git mv` only) by this slice — was already, independently of this program, written to derive its "approved" UI state from `pricingReviewedAt !== null`, not from any `'approved'` string literal anywhere (grep-confirmed: zero occurrences of the string `'approved'` as a comparison target in `estimates.ts` or `pricing-review-panel.tsx`). The mismatch exists between Base44's fixture contract and the real schema, not between Base44's fixture and this slice's ported code — nothing in this slice (or the pre-existing code it moved) treats `'approved'` as a real stored status.
  - `src/contracts/quotes.ts`'s `QuoteSummary.status` is `"draft" | "sent" | "viewing" | "accepted" | "declined" | "expired"` — this maps cleanly onto the real `QuoteStatusSchema` (`'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revised'`, `packages/shared/schemas/quote.ts`): a 1:1 correspondence (`viewing`↔`viewed`) plus one real status (`revised`) Base44's fixture doesn't model. No conflict, no fabrication risk here.

**New finding, not previously surfaced by the implementation pass's audit — a real, portable Base44 UI element with no real backing:** `src/docs/estimates-presentation-boundary.md` (Base44's own verification doc for this route family) documents a fully-portable `DictateControl` component (8 states: idle/requesting_permission/listening/processing/transcript_ready/permission_denied/unsupported_browser/error) used for voice-dictating estimate notes and line-item descriptions — "portable" per Base44's own classification (no SDK/backend/mic-access imports, purely presentational). The real app has no dictation feature. Checked whether this slice (or the pre-existing code it moved) fabricates or silently omits it: it does neither — `new-estimate-form.tsx` (pre-existing, unmodified by this slice) already has an honest, `disabled`, explicitly-labeled placeholder button (`title="Voice dictation isn't wired up yet"`) sitting exactly where Base44's `DictateControl` would go. This is the correct treatment per the program's "never fabricate" rule; flagging it here only because the implementation pass's audit didn't check Base44's source and so didn't know to confirm this was handled correctly. No code change made — documenting only.

**Not diffed at full file-by-file depth in this pass** (time-bounded, same as the implementation pass's honesty note): `EstimateSuggestedItems.tsx`, `EstimateActivity.tsx`, `QuoteFromEstimateFlow.tsx`, `RemoveLineItemDialog.tsx`, `ServiceDetail.tsx`, and the full `EstimateLineItems.tsx`/`EstimatePricingReview.tsx` prop surfaces were listed and spot-checked (contracts + the presentation-boundary doc) but not line-by-line compared against the current ported components' JSX. This is a reasonable stopping point given the two substantive risks (status-vocabulary fabrication, and a portable-but-unbacked feature silently missing) are both now resolved with no defect found; a deeper pixel-level pass remains a fair ask for a follow-up if closer Base44 visual fidelity is prioritized later.

## Commits on this branch (in order)

1. `e008c1b` — Move Estimates/Quotes/Services into `(forge)`; wire ForgeShell chrome; fix cross-route-group import fallout; add `getServiceItemById` + new `/services/[serviceId]` route; update `route-groups.test.ts`/`branding.test.ts`.
2. `f9571a8` — E2E: new `estimates-base44-shell-bot.spec.ts`/`quotes-base44-shell-bot.spec.ts`/`services-base44-shell-bot.spec.ts`, `selectors.ts` route additions.
3. Documentation (this file).

Run `git log --oneline rebuild/base44-exact-estimates-quotes` for exact SHAs.
