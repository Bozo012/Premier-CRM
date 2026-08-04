# Forge V1.1 — UX Modernization Plan

Status: **plan complete. Batch UX-A (shared foundation, PR #104) and Batch UX-B/PR2 (Today, PR #105) are both merged and verified on `main` @ `d9c9ff1`.** Nothing in this document authorizes a deployment or a Forge V1.1 tag. The Base44 compatibility spike (`spike/base44-today-compat`, HEAD `a05700e`) remains a separate, unmerged, historical/reference-only branch — see §0. The merged Today implementation, not the spike, is now the authoritative Forge V1.1 presentation reference. Estimates (PR3) and Site Inspection (PR4) remain not started — per Kevin's direction, the next task is Base44 workspace/GitHub-connection readiness, not further route redesign.

---

## 0. Spike review (recovery)

- `main` @ `21db0ab` is unchanged since the spike began; `spike/base44-today-compat` is clean, unmerged, and diffs cleanly against `main` (11 files, all under `apps/web/app/(app)/today/`, one new test file, one doc). No conflicts exist that would block a future rebase.
- **Relocated business rule review**: `_lib/view-model.ts`'s `buildQuoteActivityRows()` contains the "an accepted quote with no job yet is still actionable" rule. This rule existed inline in `page.tsx` **before** the spike (not introduced by it) and has never lived in `packages/db`. Verdict: **this is a genuine workflow-relevance decision, not presentation normalization** — it decides which `activity_log` rows count as "needing attention," the same category of decision `getTodayActionItems()` already owns for estimates/quotes. **Before the spike is ever considered for merge, this rule must move into `packages/db` (a sibling function to `getTodayActionItems()`, or an extension of it)** so Layer 2 never makes this call itself. This is a required pre-merge fix, not a blocker for the work in this plan, since the spike stays unmerged reference material throughout.
- **Test brittleness review**: `today-redesign-spike-bot.spec.ts`'s 9 tests assert behavior (role visibility, URL destinations, org isolation, focus, overflow) and real data-driven text (fixture titles, status labels), not decorative markup or CSS classes. One test (`toBeFocused()`) checks accessible focus state directly. Assessment: **acceptable as a template for future batches**, not brittle to a future Base44 markup substitution — none of the assertions target class names, DOM structure, or visual styling.
- Spike components are marked `BASE44-REPLACEABLE` at their JSX boundary and the spike report explicitly states they are experimental/reference, not final visual design. This plan reaffirms that status — see the update to `base44-compatibility-spike-report.md` in this same change.

---

## 1. Executive vision

Forge's backend (auth, org isolation, capabilities, RLS, lifecycle state machines, accounting invariants) is correct and load-bearing — three security-hardening patches (Batch A, Forge V1.0.1, Forge V1.0.2) and the compatibility spike all confirm it. What's dated is the **presentation layer**: no shared design system, no desktop navigation shell, seven independently-reimplemented list pages, two disabled placeholder controls (dictate, photo) on the estimate-creation form, and UX friction already documented firsthand by Kevin (`docs/implementation/kevin-demo-ui-observation.md`).

Forge V1.1's goal: **one coherent, modern presentation layer across every route, built on the compatibility spike's proven 3-layer architecture, without moving a single line of authorization, lifecycle, or accounting logic.** Highest priority: Today (daily command center), Estimates (pricing lifecycle), Site Inspections (one-handed field use) — in that order, per Kevin's direction.

---

## 2. Route inventory

38 distinct routes/route-states across three surfaces. "Server/Client" reflects the top-level `page.tsx`; most have client sub-components for interactive pieces.

### Staff application — `app/(app)/*` (AuthGuard-wrapped, mobile bottom nav only — **no desktop nav shell exists today**)

| Route | Type | Purpose | Primary actions | Mobile importance | Test coverage |
|---|---|---|---|---|---|
| `/today` | Server | Daily command center: action queue, snapshot, quick actions, browse-data cards | Navigate to actionable items | High | `today-action-queue-bot` (7), spike ref (9) |
| `/requests` | Server | Inbound service-request list, filterable (open/done/all) | Open request, triage | High | `request-conversion-bot`, `request-site-visit-workflow-bot` |
| `/requests/[taskId]` | Server+Client | Request detail + triage decision | Triage (remote estimate / site visit / direct work order), mark reviewed | High | same |
| `/customers` | Server | Customer list, search, archetype badges | Search, open, create | High | `customer-crud-bot`, `customer-command-center-bot` |
| `/customers/new` | Client | Create customer | Submit | Medium | `customer-crud-bot` |
| `/customers/[customerId]` | Server+Client | Customer detail: stats, contact, notes, properties/jobs/quotes tiles | Navigate to related records | High | `customer-command-center-bot`, `operator-workflow-bot` |
| `/properties` | Server | Property list, search | Search, open | Medium | (list-only, no dedicated spec found) |
| `/properties/[propertyId]` | Server | Property detail incl. read-only `hazards` array | View, navigate to jobs/customer | Medium | `operator-workflow-bot` |
| `/site-visits/[siteVisitId]` | Server+Client | Schedule / inspection form / lifecycle actions / photo upload | Schedule, start, autosave findings, upload photos, complete, generate estimate | **Highest — field/mobile use** | `request-site-visit-workflow-bot`, `scheduling-bot` |
| `/estimates` | Server | Estimate list, filters | Open, create | High | `estimates-lifecycle-bot` |
| `/estimates/new` | Client | Manual estimate creation (capture-first form) | Submit; **Dictate/Add photo buttons present but disabled** | High | (create-path covered by lifecycle bot) |
| `/estimates/[estimateId]` | Server+Client | Line items, pricing-review handoff, quote creation | Edit line items, submit for review, approve/return, create quote | **Highest — daily staff use** | `estimate-pricing-review-handoff-bot`, `estimate-pricing-approval-presentation-bot`, `employee-estimate-workflow-bot` |
| `/quotes` | Server | Quote list, filters, new-quote dialog | Open, create | Medium | `quote-response-bot`, `quote-totals-recalc-bot` |
| `/quotes/[quoteId]` | Server+Client | Quote detail, send, resend | Send, view status | Medium | same |
| `/jobs` | Server | Job list, filters | Open, create | Medium | `operator-workflow-bot`, `scheduling-bot` |
| `/jobs/[jobId]` | Server+Client | Scheduling, deposits, change orders | Schedule, manage deposit/change orders | Medium | `deposit-invoice-creation-bot`, `scheduling-bot` |
| `/invoices` | Server | Invoice list, filters, new-invoice dialog | Open, create | Medium | `invoice-management-bot`, `working-invoice-protection-bot` |
| `/invoices/[invoiceId]` | Server+Client | Payment recording, void/refund | Record payment, void | Medium | `invoice-management-bot`, `invoice-totals-recalc-bot` |
| `/services` | Server | Service catalog browse | Search, filter | Low | (no dedicated spec found) |
| `/team` | Server+Client | Staff/membership, invites | Invite, resend, revoke | Low | `employee-onboarding-admin-invite-bot` |
| `/settings/website` | Server+Client | CRM-backed marketing content admin | Edit/publish content | Low | (owner/admin only, no dedicated spec found) |

### Public/unauthenticated

| Route | Purpose | Test coverage |
|---|---|---|
| `/login`, `/forgot-password`, `/update-password` | Staff auth | `auth-bot` |
| `/auth/accept-invite`, `/auth/confirm` | Invite acceptance, email confirm | `employee-onboarding-admin-invite-bot` |
| `/invite/[token]/continue` | Invite redirect handler | same |
| `/i/[token]` | Public invoice view (customer-facing legal/financial document) | `invoice-management-bot` (partial) |
| `/q/[token]` | Public quote view + accept/decline | `quote-response-bot` |

### Customer portal — `app/portal/*` (separate auth: magic-link or password)

| Route | Purpose | Test coverage |
|---|---|---|
| `/portal` | Portal landing/redirect | `portal-auth-bot` |
| `/portal/login`, `/portal/forgot-password`, `/portal/confirm` | Portal auth | `portal-auth-bot` |
| `/portal/dashboard` | Requests/quotes/invoices/change-orders/scheduling — **scheduling and change-order flows are forms embedded in this page, not separate routes** (`portal/scheduling/actions.ts`, `portal/change-orders/actions.ts`, `_components/book-scheduling-slot-form.tsx`, `_components/*-change-order-*.tsx`) | `scheduling-bot`, portal-relevant slices of others |

### API routes (not UI — out of scope for this plan, listed for completeness)

Actual routes confirmed on disk: `app/api/v1/{portal/link-account,quote-requests,service-requests,website-content}`, `app/api/e2e-health`, `app/api/client-error-log`. **`CLAUDE.md`'s documented route table (`api/webhooks/[service]/`, `api/assistant/tools/`) does not match the filesystem — those routes do not exist yet.** Flagged as pre-existing documentation drift, not a Forge V1.1 finding; not fixed as part of this plan since it's outside UX scope.

### Structural note: `/settings` and `/team`

`/settings` has **no index page** — only `/settings/website` exists under it. `/team` lives as a sibling top-level route, not nested under `/settings`, despite being conceptually an admin/settings concern. Worth resolving during UX-E (a `/settings` landing page, and a decision on whether `/team` moves under it) — not decided here, flagged for implementation-time judgment, not a Kevin product decision.

### Correction: `/quotes/new` and `/jobs/new` are real standalone routes

Both exist as dedicated pages (`app/(app)/quotes/new/page.tsx`, `app/(app)/jobs/new/page.tsx`, both wrapping the shared `components/forms/customer-property-work-form.tsx`) — separate from the `new-quote-dialog.tsx`/`new-invoice-dialog.tsx` components on the list pages, which are **not real modals** (confirmed: no Radix Dialog import, no overlay/portal pattern — inline/expand-in-place UI despite the "dialog" filename). No `@radix-ui/react-dialog` (or `-select`, `-tabs`, `-tooltip`, `-checkbox`, `-popover`) is installed in `apps/web/package.json` — only `@radix-ui/react-label` and `@radix-ui/react-slot`. **A real Dialog/Modal primitive requires a new dependency**, not just a new component — flagged for UX-A's dependency footprint.

### Access-denied / error states

No dedicated `app/(app)/error.tsx`, `not-found.tsx`, or `loading.tsx` exists at the `(app)` **root**. A well-designed per-route pattern exists but is applied inconsistently: `customers/` has both a real `loading.tsx` (a designed skeleton-of-sorts, not a spinner, per an existing CONVENTIONS rule: *"every list view shows a designed loading state rather than a global spinner"*) and a real `error.tsx` (client boundary, reports to `reportClientError`, "Try again" reset button); `invoices/` and `jobs/` have `error.tsx` only, no `loading.tsx`; **every other route** (`properties`, `quotes`, `estimates`, `requests`, `site-visits`, `services`, `team`, `settings/website`) has neither. Each page additionally inlines its own error branch for expected failures (see `OrgContextError` pattern, reused ~15 places) — this is separate from and correctly complements the `error.tsx` safety net for *unexpected* errors. **The gap is inconsistent application of an already-good pattern, not a missing pattern** — see §3.

---

## 3. UX audit findings

Findings are graded by evidence, not taste. Three sources of pre-existing, evidence-based findings are incorporated rather than duplicated: `docs/implementation/kevin-demo-ui-observation.md` (Kevin's own walkthrough, 6 logged findings, 4 already fixed), `docs/ux/request-list-density-recommendation.md`, `docs/ux/hazards-section-proposal.md`.

### Navigation
- **No desktop navigation shell exists.** `app/(app)/layout.tsx` renders only `<AppBottomNav>` (mobile) — on a desktop/tablet-landscape viewport there is no persistent way to move between sections other than the browser back button or an in-page link. This is the single largest structural gap.
- Mobile bottom nav (6 items: Today/Jobs/Quotes/Invoices/Customers/Requests) omits Estimates, Properties, Team, Settings, Site Visits entirely — reachable only via in-page links.
- Bottom-nav badge crowding — **already fixed** (Kevin finding #3, PR #87).

### Information architecture
- **Seven list pages** (`customers`, `properties`, `quotes`, `jobs`, `invoices`, `requests`, `services`) independently reimplement the same pattern: `getActiveOrgContext` → list query → status-filter buttons → `Input` search → manual row/card markup. No shared list/table component exists — confirmed by direct inspection of all seven `page.tsx` files.
- Request list: tall cards, always-expanded phone/email, no full-row tap target, status not visually dominant — **documented, not fixed** (`request-list-density-recommendation.md`).
- No consistent status-color vocabulary — every page independently defines its own `colorMap` (confirmed pattern from the spike's own `StatusPill` rationale, which cites this exact problem).

### Forms
- Inspection form measurement rows — **already fixed** (Kevin finding #5, `COLUMN_META`, PR #87).
- Estimate pricing-review handoff — **already fixed** (Kevin finding #1, PR #86).
- New-estimate form has two **disabled placeholder controls** (Dictate, Add photo) with `title="...isn't wired up yet"` — confirmed by direct code read of `estimates/_components/new-estimate-form.tsx:99-123`. Explicitly called out by Kevin as a Forge V1.1 requirement (see §9 Photos/Dictation).
- Hazards section — flat checkbox row, no "none observed" positive state, no severity — **proposal written, awaiting Kevin's decisions** (`hazards-section-proposal.md`, unchanged by this plan).

### Workflow usability
- Today action queue already implements the "disappear the instant it's not actionable" pattern correctly (§5's requirement is already met by existing `getTodayActionItems()` — this plan's job is presentation, not behavior).
- Estimate detail page correctly gates pricing approval by capability; Kevin's walkthrough confirmed employee/subcontractor cannot approve their own pricing (working as intended).

### Accessibility
- No systematic audit exists yet. Confirmed baseline: interactive elements throughout use semantic `<button>`/`<a>` via `Button`/`Link` primitives (not `<div onClick>`), consistent with what the spike's accessibility check found for `/today`. Focus-visible rings are applied inconsistently (present on some card links, absent on others) — needs a systematic pass in UX-A.
- Color-only status signals: `StatusPill` (spike) pairs color+text; most existing per-page `colorMap` badges also pair color+text already (spot-checked `requests`, `jobs`) — low risk, but not verified page-by-page.

### State presentation
- **Loading state exists but only on 1 of ~20 routes** (`customers/loading.tsx`) — the established convention (designed skeleton, not a spinner) should extend to every route, not be reinvented per-route.
- **Route-level error boundary (`error.tsx`) exists on only 3 of ~20 routes** (`customers`, `invoices`, `jobs`) — same good pattern (client boundary, `reportClientError`, reset button), needs extending, not redesigning.
- **No shared component for the *expected*-failure case.** `OrgContextError` covers org-context-resolution failure only (~15 call sites); other expected query failures inline their own ad-hoc red-text block (confirmed pattern in `/today`'s second error branch) instead of reusing a shared primitive.
- **No shared empty state.** Each list page writes its own "no results" text inline.
- **No shared access-denied state.** A capability check failure surfaces as a raw error string in at least one confirmed historical case (Kevin finding #1, now fixed for that specific instance, but no systemic access-denied component exists).

---

## 4. Forge V1.1 design system

### Audit of what exists today
`apps/web/components/ui/`: `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `sonner.tsx` (toast). `apps/web/components/`: `timeline.tsx`, `org-context-error.tsx`, `navigation/app-bottom-nav.tsx`, `navigation/requests-badge.tsx`, `auth/auth-guard.tsx`, `forms/customer-property-section.tsx` + resolver hook. **Missing entirely**: Badge/StatusPill, Table, Modal/Dialog, Drawer/Sheet, Skeleton, EmptyState, ErrorState, AccessDeniedState, PageHeader, desktop nav, unit-aware/money inputs, photo uploader (exists only as a route-specific component in `site-visits/_components/photo-upload.tsx`, not shared), dictate control (doesn't exist at all).

### Proposed shared primitives (`apps/web/components/ui/` unless noted)

| Primitive | Justification |
|---|---|
| `status-pill.tsx` | Promoted from the spike (already proven on `/today`); replaces ~7 independent `colorMap` implementations |
| `page-header.tsx` | Every route re-implements a title+actions header inline; audited pattern is consistent enough to share |
| `app-shell.tsx` + desktop nav (`components/navigation/app-desktop-nav.tsx`) | Closes the confirmed no-desktop-nav gap |
| `empty-state.tsx`, `error-state.tsx`, `access-denied-state.tsx` | Closes the three confirmed state-handling gaps; `error-state` and `access-denied-state` supersede ad-hoc inline blocks, `OrgContextError` becomes a thin wrapper around `error-state` for its specific case |
| `loading-skeleton.tsx` | Generalizes the existing `customers/loading.tsx` pattern (designed skeleton, not a spinner — already an established CONVENTIONS rule) to the 19 routes that don't have it yet |
| `dialog.tsx` (new dependency: `@radix-ui/react-dialog`) | `new-quote-dialog.tsx`/`new-invoice-dialog.tsx` are misleadingly named — no real Dialog/overlay primitive exists in the app; needed for any real modal (e.g. `confirmation-dialog.tsx` below) |
| `responsive-list.tsx` (table-to-card) | Replaces the 7 duplicated list-page patterns — one component, desktop renders rows, phone renders cards, same data |
| `form-field.tsx`, `money-input.tsx`, `unit-input.tsx` | Standardizes label/error/help-text pattern; money/unit inputs address the audit's "ambiguous units" finding (inspection-form's fixed `COLUMN_META` pattern generalizes here) |
| `autosave-indicator.tsx` | Promotes the existing inline `SaveIndicator` (inspection-form.tsx) to shared, reused by estimate editing |
| `action-bar.tsx` | Capability-aware action bar — consumes `hasCapability()` results passed as props, never re-derives them |
| `confirmation-dialog.tsx` | For any destructive action (void invoice, revoke invite, etc.) |
| `photo-uploader.tsx` | Wraps the **existing, functional** signed-URL upload pattern (`site-visits/_components/photo-upload.tsx`) with thumbnails, retry, multi-file, remove — see §9 |
| `dictate-button.tsx` | New; see §9 for the full functional contract |

**Not promoted yet** (route-specific, insufficient evidence of reuse need): `timeline.tsx` stays as-is pending an audit of where else it'd apply; `customer-property-section.tsx` stays scoped to forms/ until a second consumer beyond its current 3 forms is identified.

### Standards
- **Breakpoints**: reuse Tailwind defaults already in use (`sm`/`md`/`lg`) — no new breakpoint scale needed, confirmed consistent usage across existing pages.
- **Touch targets**: 44×44px minimum (already the mobile-nav standard, `min-h-14` rows) — apply uniformly.
- **Safe-area**: `env(safe-area-inset-bottom)` (already applied to bottom nav) — extend to any new sticky footer (e.g. field-inspection action bar).
- **Table-to-card rule**: below `md`, `responsive-list` renders cards; at `md` and above, rows. Matches the spike's confirmed tablet behavior (4-column grid held at 768px).
- **Density**: default to the spike's proven density (comfortable, not compact) — final density is a Kevin decision (§10).
- **Status semantics**: amber = awaiting action/pending, emerald = approved/ready/positive, blue = in-progress/informational, red = error/destructive/denied — extends the spike's 3-tone `StatusPill` with red for the new error/access-denied states.

---

## 5. Implementation batches

### Batch UX-A — Shared foundation — **MERGED** (2026-08-04, PR #104, merge commit `05fbead`)
- **Routes touched**: none directly (infrastructure only); `(app)/layout.tsx` gained the shell wrapper.
- **Components shipped**: `status-pill`, `page-header`, `empty-state`, `error-state`, `access-denied-state`, `loading-skeleton`, `form-field`, plus `app-desktop-nav`/`app-shell` (the new persistent desktop/tablet nav — previously no desktop nav existed at any viewport).
- **Verified on merged `main`**: `pnpm test` 187/187, typecheck/build clean, representative E2E smoke 11/11, live desktop nav walkthrough. One pre-existing bug found during this verification (not a UX-A regression): a phone-width overflow in Today's action-queue rows — fixed as part of the Today redesign (Batch UX-B PR2, see below).
- **Acceptance criteria met**: typecheck/build clean, zero changes outside `apps/web/components/` + `(app)/layout.tsx` + docs.

### Batch UX-B — Daily work and field execution (highest priority, per Kevin)

**PR2 (Today) — MERGED** (PR #105, squash-merged to `main` at `d9c9ff1`). Full detail: `docs/ux/forge-v1.1-today-redesign.md`. Corrected the Base44 spike's one confirmed defect (relocated the `buildQuoteActivityRows()`/quote-activity workflow-relevance rule from Layer 2 into `packages/db/queries/today-actions.ts`, alongside `getTodayActionItems()`) before merging any of its code. Applied Kevin's Today-specific decisions: actionable-only operational counts (no accounting totals), capability-filtered quick actions, removed navigation duplicated by the now-persistent UX-A desktop nav, merged jobs+site-visits into one schedule. 18 new unit tests, 20 new E2E tests. **Post-merge validation on `main`**: `pnpm test` 205/205, typecheck/build clean, 27/27 E2E on a clean re-run, phone overflow (390×844) explicitly re-verified fixed.

**PR3 (Estimates) and PR4 (Site Inspection) — not started.**

- **Routes**: `/today` (done), `/estimates`, `/estimates/[estimateId]`, `/estimates/new`, `/site-visits/[siteVisitId]` (not started).
- **Shared components required**: everything from UX-A.
- **Dependencies**: UX-A merged first.
- **Existing tests to preserve**: `today-action-queue-bot` (7, preserved unmodified), `estimate-pricing-review-handoff-bot`, `estimate-pricing-approval-presentation-bot`, `employee-estimate-workflow-bot`, `estimates-lifecycle-bot`, `request-site-visit-workflow-bot`, `scheduling-bot`.
- **New tests**: Today shipped 18 unit + 20 E2E (see `docs/ux/forge-v1.1-today-redesign.md`). Estimates/Site Inspection still need: Estimates (creation/editing/pricing-review/quote-handoff on new shell), Site Inspection (autosave/photos/hazards/completion on new shell + functional dictate/photo per §9).
- **Mobile risk**: highest — this batch includes the one-handed field-use requirement.
- **Backend-contract risk**: low for Today/Estimates (pure presentation); **medium for site-inspection photo/dictate** if any gap requires new fields (flagged, not assumed — see §9).
- **Estimated PRs**: 3 (Today, Estimates, Site Inspection — per Kevin's explicit "do not combine" instruction).

### Batch UX-C — Intake and records
- **Routes**: `/requests`, `/requests/[taskId]`, `/customers`, `/customers/[customerId]`, `/customers/new`, `/properties`, `/properties/[propertyId]`.
- **Shared components required**: `responsive-list`, `page-header`, `status-pill`, `empty-state`, plus request-list-density-recommendation's specific findings (full-row tap target, elevated status).
- **Dependencies**: UX-A; benefits from UX-B's `photo-uploader`/`dictate-button` if note-taking is added to customer/property records (not committed here — see Kevin decisions).
- **Existing tests**: `customer-crud-bot`, `customer-command-center-bot`, `request-conversion-bot`.
- **New tests needed**: list density/tap-target regression, cross-navigation (customer↔property↔job).
- **Mobile risk**: medium.
- **Backend-contract risk**: none anticipated.
- **Estimated PRs**: 2–3 (requests; customers+properties can likely combine since they share patterns).

### Batch UX-D — Sold work and accounting
- **Routes**: `/quotes`, `/quotes/[quoteId]`, `/jobs`, `/jobs/[jobId]`, `/invoices`, `/invoices/[invoiceId]`.
- **Shared components required**: `responsive-list`, `status-pill`, `confirmation-dialog` (void/refund), `money-input` (display, not necessarily editable).
- **Dependencies**: UX-A; UX-C's list pattern proven first reduces risk.
- **Existing tests**: `quote-response-bot`, `quote-totals-recalc-bot`, `deposit-invoice-creation-bot`, `invoice-management-bot`, `invoice-totals-recalc-bot`, `working-invoice-protection-bot`, `scheduling-bot`.
- **New tests needed**: presentation-layer regression only — totals/accounting logic is explicitly out of scope for any UI change (non-negotiable rule, §"architecture rules").
- **Mobile risk**: medium — deposit/change-order/payment flows are flagged "requires caution" in the original handoff doc.
- **Backend-contract risk**: none anticipated; highest scrutiny batch given financial-document adjacency.
- **Estimated PRs**: 3.

### Batch UX-E — Administration and customer surfaces
- **Routes**: `/team`, `/settings/website`, auth pages, `/portal/*`, `/i/[token]`, `/q/[token]`, access-denied/not-found/global-error.
- **Shared components required**: `access-denied-state`, `error-state`, portal-specific density decisions (Kevin decision, §10).
- **Dependencies**: UX-A; ideally last, since portal/public-document pages need the most conservative review (customer-facing legal/financial documents, per the handoff doc's explicit caution list).
- **Existing tests**: `employee-onboarding-admin-invite-bot`, `auth-bot`, `portal-auth-bot`.
- **New tests needed**: access-denied rendering, portal empty/error states.
- **Mobile risk**: low-medium.
- **Backend-contract risk**: none anticipated.
- **Estimated PRs**: 2–3.

**Kevin's instruction is followed exactly: no batch is combined into one PR; UX-B alone is 3 separate PRs (Today/Estimates/Site Inspection) as explicitly required.**

---

## 6. Today, Estimates, and Site Inspection — detailed requirements

### 6.1 Today — daily command center

**Purpose**: the first screen every session, answering "what needs me right now."

**Must include** (per Kevin's direction + existing proven behavior): Needs Your Attention (existing `getTodayActionItems()`, unchanged), role-aware task visibility (existing, unchanged), today's site visits/jobs (existing `todayJobsResult` query, unchanged), estimates awaiting work/review (existing action-queue `pricing_review_requested`/`create_quote` kinds), quotes awaiting send/response (existing `send_quote` kind + `pendingQuoteActivity`), invoices/payments requiring action (**not currently in the action queue — flagged as a genuine scope question, not assumed**, see Kevin decisions), concise operational snapshot (existing `SnapshotGrid`), quick actions (existing), clear empty state (existing, proven in spike), active-org identity (existing `getActiveOrgContext`, proven in spike), immediate action disappearance (existing, proven by both test suites).

**Explicitly avoid**: vanity metrics with no action attached (audit the existing 4 snapshot cards — `Customers`/`Properties`/`Jobs`/`New requests` counts are arguably vanity-adjacent since none are directly actionable from the number alone; **flagged for Kevin's call**, not silently changed), duplicate navigation (the snapshot cards already link to list pages the bottom nav also reaches — acceptable today, worth reconsidering once desktop nav exists), cards with no actionable meaning.

**Architecture**: exactly the spike's 3-layer pattern (§0), continuing from `spike/base44-today-compat` as reference once its pre-merge fix (§0) lands.

### 6.2 Estimates — pricing lifecycle

**Must make unambiguous at every step**: what's editable vs. calculated (line-item quantity/rate are editable; totals are trigger-owned, never editable — this is a non-negotiable accounting invariant, not a UI choice), whether changes are saved (needs an `autosave-indicator`, currently line-items-section.tsx likely uses explicit save — confirm during implementation, don't assume autosave exists here the way it does for inspections), whether pricing is approved (existing `pricing_review_status`/`pricing_reviewed_at` — already well-surfaced per Kevin's fixed finding #1), who must act next (existing pricing-review-panel logic, needs visual elevation not new logic), what customer/property/job context the estimate belongs to, whether quote creation is available (existing gate: pricing approved + came from a request + no quote yet).

**Explicitly avoid**: ambiguous measurement/unit rows (pattern already fixed for inspection-form's `COLUMN_META`; the shared `unit-input`/`money-input` primitives in §4 generalize this fix to estimates), long undifferentiated forms (line-items-section.tsx is 212 lines today — needs sectioning, not more fields), hidden totals, multiple competing primary actions (audit `advance-status-button.tsx` + `pricing-review-panel.tsx` + `create-quote-button.tsx` together for redundant/competing CTAs during implementation), raw capability errors (Kevin's finding #1 already fixed the one confirmed instance; systemic fix is the new `access-denied-state` component in UX-A).

**Photo/dictate**: the two disabled buttons on `new-estimate-form.tsx` are real, confirmed, in-scope requirements — see §9.

### 6.3 Site inspection — one-handed field use

**Existing, proven, working backend** (confirmed by direct code read — this is a presentation modernization, not new plumbing, except where §9 identifies a genuine gap): debounced per-field autosave with idle/saving/saved/error states (`inspection-form.tsx`), required-field completion validation (`completeSiteVisitWithValidationAction`), signed-URL photo upload with camera capture (`photo-upload.tsx`, `capture="environment"` already set).

**Must include**: appointment/customer/property header (context must be visible without scrolling on phone), inspection progress (no current section/step indicator — 346-line flat form, needs sectioning), clear section navigation, hazards (per existing `hazards-section-proposal.md` — **implementation must wait for Kevin's taxonomy/severity/completion-policy decisions**, do not silently pick a taxonomy), measurements/quantities/materials (already fixed field-level, needs section-level grouping), notes, photo capture/upload (functional today, needs multi-photo/thumbnail/retry UI per §9), autosave confidence (existing `SaveIndicator`, promote to shared `autosave-indicator`), completion-readiness summary (new — surface which required fields are still missing before allowing "Complete"), missing-required-item indicators, complete action, generate-estimate handoff (existing `generate-estimate-button.tsx`).

**Offline/interruption**: existing autosave already provides significant resilience (per-field save on a 1.2s debounce means minimal data loss on a dropped connection), but there is **no explicit offline-queue or reconnect-retry behavior** today — this is a genuine open scope question, see Kevin decisions (§10), not assumed in scope for UX-B.

**Explicitly avoid**: excessively long single-column form without sections (current state — 346 lines, flat), repeated labels, tiny add/remove controls, ambiguous units (same `unit-input` fix as estimates), hidden save state, destructive completion without readiness confirmation (currently `completeSiteVisitWithValidationAction` fails with a toast if required fields are missing — needs a pre-emptive readiness summary, not just a post-hoc failure).

---

## 7. Base44 integration contract

Extends `docs/ux/base44-handoff.md` (application-wide constraints added there in this same change) and the spike's proven pattern.

**Base44 output may provide**: JSX/TSX presentation markup, layout, visual hierarchy, responsive design, animation, presentation components, icons, non-authoritative client presentation state (e.g. which accordion section is expanded).

**Base44 output may not own**: database access, Supabase clients, authentication, org-switching logic, capabilities, lifecycle transitions, server actions, RPC calls, accounting calculations, RLS assumptions, customer-safe projection rules, trusted-write logic, persistent status logic.

**Every generated route integrates through**: existing page/query layer (Layer 1, unchanged) → pure adapter/view-model (Layer 2, new per route, no I/O/authorization) → replaceable presentation components (Layer 3, marked `BASE44-REPLACEABLE`) → existing actions passed as controlled callbacks/forms (never a new endpoint).

**Required of all generated output**: TypeScript (no `any`), semantic HTML, preserved keyboard access, phone+tablet support (no fixed desktop-only widths), shared Forge primitives (§4) not one-off reimplementations, explicit loading/empty/error states (no silent blank screens), no direct Supabase imports, no hidden authorization assumptions, preserved existing route destinations, preserved testable accessible names (`getByRole`/`getByLabel`-friendly).

**Layer 2 view models may**: normalize existing data for display, group records, calculate presentation-only labels, select icons/display variants, create sections from already-authorized data.

**Layer 2 view models may not**: make authorization decisions, determine whether an action is legally/contractually allowed, invent workflow states, perform database calls or mutations, duplicate pricing/accounting calculations, replace server validation. **(This is the exact rule the spike's own relocated business rule violated — see §0 — and must be corrected before that reference code is trusted as a template without modification.)**

---

## 8. Test strategy

Every existing spec listed in §2's coverage columns is preserved unmodified unless a route's actual behavior changes (it should not, for a presentation-only batch). Each batch adds behavior-focused E2E coverage following the spike's proven pattern: assert accessible roles/labels, real data content, URL destinations, and viewport/overflow — never CSS classes or DOM structure, so tests survive a future real-Base44-output substitution.

**Shared foundation (UX-A)**: desktop nav rendering/active-state, mobile nav (existing, preserved), safe-area, org-context display, keyboard focus baseline, loading/empty/error/access-denied state rendering, no horizontal overflow at phone/tablet.

**Today (UX-B)**: existing 7 (`today-action-queue-bot`) + spike's 9 (adapted to the new shell) — role visibility, disappearance, navigation, org switching, phone, tablet, sign-out.

**Estimates (UX-B)**: creation, editing, saving/autosave-if-applicable, totals-unchanged (regression only, never re-tested as a UI concern), pricing-review submission, owner approval, return-for-changes, create quote, send quote, role restrictions, mobile editing, keyboard behavior, loading/error/empty states.

**Site Inspection (UX-B)**: schedule, start, autosave, measurements/quantities/materials, hazards (once Kevin's decisions land — not before), photos (functional test per §9), completion readiness, complete, generate estimate, phone/tablet layout, touch targets, keyboard/focus, authorization. Offline/interruption-recovery tests only if Kevin approves that scope (§10).

---

## 9. Photo and dictation — functional requirements

### 9.1 Photo audit

| Route | Current state |
|---|---|
| `/site-visits/[siteVisitId]` | **Fully functional and more robust than initially assessed**: quarantine-then-finalize pattern — client requests a signed-upload target (`requestSiteVisitPhotoUploadAction`, validates MIME/size/org/a 20-photo-per-entity cap), uploads directly to `site-visit-attachments` Storage at a `{orgId}/pending/{uploadId}` path, then `finalizeSiteVisitUpload()` (service-role only) decodes with `sharp` to verify real content (never trusts declared MIME), guards against decompression bombs and animated images, **auto-orients and strips all EXIF/GPS data**, re-encodes as JPEG, and writes to a permanent `{orgId}/{entityType}/{entityId}/{uploadId}.jpg` path. Reads are always time-limited signed URLs, never public. Camera capture (`capture="environment"`) already works. **Missing** (genuinely a UI task): multi-file batch, thumbnail preview, upload-progress/retry UI, remove/replace, captions. **Genuine gap, not just UI**: no customer-safe photo projection exists anywhere — the entire `app/portal/*` tree has zero references to `vault_items`/photos; site-visit photos are staff-only today, by omission not by a deliberate customer-safe filter. If UX-E's "portal-safe photo presentation" is pursued, that specific piece needs its own reviewed data-boundary decision, not silent inclusion. |
| `/estimates/new` | **Disabled placeholder** ("Add photo" button, `title="Photo capture isn't wired up yet"`). No underlying data model confirmed for attaching a photo to an in-progress (not-yet-created) estimate description. **Classified as a product gap** — smallest implementation (likely: reuse the vault_items/signed-URL pattern already proven for site-visits, scoped to estimates) must be proposed and reviewed separately from pure UI work, not silently built as part of a "modernization" pass. |
| All other routes (requests, customers, properties, quotes, jobs, invoices, change orders, portal) | No photo control found in any of these routes' current UI. Out of scope unless Kevin requests it (§10). |

**Site-inspection photo requirements for UX-B**: camera capture (existing) + gallery/file-picker (existing) + immediate thumbnails (new) + uploading/uploaded/failed/finalizing states (new — the existing component only shows a single "Uploading…" text line) + retry after failure (new) + removal before completion (new — no removal path exists today) + preserve the existing private-Storage/finalization model exactly + block completion when a required upload is unresolved (new — ties into the completion-readiness summary from §6.3) + internal-only vs. customer-visible distinction **only if that distinction already exists in the data model** (needs confirmation during implementation — the audit did not find explicit per-photo visibility flags, only the template-level `staff_only` field-visibility pattern used for hazards).

**Non-negotiable**: no public Storage buckets, no bypassing quarantine/finalization, no Storage paths written from presentation code (all writes go through the existing signed-URL actions), no private photos exposed through customer routes, no duplicated upload logic (the `photo-uploader.tsx` shared component wraps the existing actions, it does not reimplement them).

### 9.2 Dictation audit

**Exactly one control found repo-wide** (confirmed by direct grep across `apps/web`): the disabled "Dictate" button on `/estimates/new` (`new-estimate-form.tsx:99-109`, `title="Voice dictation isn't wired up yet"`). No dictation control exists anywhere else — not on site-inspection notes, hazard notes, request notes, or job logs, despite those being listed as primary use cases in Kevin's requirements. **This means UX-B/C's dictation work is net-new UI, not a "connect the wiring" task** — there is no existing partial implementation to complete.

**Required shared component**: `dictate-button.tsx` under `apps/web/components/ui/`, implementing the full state machine Kevin specified (idle → requesting-permission → listening → processing → transcription-ready → unavailable/permission-denied/error), with an obvious stop control, append-vs-replace behavior, no auto-submit, safe behavior on navigation/modal-close while listening, keyboard accessibility, and live-region status announcements for screen readers.

**Implementation approach — browser-native only for V1.1**: per Kevin's explicit instruction, this plan does not install or integrate any third-party transcription service. The Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`) is the only implementation path evaluated in this plan. **Known limitation, to document not silently work around**: Web Speech API browser support is inconsistent (strong in Chrome/Edge, absent in Firefox, partial/prefixed in Safari) — the `unavailable` state in the required state machine exists specifically to handle this gracefully rather than pretending universal support. A separate, later option comparison (browser-native vs. a hosted provider) is Kevin's decision (§10), not decided here.

**Security/privacy, non-negotiable**: no raw audio storage without separate explicit approval, no external audio transmission without a separate security/privacy review, no continuous/automatic microphone access, no auto-start listening, no cross-org exposure of dictated content, existing field authorization/validation/length limits apply to dictated text exactly as typed text.

### 9.3 Batching (adopting Kevin's proposed structure exactly)

- **UX-A**: shared photo-uploader presentation pattern (wrapping existing site-visit upload actions) + `dictate-button` contract and Web Speech API browser-support evaluation, written up, no functional wiring yet.
- **UX-B**: fully functional site-inspection photos (multi-file, thumbnails, retry, removal, completion-blocking) + fully functional site-inspection dictation (notes fields) + estimate-note dictation where a text field already exists to dictate into.
- **UX-C**: request/customer/property note dictation (all currently have no dictation control — net-new) + record-specific photo controls only where an approved data model already exists (none currently found outside site-visits — see 9.1's estimate-photo gap, which needs its own separate proposal before UX-C, not silent inclusion).
- **UX-D/E**: job logs, change orders, portal-safe photo presentation (customer-visible photos only, respecting the private/customer-safe boundary), remaining routes.

**Standing rule, applied everywhere**: no route may ship a visibly enabled photo or dictate control unless its action is functional, authorized, tested, and has a defined failure state. Any control that stays unavailable in a given batch must be either removed from the active interface or clearly labeled "coming soon" — never left as an unexplained grayed-out button (the current `new-estimate-form.tsx` pattern, with its explicit `title` tooltip, is the acceptable interim pattern; a control with no explanation at all would not be).

---

## 10. Kevin decisions

**Resolved this phase** (applied in the Today redesign, `docs/ux/forge-v1.1-today-redesign.md`):

- Today shows actionable operational counts only, never accounting totals/vanity metrics → applied (New requests, Today's work, Invoices needing action).
- Density: balanced (compact enough for operational use, not cramped, accessible touch targets) → applied throughout Today.
- Tablet convention: hybrid — desktop-style persistent nav where space permits (Batch UX-A's desktop nav already activates at `md`/768px, covering tablet portrait and up), touch-friendly cards/forms, not desktop tables forced onto tablet → confirmed as the standing rule.
- Spike visuals are directionally useful/approved as an architectural reference, not final visual approval → applied; Today reuses the spike's layout ideas, hierarchy, and adapter pattern, not treated as mandated pixel-level design.
- Dictation: browser-native Web Speech API evaluation only, no hosted provider, not implemented in the Today PR (Today has no note-entry use case) → confirmed, deferred to UX-B's Estimates/Site-Inspection PRs where dictation is actually in scope.
- Photos: existing site-visit photo pipeline untouched by Today work, preserved exactly; photo functionality remains primarily a Site Inspection (PR4) concern → confirmed, untouched.
- Portal branding: tenant-first, Forge secondary/absent on customer-facing surfaces → noted, does not materially affect Today (no portal work in this PR); preserved as a constraint for future portal-touching batches.

**Still genuinely unresolved** (not implementation details, need Kevin's input before the relevant batch):

1. Final hazard categories and required-completion behavior (unchanged open question from `hazards-section-proposal.md`) — relevant to PR4 (Site Inspection).
2. Whether field inspections require offline/interruption-recovery support in V1.1, or whether the existing per-field autosave (1.2s debounce) is sufficient resilience for now — relevant to PR4.
3. Whether employee and owner estimate editing should look visually identical (same layout, different available actions) or intentionally different — relevant to PR3 (Estimates).
4. Whether invoices/payments requiring action should be added to the Today action queue itself (distinct from the operational-count snapshot, which now does show an invoices count) — a possible future enhancement, not required for Today to ship.
5. Whether estimate note fields should support photo attachment as a reviewed follow-on feature (the specific gap found in §9.1), and if so, on what timeline relative to PR3/PR4.

---

## 11. Rollout order, rollback, risks, definition of done

**Rollout order**: UX-A (foundation) → UX-B as 3 separate PRs (Today, Estimates, Site Inspection, in that order) → UX-C → UX-D → UX-E. Each batch's PRs merge and are verified independently before the next batch starts; no batch is combined into one PR (Kevin's explicit instruction).

**Rollback**: every batch is additive/presentation-only with zero backend-contract changes (§ architecture rules) — rollback for any batch is a plain `git revert` of that batch's PR(s), no data migration, no Supabase state to unwind. The Base44 spike branch's own rollback procedure (delete branch, no PR was ever opened) remains the model for any future exploratory branch.

**Risks**: (a) the spike's relocated business-rule issue (§0) if not fixed before any code from that branch is reused as more than reference; (b) site-inspection photo/dictate work in UX-B has more backend-adjacent risk than pure presentation batches — scope it conservatively and re-flag as a "product gap" (per Kevin's own instruction) rather than quietly expanding it; (c) financial-document routes (UX-D, `/i/[token]`, `/q/[token]`) carry the highest review-rigor requirement per the original handoff doc — do not rush.

**Definition of done** (per batch): typecheck/build clean; all pre-existing tests for touched routes still pass; new behavior-focused tests pass; `git diff` scoped to the batch's declared files; zero Supabase/RLS/RPC/migration changes unless explicitly and separately reviewed; mobile/tablet verified at the standard viewports (390×844, 768×1024); accessibility baseline (focus, semantic controls, no color-only signals) verified; PR opened, not merged, awaiting Kevin's review.
