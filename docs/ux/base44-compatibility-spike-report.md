# Base44 Compatibility Spike — Report

Status: **spike complete, on branch `spike/base44-today-compat`, not merged.** `main` is unaffected (verified at `21db0ab`). Per the plan (`docs/ux/base44-compatibility-spike-plan.md`) and Kevin's explicit direction, this branch stays isolated until the findings below are reviewed and explicitly approved — nothing about a broader Base44 redesign begins until then.

**Purpose, restated**: this spike is about architectural compatibility, not final visual design. The representative redesign below is deliberately different from the shipped `/today` — its exact visual choices (borders, pill colors, spacing) are not proposed as Forge's final design language; they exist only to give the compatibility test something substantially different to integrate.

Baseline: `main` @ `21db0ab` (post Forge V1.0.2), 187/187 unit tests, clean working tree.

## Status update — expanded into Forge V1.1 (post-spike)

This spike is now **approved as an architectural reference for the broader Forge V1.1 UX modernization program** — see `docs/ux/forge-v1.1-ux-modernization-plan.md`. The following clarifications apply going forward:

- **The representative UI here is not automatically the final visual design.** Its role is, and remains, technical proof that the 3-layer pattern works — border/pill/spacing choices are not carried forward as approved Forge V1.1 aesthetics unless separately confirmed (see the V1.1 plan's Kevin decision on this exact point).
- **Direct compatibility proof currently covers `/today` only.** It is not blanket-generalized to every other route without an equivalent check per route/batch, per the V1.1 plan's batch structure (UX-A through UX-E).
- **Broader routes must follow the same controlled pattern** — one page/batch at a time, in separate reviewable PRs, never a single application-wide rewrite.
- **A real defect was found in this spike's own Layer 2 and must be fixed before this branch is trusted as more than reference**: `_lib/view-model.ts`'s `buildQuoteActivityRows()` contains a genuine workflow-relevance rule (which quote activity counts as "still actionable"), not mere presentation normalization. Per the corrected rule stated in the V1.1 plan and the updated `base44-handoff.md` §18, this belongs in `packages/db` (alongside `getTodayActionItems()`), not in a Layer 2 adapter. This branch remains unmerged specifically because this fix has not yet been made.

---

## 1. Branch and HEAD

- Branch: `spike/base44-today-compat`
- HEAD after this pass: includes the adapter-layer refactor, Base44-replaceable markers, and the new repeatable Playwright spec (see §6 for exact commit contents)
- Base: `main` @ `21db0ab`

## 2. Exact files changed

| File | Layer | Status |
|---|---|---|
| `apps/web/app/(app)/today/page.tsx` | Orchestration | Modified — restructured into explicit Layer 1/2/3 imports; data-fetching unchanged |
| `apps/web/app/(app)/today/_lib/view-model.ts` | Adapter (new) | New |
| `apps/web/app/(app)/today/_components/status-pill.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/today-header.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/action-queue.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/snapshot-grid.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/quick-actions.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/browse-data-grid.tsx` | Presentation | New |
| `apps/web/app/(app)/today/_components/today-schedule.tsx` | Presentation | New |
| `tests/e2e/today-redesign-spike-bot.spec.ts` | Test (spike-only) | New |
| `docs/ux/base44-compatibility-spike-report.md` | Doc | This file |

**Zero changes anywhere else** — confirmed via `git diff main --stat -- packages/db packages/shared supabase 'apps/web/app/(app)' ':!apps/web/app/(app)/today' 'apps/web/components' 'tests/e2e/*.spec.ts' ':!tests/e2e/today-redesign-spike-bot.spec.ts'` returning empty. `apps/web/components/ui/*` (shared primitives) were reused, not modified. No shared component required a change to make this spike representative.

## 3. Architecture pattern used

Three explicit layers, each with a distinct responsibility and a hard boundary the other layers never cross:

```
page.tsx (orchestration)
  ├─ Layer 1: existing Forge domain/data/action code — imported, called, never modified
  ├─ Layer 2: _lib/view-model.ts (adapter) — pure functions, no I/O, no auth/capability decisions
  └─ Layer 3: _components/*.tsx (presentation) — receive plain props, render only, marked
              BASE44-REPLACEABLE at the exact point real generated markup would slot in
```

### Layer 1 — existing Forge code reused unchanged

- `getServerSupabase()`, `supabase.auth.getUser()` — auth
- `getActiveOrgContext()` — active-org resolution (`packages/db/queries/org-context.ts`)
- `getTodayActionItems()` — role/capability-gated action-queue query (`packages/db/queries/today-actions.ts`)
- The entire `Promise.all([...])` block — same 8 queries, same shapes, same filters, same `.eq('org_id', orgId)` scoping on every one
- `signOutAction`, `switchActiveOrgAction` (`./actions.ts`) — untouched
- `OrgSwitcher` (`_components/org-switcher.tsx`, pre-existing, not part of this spike's new files) — untouched, still the only mutation path for org switching, still delegates to the guarded `switch_active_org()` RPC
- `OrgContextError` — untouched, still the sole error-rendering path for a failed org-context resolution

### Layer 2 — adapter/view-model introduced by this spike

`_lib/view-model.ts` — nine pure functions (`sortActionItems`, `buildQuoteActivityRows`, `buildScheduleJobs`, `buildSnapshotItems`, `countUniqueProperties`, `normalizePropertyAddressKey`, `formatScheduledTime`, `deriveGreeting`, `deriveFirstName`). None perform network/database access. None make an authorization decision — every access/visibility decision was already finalized by `getTodayActionItems()` and RLS before this layer runs. The one piece of business-adjacent logic (`buildQuoteActivityRows`'s "an accepted-but-unconverted quote is still actionable" rule) existed inline in `page.tsx` before this spike; it was relocated, not invented, and it is not duplicated anywhere else — no presentation component re-derives it.

### Layer 3 — presentation-only components introduced by this spike

Seven components under `_components/`. Each receives only plain, already-computed props (strings, numbers, small typed objects/arrays) and contains zero data access, zero capability checks, and zero re-implementation of role logic. Every component's JSX is marked with a `BASE44-REPLACEABLE` comment at the exact point real generated markup would be substituted — see §4.

### Where real Base44 output would replace representative markup

At each `BASE44-REPLACEABLE` marker (one per presentation component, immediately before its `return (`). A real integration would replace only the JSX/className content below that marker — the component's function signature, prop types, and the call site in `page.tsx` would not change. This is the exact seam a future integration would use.

---

## 4. Acceptance criteria — evidence

| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | Base44 UI integrates as a component tree in the existing server component | Code inspection: `page.tsx` remains the server component; new components are plain React children | ✅ |
| 2 | Existing server queries/actions remain intact and unmodified | `git diff` on the data-fetching section of `page.tsx` is empty; only extraction into `_lib/view-model.ts` (Layer 2) moved derived-value computation, no query changed | ✅ |
| 3 | Active-org context works | Live E2E test (`today-redesign-spike-bot.spec.ts`, "org switching...") — real `getActiveOrgContext()` resolution, correct org name/role rendered | ✅ |
| 4 | Role-aware rendering works | Live E2E test ("owner sees...employee does not") — real `getTodayActionItems()` result, zero re-filtering in presentation | ✅ |
| 5 | Mobile layout works | Live E2E tests, phone (390×844) and tablet/iPad (768×1024) viewports — zero horizontal overflow, mobile bottom nav renders | ✅ |
| 6 | Typecheck/build stay clean | `pnpm --filter web typecheck` clean; `pnpm --filter web build` clean, `/today` route 2.60 kB (same as before the adapter-layer refactor) | ✅ |
| 7 | Supabase/RLS/RPC layer completely untouched | `git diff main -- supabase/ packages/db/` empty | ✅ |
| 8 | Current Today action-queue behavior preserved exactly | `today-action-queue-bot.spec.ts` (pre-existing, unmodified) 7/7 — proves the data layer is unaffected | ✅ |
| 9 | Action disappearance when no longer actionable | Live E2E test ("action item disappears once pricing is approved") — real DB mutation via service-role, page reload, item gone | ✅ |
| 10 | Navigation to existing destinations | Live E2E test ("navigates to the existing estimate route") — click, assert real `/estimates/[id]` URL | ✅ |
| 11 | Accessible controls and focus behavior | Live E2E test ("keyboard-reachable...focus state") — `.focus()` + `toBeFocused()` on the action button; every interactive element in the new components is a native `<button>`/`<a>` (via shadcn `Button`/`Link`), never a non-focusable `<div>` | ✅ |
| 12 | Empty state | Live E2E test ("empty state...hides the section entirely") — employee account with zero action items, section absent from the DOM (not just visually hidden) | ✅ |
| 13 | Loading state | **Code inspection only.** No `loading.tsx` exists for `/today` before or after this spike — this is pre-existing Next.js/App Router behavior, unmodified. Adding one would be new product behavior, out of scope per Kevin's explicit instruction not to establish new behavior. | Unchanged (not introduced, not regressed) |
| 14 | Error state — no raw internal authorization errors | **Code inspection.** `OrgContextError` (pre-existing, untouched) renders a code-classified, sanitized message — amber for the expected "no active org" case, red otherwise — never a stack trace. One pre-existing, unmodified observation: `getActiveOrgContext()`'s `DB_ERROR` branch (`packages/db/queries/org-context.ts:71`) passes the raw Postgres driver `error.message` through as the display string. This predates the spike and was not triggered live (would require an actual DB fault to test safely) — flagged as an existing characteristic, not a spike defect, and not fixed here since fixing it is a backend change outside this spike's scope. | Documented, not modified |
| 15 | Preservation of existing mutation paths | Live E2E test ("sign-out mutation path is unchanged") — real `signOutAction` call, real redirect to `/login`. Org-switch mutation path proven by the same test that proves org isolation (§ criterion 3), which only succeeds because `switchActiveOrgAction`/`switch_active_org()` RPC still function unmodified. | ✅ |
| 16 | Do not duplicate business logic in presentation components | Code inspection: every presentation component's only logic is trivial JSX conditionals (`items.length === 0 → null`, `canManageTeam ? ... : null` — both pre-existing conditions, relocated not reinvented); all substantive derivation lives in Layer 2 | ✅ |
| 17 | No second API/data-access layer | Code inspection: zero `fetch()`, zero new Supabase client instantiation, zero new route handlers anywhere in the diff | ✅ |
| 18 | No Supabase schema/grants/RLS/RPC/env/deployment changes | `git diff main -- supabase/` empty; no `.env*` file in the diff; no Vercel/CI config in the diff | ✅ |
| 19 | No customer-facing PPM branding changes | Code inspection: zero changes outside `apps/web/app/(app)/today/` and one new test file — customer portal (`app/portal/*`), public token views (`/q/[token]`, `/i/[token]`), and marketing-site repo untouched | ✅ |
| 20 | No other routes redesigned | `git diff main --name-only` shows only `today/`-scoped files, the new test, and this doc | ✅ |

**Test additions and results**: `tests/e2e/today-redesign-spike-bot.spec.ts` — 9 new tests, **9/9 passing** against `premier-crm-e2e` (see full run below). Pre-existing `today-action-queue-bot.spec.ts` — 7/7, unaffected. `pnpm test` — 187/187, zero regressions. `pnpm --filter web typecheck`/`build` — clean.

```
today redesign spike bot
  ✓ owner sees the redesigned action-queue item; employee does not
  ✓ action-queue item navigates to the existing estimate route
  ✓ action item disappears once pricing is approved
  ✓ org switching updates org context and action-queue scope
  ✓ empty state: no actionable items hides the section entirely
  ✓ sign-out mutation path is unchanged by the redesign
  ✓ action-queue button is keyboard-reachable and shows a visible focus state
  phone viewport (390x844)
    ✓ renders without horizontal overflow and shows the mobile bottom nav
  tablet viewport (768x1024)
    ✓ renders the 4-column snapshot grid without overflow
  9 passed (15.5s)
```

All fixtures (orgs, customers, properties, estimates, staff accounts) created via service-role, scoped to `premier-crm-e2e`, and deleted in `afterAll` — nothing persists.

---

## 5. Mobile/accessibility findings

- **Phone (390×844)**: zero horizontal overflow (`document.documentElement.scrollWidth - clientWidth ≤ 1`), mobile bottom nav renders and is reachable.
- **Tablet/iPad (768×1024)**: zero horizontal overflow, 4-column snapshot grid renders without breaking.
- **Keyboard/focus**: every interactive element added by this spike is a native, focusable `<button>` or `<a>` (via the existing `Button`/`Link` primitives) — none are non-semantic `<div onClick>`. Focus reaches the action-queue's primary action directly via `.focus()`/`Tab` semantics (native elements are tab-order-reachable by default; not independently re-verified for every single control on the page, only the highest-risk one — the dynamically rendered action-queue button).
- **Color-as-sole-signal**: `StatusPill` always pairs a color with a text label (e.g. "Awaiting your review"), matching the handoff doc's §12 requirement — never color alone.
- **No regression found** in either dimension relative to the pre-spike page, which used the same underlying primitives and breakpoints.

---

## 6. Could real Base44 output replace the representative layer without changing backend contracts?

**Yes, with the constraints in §7.** The seam is exactly the `BASE44-REPLACEABLE` marker in each of the seven presentation components: real generated markup could be substituted at that exact point, consuming the exact same typed props (`SnapshotItem[]`, `ScheduleJob[]`, `TodayActionItem[]`, `QuoteActivityRow[]`, etc.), without `page.tsx`, `_lib/view-model.ts`, or anything in Layer 1 changing at all. Nothing about the backend contract (query shapes, RLS, RPCs, capability checks) would need to move.

---

## 7. Compatibility verdict

# **COMPATIBLE WITH CONSTRAINTS**

Full compatibility is proven for the one page tested (`/today`). It is not blanket-generalized to every other route without re-running an equivalent check, hence "with constraints" rather than an unconditional pass.

### Constraints any Base44-generated output must follow

1. **Never fetch data itself.** All data arrives as props computed by Layer 1 (existing queries) + Layer 2 (adapter). A component that calls Supabase, `fetch()`, or any other data source directly breaks the boundary this spike proved.
2. **Never re-implement or approximate a capability/role check.** `hasCapability()`/`role_has_capability()`/`getTodayActionItems()`'s filtering is the only source of truth for what's visible to whom. A redesign renders what it's given; it never adds its own `if (role === 'owner')` gate.
3. **Never call a mutation directly.** Every mutation (sign-out, org-switch, and by extension any future estimate/quote/job/invoice action) must go through the existing server action/RPC, called exactly as today — never a new `fetch()` to a new endpoint, never a direct Supabase client write from a client component.
4. **Preserve org-scoping.** Every value rendered must already be `org_id`-scoped by the time it reaches presentation — a redesign never introduces a "show across all orgs" view or infers org context from anything other than `getActiveOrgContext()`'s result passed down as a prop.
5. **Preserve empty/disappearance semantics exactly.** No new "dismiss" state, no client-side hiding of an item the server still considers actionable.
6. **Design tokens (like `StatusPill`) should graduate to `apps/web/components/ui/`** before being reused on a second page — not duplicated per-page.
7. **Every interactive element must be a real, focusable, semantic control** (button/link), never a non-semantic clickable `<div>` — accessibility must not regress.
8. **No new database tables/columns/RPCs for a UI-only pass** — a genuinely new UI-driven data need must be raised and reviewed separately (handoff doc §17, restated here since this spike didn't need to test it directly).

### Recommended next step

Return this report for review (per Kevin's stated process). Do not expand the spike to additional routes or begin a broader redesign until it's explicitly approved. If approved, the next concrete step is deciding V1.1 scope (which pages, in what order) — not immediately re-running this same spike pattern on every page preemptively.

### Exact rollback procedure

The spike is fully isolated and has never touched `main`:

1. `git branch -D spike/base44-today-compat` (local) and `git push origin --delete spike/base44-today-compat` (remote) — no PR was ever opened, so no merge to revert.
2. No database, Supabase, environment, or deployment state was changed at any point (confirmed throughout — this was a pure frontend-code spike). No rollback is needed on any of those systems.
3. All test fixtures created during verification (orgs, users, customers, properties, estimates) were deleted in each spec's `afterAll`/inline cleanup and independently confirmed at `0` remaining rows — nothing to clean up post-hoc.
4. `main`'s `/today` is, and remains, exactly what it was before this spike (`21db0ab`) — verified by `git checkout main` showing the pre-spike file content.

---

## 8. What happens next (not started, awaiting Kevin's decision)

1. Decide which UI improvements belong in Forge V1.1 scope (this spike proves feasibility; it does not decide scope).
2. Address F2/F4 where they overlap with whatever redesigned workflows are chosen.
3. Handle F6, F7, `customer_location_prefs`, and the E2E migration-bookkeeping drift as separate maintenance items — none were touched or affected by this spike.
4. If approved to proceed past `/today`, promote `status-pill.tsx` to a shared `components/ui/` location per the constraints in §7.

**The spike branch remains unmerged.** `/today` on `main` is unaffected.
