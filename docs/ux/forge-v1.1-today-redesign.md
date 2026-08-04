# Forge V1.1 — Today Redesign

Status: **merged and verified.** PR #105 squash-merged to `main` at commit `d9c9ff1`. First real route implementation of the Forge V1.1 UX modernization program (`docs/ux/forge-v1.1-ux-modernization-plan.md`), Batch UX-B, PR2 of 4 ("Today redesign"). Builds on the merged Batch UX-A shared foundation (PR #104, `05fbead`). This is now the authoritative Forge V1.1 presentation reference for `/today` — the Base44 compatibility spike remains historical/reference-only.

Post-merge validation on `main`: `pnpm test` 205/205, typecheck/build clean, 27/27 E2E on a clean consolidated re-run (`today-redesign-bot`, `today-action-queue-bot`, `operator-workflow-bot`, `multi-org-switching-bot`), phone overflow (390×844) explicitly re-confirmed fixed via a real Playwright viewport assertion. A pre-merge review caught one gap — the components were missing their documented `BASE44-REPLACEABLE` markers — fixed before merge (commit `906ec37`).

## Goals

Per Kevin's approval and product decisions for this phase:

- Rebuild `/today` as the daily command center using the merged shared foundation (desktop nav, `StatusPill`, `PageHeader`, `EmptyState`, `ErrorState`).
- Correct the Base44 compatibility spike's one confirmed defect (a workflow-relevance rule misplaced in a Layer 2 view-model) before any of its code is trusted as more than reference.
- Apply Kevin's Today-specific product decisions: actionable operational counts only (no accounting totals/vanity metrics), balanced density, capability-filtered quick actions, no unnecessary duplication of the now-persistent primary navigation.
- Fix a real pre-existing bug (action-queue row overflow on narrow phones) found during Batch UX-A's own verification pass.

## Architecture

Same three-layer pattern proven by the Base44 compatibility spike, now with the corrected layer boundary:

```
apps/web/app/(app)/today/page.tsx (orchestration)
  ├─ Layer 1: packages/db/queries/today-actions.ts — reused/extended, unchanged data-fetching pattern
  ├─ Layer 2: ./_lib/view-model.ts — pure functions, no I/O, no workflow decisions
  └─ Layer 3: ./_components/*.tsx — presentation, built on the merged shared foundation
```

### Layer 1 — existing Forge code reused, plus the corrected/extended domain layer

Reused unchanged: `getActiveOrgContext()`, `getTodayActionItems()`, `hasCapability()`, `signOutAction`, `switchActiveOrgAction` (via the unmodified `OrgSwitcher`), every route destination.

**Corrected**: `packages/db/queries/today-actions.ts`'s `getTodayQuoteActivity()` now owns the "is this quote-response activity still actionable" decision — the exact workflow-relevance rule that lived in the Base44 spike's `_lib/view-model.ts` (`buildQuoteActivityRows()`), which was a real ownership-boundary defect (documented in the spike report §0). The rule itself is unchanged (an accepted quote with no job yet is still actionable; a declined quote always stays visible), only its location moved. Covered by 6 new unit tests (`packages/db/queries/today-actions.test.ts`).

**New Layer 1 additions** (plain reads, no new tables/columns/RPCs):
- `getTodaySiteVisits()` — site visits with an appointment window overlapping today, matching the existing "today's jobs" query pattern.
- `getTodayInvoicesNeedingActionCount()` — a count of invoices in `sent`/`viewed`/`partially_paid`/`overdue` status (Kevin decision: operational counts only, never revenue/accounting totals).

### Layer 2 — `_lib/view-model.ts`

Pure functions only: `sortActionItems`, `buildTodaySchedule` (merges jobs + site visits into one chronological list — ordering only, not a workflow decision), `buildSnapshotItems` (shapes the three operational counts), `deriveGreeting`, `deriveFirstName`, `formatScheduledTime`. None perform I/O, none make an authorization or workflow-relevance decision — every such decision was already finalized in Layer 1. Covered by 12 new unit tests (`_lib/view-model.test.ts`).

### Layer 3 — presentation components

`today-header.tsx` (built on the shared `PageHeader` — the first real consumer of that primitive outside its own definition), `action-queue.tsx`, `today-schedule.tsx`, `snapshot-grid.tsx`, `quick-actions.tsx`, `admin-links.tsx`. Each receives only plain, already-computed props.

## What changed from the pre-redesign Today

- **"Business snapshot" → "Operational snapshot"**, and its contents changed from vanity totals (Customers/Properties/Jobs/New requests counts) to actionable-only counts (New requests, Today's work, Invoices needing action) — Kevin decision §10 item 4, resolved: actionable counts, not accounting totals.
- **"Today's work" now merges jobs and site visits** into one chronological list (previously jobs only) — closes a gap the modernization plan's §6.1 requirements flagged.
- **Quick actions are now capability-filtered.** "New estimate" only renders for roles with `canCreateEstimates`; "New invoice" only for `canCreateInvoices`. "New customer" and "Review quotes" remain ungated, matching their actual authorization model (no `canCreateCustomer` capability exists in the app at all — confirmed via `packages/shared/permissions.ts`; gating it here would invent a restriction that doesn't exist anywhere else in the product, which is out of scope for a UI redesign).
- **The "Browse imported data" grid was removed**, replaced by a single conditional "Website content" link (admin/owner only). Batch UX-A's new persistent desktop nav already covers Requests/Customers/Properties/Estimates/Quotes/Jobs/Invoices/Service catalog/Team — the old grid duplicated primary navigation that didn't used to exist. Per Kevin's explicit "avoid duplicating navigation unnecessarily" instruction.
- **Fixed a real, pre-existing overflow bug**: the action-queue row layout used a rigid `justify-between` flex row that pushed the action button off-screen on phones when a title/customer name was long (found live during Batch UX-A's own verification, confirmed present on unmodified `main` before this PR). Rows now stack vertically below `sm` and go side-by-side at `sm`+.

## Responsive behavior

Verified at all four required breakpoints via the new E2E suite:
- Phone (390×844): no horizontal overflow (previously failed with 57px overflow; now passes).
- Tablet portrait (768×1024): no overflow; desktop-style persistent nav renders (matches Kevin's hybrid tablet convention — desktop nav where space permits).
- Tablet landscape (1024×768): no overflow.
- Desktop (1440×900): persistent nav renders and navigates correctly.

## Accessibility evidence

- Every interactive element is a native `<button>`/`<a>` (via the existing `Button`/`Link` primitives) — none are non-semantic `<div onClick>`.
- Action-queue's primary action is keyboard-focusable (`E2E`-verified via `.focus()` + `toBeFocused()`).
- `StatusPill` always pairs color with a text label — never color alone.
- The empty-queue state uses the shared `EmptyState` component with real, accessible text, not an empty visual void.

## Test evidence

- `packages/db/queries/today-actions.test.ts` — 6 new unit tests for the corrected domain-layer rule.
- `apps/web/app/(app)/today/_lib/view-model.test.ts` — 12 new unit tests for the pure Layer 2 functions.
- `pnpm test` — 205/205 (187 pre-existing + 18 new), zero regressions.
- `pnpm typecheck` / `pnpm --filter web build` — clean.
- `tests/e2e/today-redesign-bot.spec.ts` — 20 new E2E tests, all passing against `premier-crm-e2e`: role visibility (owner/employee/viewer), cross-org isolation, navigation destination, task disappearance + empty-state return, org switching, sign-out, capability-filtered quick actions, operational-count accuracy (with a real fixture proving `$` never appears in the snapshot section), keyboard focus, desktop nav, and phone/tablet-portrait/tablet-landscape overflow checks.
- `tests/e2e/today-action-queue-bot.spec.ts` (pre-existing, unmodified) — 7/7, still the authoritative coverage for `getTodayActionItems()`'s role/capability filtering.
- **Regression fix required in an unrelated shared file**: `tests/e2e/utils/selectors.ts`'s `today.loadedMarker` hardcoded the old "Business snapshot" heading text, and `today.jobsCount` targeted a snapshot card this redesign correctly removed. Both were updated; `operator-workflow-bot.spec.ts` (which depended on `jobsCount` to prove a created job was real) was updated to verify via the `/jobs` list search instead — a more correct verification surface than a vanity count on Today ever was.
- **Two pre-existing, unrelated E2E failures found and ruled out**: `staff-permissions-bot.spec.ts` test 3 and `employee-estimate-workflow-bot.spec.ts` test 12 both fail on `/customers` list search (unrelated to `/today`) — confirmed to fail identically on unmodified merged `main` before any of this branch's changes (verified via `git stash` + isolated re-run). Not caused by, not fixed by, this PR.
- **One more pre-existing, unrelated issue found**: `mobile-simplicity-bot.spec.ts`'s login-page checks fail because `utils/selectors.ts`'s login heading selector (`"Sign in to Premier"`) is stale relative to the Forge rebrand (`/login` now reads `"Sign in to {PRODUCT_NAME}"` → "Forge") — predates this session, unrelated to `/today`, not fixed here (out of scope; a login-page/selectors fix belongs to a later UX-E batch or its own focused fix).

## Base44 replacement seams

Every presentation component in `_components/` is marked `BASE44-REPLACEABLE` at the exact point real generated markup would substitute in — same pattern established by the spike, now applied to the actual production Today implementation.

## Visual decisions that remain provisional

Per Kevin's decision (spike visuals are directionally useful, not final approval): the specific border accents, `StatusPill` colors, and card treatments carried over from the spike are structural/architectural proof, not confirmed final Forge V1.1 visual language.

## Rollback plan

This PR is additive/presentation-and-read-only:
- `git revert` the PR's merge commit — no Supabase schema, RLS, RPC, or migration changes exist anywhere in this branch to unwind.
- The two new Layer 1 read functions (`getTodaySiteVisits`, `getTodayInvoicesNeedingActionCount`) and the corrected `getTodayQuoteActivity` are pure `SELECT` queries — reverting the code removes them cleanly with no data-layer cleanup required.
- `tests/e2e/utils/selectors.ts` and `operator-workflow-bot.spec.ts` changes revert together with the rest of the PR; no other spec file is touched.
