# Base44 Handoff — Boundaries, Route Map, and Redesign Scope

Status: living reference document, current as of the Pre-Base44 Workflow Refinement phase (PR #87, commit `cca3ba7`, following the pricing-review handoff in PR #86, commit `96a40e6`). This document is the single source of truth for what a Base44-driven UI redesign may and may not touch. It does not authorize the Base44 compatibility spike itself — see `docs/ux/base44-compatibility-spike-plan.md` for the spike's scope, which still requires separate explicit approval to run.

The software product is **Forge** (approved naming — see `docs/architecture/forge-foundry-brand-boundaries.md`). Premier Property Maintenance is the first business operating on it; the Demo organization is now named **Forge Demonstration**. Any historical reference to "Premier CRM" in older documents predates this rename and is preserved as written.

---

## 1. What Base44 MAY change

- Layout and visual hierarchy of any screen listed as "safe to redesign" in §6.
- Typography, spacing, color system, component styling (as long as accessible contrast and legible type sizes are preserved).
- Navigation presentation (the mobile bottom nav, any future desktop nav) — not the route structure it points to.
- Component styling/composition, as long as the same data is displayed and the same actions are exposed with the same authorization behavior.
- Wording/copy on internal-facing screens (not customer-facing legal/financial documents — see §8).
- Information density (e.g. the request-list recommendation in `docs/ux/request-list-density-recommendation.md`).
- Responsive/mobile interaction patterns (tap targets, expand/collapse, bottom-sheet vs. inline, etc.).

## 2. What Base44 MAY NOT change

- Database schema, migrations, RLS policies, RPC signatures or authorization logic.
- Capability enforcement (`packages/shared/permissions.ts`'s `CAPABILITIES` map and the SQL `role_has_capability()` mirror) — a UI redesign must call the same capability checks, never introduce new ones or bypass existing ones client-side.
- Organization isolation (`getActiveOrgContext()`, `org_id` scoping on every query) — every query/action must remain scoped exactly as it is today.
- Lifecycle transitions (request → triage → estimate/quote/job → invoice → payment) and their state machines — see §4.
- Quote/job/invoice/payment semantics or accounting invariants (e.g. `amount_paid` owned solely by `apply_payment_to_invoice()`, totals owned solely by their recalc triggers).
- Storage security (signed URLs, bucket policies, cross-org denial).
- Customer-safe projections — any field marked `visibility: "staff_only"` in an inspection template, or any query that already excludes internal fields from portal-facing responses, must stay excluded regardless of new UI.

**In short: Base44 owns presentation. It does not own data flow, authorization, or lifecycle.**

---

## 3. Route map

### Authenticated CRM — `app/(app)/*` (staff/owner/admin/employee/subcontractor)

| Route | Purpose |
|---|---|
| `/today` | Role-aware dashboard: snapshot counts, **new "Needs your attention" action queue** (§5), pending quote activity |
| `/requests`, `/requests/[taskId]` | Inbound service-request list + triage detail |
| `/estimates`, `/estimates/[estimateId]`, `/estimates/new` | Estimate list/detail/creation, pricing-review handoff UI |
| `/quotes`, `/quotes/[quoteId]`, `/quotes/new` | Quote list/detail/creation |
| `/jobs`, `/jobs/[jobId]`, `/jobs/new` | Job list/detail/creation, scheduling, deposits, change orders |
| `/invoices`, `/invoices/[invoiceId]` | Invoice list/detail, payments |
| `/customers`, `/customers/[customerId]`, `/customers/new` | Customer CRUD |
| `/properties`, `/properties/[propertyId]` | Property detail (includes read-only `hazards` array — see hazards proposal) |
| `/site-visits/[siteVisitId]` | Inspection form, schedule/start/complete flow |
| `/services` | Service catalog |
| `/settings/website` | Website-content admin |
| `/team` | Staff/membership management |

### Customer portal — `app/portal/*` (customer, magic-link or password auth)

`/portal`, `/portal/login`, `/portal/dashboard`, `/portal/scheduling`, `/portal/change-orders`, `/portal/confirm`, `/portal/forgot-password`.

### Public/unauthenticated

`/`, `/login`, `/forgot-password`, `/update-password`, `/auth/accept-invite`, `/auth/confirm`, `/i/[token]` (public invoice view), `/q/[token]` (public quote view), `/invite/[token]/continue`.

### API (not UI, do not touch for a UI-only redesign)

`/api/webhooks/[service]`, `/api/assistant/tools`, `/api/v1/*` (mobile API), `/api/e2e-health`, `/api/client-error-log`.

---

## 4. Full lifecycle (unchanged by this or any prior UI phase)

```
service request (new)
  → staff reviews (reviewing)
  → triage decision (record_request_triage RPC): remote_estimate | site_visit_required | direct_work_order

  remote_estimate: estimate created immediately (draft)
  site_visit_required: site visit scheduled → started → inspection (autosave) →
    completed → estimate generated (idempotent, source_site_visit_id)
  direct_work_order: job created immediately, skips estimate/quote entirely

  [estimate paths converge]
  → staff edits estimate (canEditEstimate)
  → staff submits for pricing review (new, PR #86) OR owner/admin approves directly
  → owner/admin approves pricing (canApproveEstimatePricing) — pricing_reviewed_at/by set
     OR returns for changes (pricing_review_status = 'changes_requested')
  → staff with canCreateQuote creates draft quote (requires pricing already approved —
     checked as a fact on the estimate, not a live capability of the quote-creator)
  → staff with canSendQuote sends it
  → customer accepts/declines
  → accepted → job created → scheduled → deposit invoice → working invoice →
     change orders (staff proposes, customer approves) → final invoice → payment
```

Everything from "quote accepted" onward is outside the scope of every UI phase covered by this document (Kevin's UI observation, the pricing-review handoff, and this refinement pass) — none of it was touched.

## 5. Today action-queue behavior (new this phase, PR #87)

`getTodayActionItems()` (`packages/db/queries/today-actions.ts`) returns a role-filtered, capability-gated list of exactly three task kinds, each of which disappears the instant it's no longer actionable — there is no separate "dismiss" state:

| Task kind | Gated by | Appears when | Disappears when |
|---|---|---|---|
| `pricing_review_requested` | `canApproveEstimatePricing` | `estimates.pricing_review_status = 'pending_review'` | Approved (`pricing_reviewed_at` set) or returned for changes |
| `create_quote` | `canCreateQuote` | Estimate has `pricing_reviewed_at` set, came from a service request, and no quote exists yet | Any quote row exists for that estimate |
| `send_quote` | `canSendQuote` | A quote exists with `status = 'draft'` | Quote leaves `draft` (sent or otherwise) |

Rendered above "Quick actions" on `/today`, hidden entirely if empty, oldest item first, never mixed into the `/requests` badge count, and org-scoped through the same `getActiveOrgContext()` path as every other query on the page. A UI redesign of this section must preserve: role/capability gating (never render an action a role can't perform), the disappearance-on-completion behavior, and org scoping — the visual presentation (cards, list, grouping) is fully open to redesign.

## 6. Role / capability matrix

| Capability | owner | admin | employee | subcontractor | viewer |
|---|---|---|---|---|---|
| `canCreateEstimates` / `canSendEstimates` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canCreateInvoices` / `canSendInvoices` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canRecordPayments` / `canVoidInvoices` / `canDeleteInvoices` / `canIssueRefunds` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canScheduleJobs` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canProposeChangeOrders` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canManageDeposits` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canEditWorkingInvoice` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canTriageRequests` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canCreateDirectWorkOrder` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canManageInspectionTemplates` | ✅ | ✅ | ❌ | ❌ | ❌ (unused — no UI/RPC ships yet) |
| `canEditEstimate` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canApproveEstimatePricing` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canCreateQuote` / `canSendQuote` | ✅ | ✅ | ✅ | ❌ | ❌ |

`viewer` never gets any write capability. This matrix is enforced identically in `packages/shared/permissions.ts` (TypeScript) and SQL `role_has_capability()`, with an automated parity test keeping them in sync — a UI redesign consumes `hasCapability()`/server-side checks, it never re-implements or approximates this table client-side.

## 7. Portal boundaries (customer-facing)

- Customers authenticate via magic-link tokens or password (portal-specific), never the staff Supabase Auth session.
- Portal pages read only customer-safe projections — no internal notes, no `staff_only`-visibility inspection fields (e.g. hazards, labor assumptions), no cost/margin data, no other customers' data.
- Portal actions are limited to: viewing their own requests/quotes/invoices, accepting/declining quotes, approving/declining change orders, scheduling within staff-defined windows.
- A UI redesign of the portal must preserve this exact data boundary — it may change how the same customer-safe data is presented, never widen what's queried or exposed.

## 8. Data that must never be exposed to the wrong audience

- Any inspection template field marked `visibility: "staff_only"` (currently: everything in the v1 general-maintenance template, including `hazards`) — customer portal must never render it.
- Internal notes, labor assumptions, margin/cost breakdowns, or any staff-only estimate/quote annotation.
- Cross-organization data of any kind — every query is `org_id`-scoped; a redesign must never introduce a query path that skips this.
- The Demo organization's data must never be presented as if it were a real PPM record, and vice versa — active-org context (§9) already prevents cross-contamination at the data layer; the UI must not add any shortcut that blurs this (e.g. a "recent across all orgs" view).

## 9. Active-org behavior

Every authenticated staff page resolves org context via `getActiveOrgContext(supabase, user.id)`, which:
- Honors `user_profiles.active_org_id` if the user holds an active membership there.
- Otherwise defaults deterministically to the user's **oldest** active membership (by `org_members.joined_at`) — never random, never silently reassigned.
- Is switchable via the guarded `switch_active_org()` RPC (verifies membership before writing).

A UI redesign may change how/where org-switching is presented, but must call through this same resolution — never infer org context from URL params, client state, or any other source.

## 10. Demo org and scenarios (safe sandbox for redesign testing)

Org `Forge Demonstration` (renamed from "Premier CRM Demonstration" — see `docs/architecture/forge-foundry-naming-audit.md`; id `a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`, slug `premier-crm-demonstration` unchanged) is a permanent, populated dataset in production covering all three triage paths (Scenario A: remote estimate; Scenario B: full site-visit lifecycle with reschedule, photos, change order, deposit+final invoices; Scenario C: direct work order). Kevin holds an owner membership on Demo separate from his real PPM employee membership. **This is the recommended environment for any Base44 visual work/screenshots** — real PPM production data must never appear in design mockups, screenshots, or shared artifacts. Full detail: `docs/implementation/premier-crm-demonstration-organization.md`.

## 11. State names and meanings (for consistent redesign copy)

- Service request: `new → reviewing → estimate_created/scheduled/approved → completed/cancelled`, plus `spam`.
- Site visit: `scheduled → in_progress → completed`.
- Estimate: implicit draft state + `pricing_review_status` (`null` = not submitted / approved, `pending_review`, `changes_requested`) + `pricing_reviewed_at`/`by` (the sole "approved" signal — never duplicate this as a separate boolean).
- Quote: `draft → sent → accepted/declined`.
- Job: scheduled → in progress → completed (see job detail page for the full state list).
- Invoice: `kind` (`deposit`/`working`/`final`) is independent of payment status (`amount_paid` vs `total`).

A redesign must use these exact underlying states for logic/filtering — display labels ("Awaiting your review," "Draft quote ready") may be freely reworded, as already done in the Today action queue (§5) and pricing-review UI (PR #86).

## 12. Accessibility and touch-target expectations

- Minimum tap target ~44x44px (the mobile-nav fix this phase moved to `min-h-14` = 56px rows).
- Visible focus states preserved on all interactive elements.
- Color must not be the sole signal for status (badges use both color and text label today — preserve both).
- Form fields must have persistent visible labels, not placeholder-only text (the inspection-form fix this phase established this as the standing pattern — see `COLUMN_META` in `inspection-form.tsx`).
- Safe-area insets respected on mobile chrome (`env(safe-area-inset-bottom)`, already applied to the bottom nav).

## 13. Design-system goals

- Consistent badge/status-color vocabulary across estimates, quotes, jobs, invoices, requests (currently ad hoc per-page `colorMap` objects — a shared design-system token set is a reasonable Base44 deliverable).
- Consistent list-row density and information hierarchy across all list pages (customers, jobs, quotes, invoices, requests) — today each list page independently decided its own row layout.
- A single source of truth for capability-based conditional rendering patterns (many pages independently check `hasCapability(role, ...)` before rendering a button — consolidating this into a shared component/hook is a reasonable Base44-adjacent improvement, as long as the underlying capability check is unchanged).

## 14. Screens safe to redesign vs. requiring caution

**Safe to redesign (presentation only, no lifecycle/data risk):**
`/today`, `/requests` list, `/customers` list/detail, `/jobs` list, `/invoices` list, `/quotes` list, `/properties` detail, bottom nav, all badge/status components, all list-row layouts.

**Requires caution (complex state, multi-step flows, financial data — redesign carefully, test thoroughly):**
`/estimates/[estimateId]` (pricing-review state machine, line-item locking), `/site-visits/[siteVisitId]` (autosave, template-driven dynamic fields, immutability-after-completion), `/jobs/[jobId]` (deposits, change orders, scheduling), `/invoices/[invoiceId]` (payment recording, void/refund), customer portal pages (data-boundary sensitive).

**Do not redesign as part of a UI-only Base44 pass:**
Public quote/invoice token views (`/q/[token]`, `/i/[token]`) — these are customer-facing legal/financial documents; any change here needs the same review rigor as a financial-document change, not a routine visual pass. Website admin (`/settings/website`) — governs the separate, out-of-scope public marketing site content model.

## 15. Observed mobile friction (this phase and prior)

- Bottom-nav badge crowding (Customers/Requests) — **fixed this phase** via corner-positioned badge.
- Inspection-form list fields showing raw column keys as the only label — **fixed this phase** via `COLUMN_META`.
- Request-list rows have no full-row tap target on mobile — **documented, not fixed**, see `docs/ux/request-list-density-recommendation.md`.
- Hazards multiselect is a dense flat checkbox row — **documented, not fixed**, see `docs/ux/hazards-section-proposal.md`.

## 16. Pricing-review handoff (context, already shipped — PR #86)

Employees without `canApproveEstimatePricing` now submit an estimate for review (`pricing_review_status = 'pending_review'`) instead of seeing a raw, non-functional "Approve pricing" button. Owner/admin can approve (clears the status, sets `pricing_reviewed_at`/`by`) or return for changes with a required note. Line items lock while pending review. Full detail in the estimate-pricing-review-handoff implementation doc — not re-described further here; **do not redesign or re-implement this flow**, it is complete and live.

## 17. Prohibited architectural changes (repeated for emphasis)

No lifecycle/state-machine changes. No new database tables/columns/RPCs for a UI-only pass (a genuinely new UI-driven data need must be raised for a separate, reviewed migration — not silently added). No relaxation of capability checks. No new customer-facing data exposure. No changes to numbering sequences, Storage security, or organization isolation. No Resend/email configuration as part of a UI pass. No tagging of any V1/baseline release as part of a UI-only phase — release tagging is a separate, explicitly authorized step.

## 18. Application-wide integration constraints (Forge V1.1, added after the compatibility spike)

The Base44 compatibility spike (`spike/base44-today-compat`, see `docs/ux/base44-compatibility-spike-report.md`) proved the 3-layer pattern below works on `/today` and this handoff's scope now extends to every route (see `docs/ux/forge-v1.1-ux-modernization-plan.md` for the full plan). These constraints generalize §1/§2 above into a written, reusable contract:

**Every generated route must integrate through**: existing page/query layer (Layer 1 — unchanged) → a pure adapter/view-model (Layer 2 — no I/O, no authorization decisions) → replaceable presentation components (Layer 3, marked at the exact substitution seam) → existing server actions/RPCs passed as controlled callbacks or forms, never a new endpoint.

**Base44 output may provide**: JSX/TSX presentation markup, layout, visual hierarchy, responsive design, animation, presentation components, icons, non-authoritative client presentation state.

**Base44 output may not own**: database access, Supabase clients, authentication, org-switching logic, capabilities, lifecycle transitions, server actions, RPC calls, accounting calculations, RLS assumptions, customer-safe projection rules, trusted-write logic, persistent status logic.

**Layer 2 view models may**: normalize already-authorized data for display, group records, calculate presentation-only labels, select icons/display variants, create sections from already-fetched data.

**Layer 2 view models may not**: make authorization decisions, determine whether an action is legally/contractually allowed, invent workflow states, perform database calls or mutations, duplicate pricing/accounting calculations, replace server validation. (The spike's own `view-model.ts` violated this once — see the spike report §0 — corrected before that code is reused as more than reference.)

**Required of all generated output**: TypeScript with no `any`, semantic HTML, preserved keyboard access, phone+tablet support (no fixed desktop-only widths), reuse of shared Forge primitives rather than one-off reimplementations, explicit loading/empty/error states, no direct Supabase imports, no hidden authorization assumptions, preserved existing route destinations, preserved testable accessible names.
