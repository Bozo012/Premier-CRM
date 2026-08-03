# Architecture & Development Guide — Integrated Request-to-Payment Workflow

Companion to `BASELINE_V1.md` (what works) and `CONVENTIONS.md`/`ARCHITECTURE.md`
(locked project-wide decisions). This document explains *why* the integrated
lifecycle is shaped the way it is, so future changes extend it consistently
instead of re-deriving the reasoning.

## Design principle: one shared service per transition, both sides call it

CRM staff and the customer portal must never implement divergent business
rules for the same transition. Concretely:

- **Accepted quote → job**: `createJobFromAcceptedQuote()`
  (`packages/db/queries/job-lifecycle.ts`) is called by both the staff
  manual action (`estimates/actions.ts`) and the customer accept path
  (`q/[token]/actions.ts`). Neither re-implements the logic.
- **Scheduling**: `apply_job_scheduling()` is a SQL function, not app code —
  the strongest form of "shared," since even a divergent TypeScript
  implementation on one side couldn't produce different DB state. Staff
  scheduling calls it directly; customer slot-booking calls it via
  `book_scheduling_slot()`, which does its own row-locked capacity check
  first, then delegates.
- **Change orders**: all mutation happens through `SECURITY DEFINER` RPC
  functions. There is no "CRM version" and "portal version" of propose/
  respond/incorporate — there is one function per operation, called from
  both `apps/web/app/(app)/jobs/actions.ts` and
  `apps/web/app/portal/change-orders/actions.ts`.

When adding a new lifecycle transition, ask: "could staff and a customer
both trigger this?" If yes, put the actual logic in `packages/db/queries/`
or a SQL function, and make both call sites thin wrappers.

## Design principle: database-enforced invariants, not just app-level trust

Server actions in this codebase use the service-role client, which bypasses
RLS by design. That means RLS alone cannot protect contractual data (change
orders) from a bug in a server action. The pattern used here:

1. **Structural triggers** fire for every role, including `service_role`:
   - `change_order_revisions`' `BEFORE UPDATE` trigger enforces the valid
     transition graph and freezes content once a revision leaves `draft`.
   - `change_order_line_items`' trigger blocks INSERT/UPDATE/DELETE once
     the parent revision isn't `draft` — **but treats a NULL parent lookup
     (the revision itself being cascade-deleted in the same transaction) as
     "not blocked"**, otherwise legitimate cascade deletes (deleting a job)
     fail with a false "immutability violation." This was a real bug found
     during E2E testing — see the migration list below.
   - `invoices`' triggers block a working invoice from ever being sent,
     viewed, or paid, and block payments against one.

2. **SECURITY DEFINER RPC functions** are the only mutation path for
   change-order tables — no `authenticated` INSERT/UPDATE/DELETE grant
   exists on them at all. Each function re-validates org membership /
   customer ownership / current status / allowed transition against the
   same source-of-truth tables (`org_members`, `customer_accounts`) the
   calling server action already checked. A bug in the app-layer capability
   check cannot, by itself, corrupt contractual state — the DB function is
   an independent second check, not a formality.

3. **Partial unique indexes** are the actual idempotency/uniqueness
   guarantee, not app-level check-then-insert:
   - `jobs_origin_quote_unique` — at most one job per accepted quote.
   - `invoices_one_working_per_job` — at most one non-void working invoice.
   - `job_deposits_one_per_job` — at most one deposit requirement.
   - `change_order_revisions_one_pending` — at most one pending (draft/
     proposed/under_review) revision per thread; deliberately excludes
     `revision_requested` so a replacement draft can be created immediately.

When a race is possible (two concurrent requests), catch the specific
unique-violation error code (`23505`) and treat it as "someone else already
did this," returning the existing row — see `createJobFromAcceptedQuote()`
for the pattern.

## Why `jobs.status = 'approved'` means "unscheduled," not a new enum value

The canonical lifecycle names a state "unscheduled job." The existing
`job_status` enum already had `'approved'` meaning exactly that ("job
exists, not yet scheduled") since the original schema — every existing
query, filter, and report built on `'approved'` already encodes this
meaning. Adding a competing `'unscheduled'` value would fragment that
without adding real information. This is a deliberate naming-vs-schema
tradeoff, not an oversight — flag it if a future change wants to rename the
enum value itself (a bigger, coordinated change across the whole codebase).

## Portal boundary: share-token vs authenticated

Two customer-facing surfaces exist, deliberately kept separate:

- **`/q/[token]`, `/i/[token]`** — unauthenticated, share-token. Proven,
  pre-existing pattern for quote acceptance and invoice viewing/payment.
  Not touched by this work except that quote acceptance now additionally
  triggers job creation.
- **`/portal/*`** — authenticated (Supabase Auth password +
  `customer_accounts.auth_user_id`). Used for anything that moves money or
  makes a commitment beyond a single yes/no on a document: scheduling,
  deposits, working-invoice visibility, change-order decisions.

The RLS pattern for portal reads is the same join every time:

```sql
EXISTS (
  SELECT 1 FROM jobs j
  JOIN customer_accounts ca ON ca.customer_id = j.customer_id
  WHERE j.id = <table>.job_id
    AND ca.auth_user_id = auth.uid()
    AND ca.status = 'active'
)
```

Reuse this exact shape for any new portal-visible table rather than
inventing a new customer-scoping mechanism.

## Working-invoice visibility is presentation-layer, not accidental

The pre-existing `customer_select_own_invoices` RLS policy was
kind-agnostic — it would have exposed working-invoice rows (internal
notes, source attribution, unfinished pricing) to the portal by accident.
This was caught and fixed: the policy now explicitly excludes
`kind='working'`, and the portal instead reads a narrow, deliberately-
shaped summary (`getWorkingInvoiceSummaryForCustomer()` — total and line
count only). When adding any new invoice-adjacent customer-facing read,
default to a narrow dedicated query, not broadening an existing RLS policy.

## Migration history for this feature (chronological, all additive)

| Migration | Purpose |
|---|---|
| `20260731100000_job_origin_tracking` | `jobs.origin_quote_id/estimate_id/request_id`, consistency trigger, backfill, idempotency index |
| `20260731110000_job_deposits` | Requirement-only deposit table |
| `20260731120000_invoice_kind_add_working` | New enum value (split into its own migration — Postgres won't let a new enum value be used in the same transaction that added it) |
| `20260731130000_working_invoice_foundations` | Uniqueness, send/pay guards, line-item source attribution |
| `20260731140000_change_orders` | Thread/revision/line-item/comment tables, immutability + transition triggers, RLS |
| `20260731150000_change_order_rpc_functions` | The five SECURITY DEFINER mutation functions |
| `20260731160000_scheduling_and_portal_boundary` | Slots/bookings, `apply_job_scheduling`, portal RLS, working-invoice visibility restriction |
| `20260731170000_fix_respond_to_change_order_status_cast` | Bug fix: TEXT param wasn't cast to the enum column before assignment |
| `20260731180000_fix_line_item_immutability_cascade` | Bug fix: immutability trigger blocked legitimate cascade deletes |
| `20260731190000_fix_create_change_order_draft_next_version` | Bug fix: invalid SQL mixing an aggregate with a non-aggregated column |

The three fix migrations exist because E2E testing found real bugs after
the initial nine were written — each is a `CREATE OR REPLACE FUNCTION`,
never an edit to the original file (migrations are immutable once applied).

## E2E safety: the production guard

Two independent layers prevent the E2E suite from ever running against
`premier-crm-prod` (`apnbpcauqrjvkoleisde`):

1. `playwright.config.ts` refuses to load if its own resolved
   `NEXT_PUBLIC_SUPABASE_URL` matches the prod project ref. This catches a
   corrupted `.env.test`.
2. `tests/e2e/global-setup.ts` calls `apps/web/app/api/e2e-health/route.ts`
   on the **already-running dev server** and refuses to proceed if that
   live server reports the prod project ref. This catches the more
   dangerous case: the test runner's own env is fine, but the dev server
   process was started with different (e.g., stale `.env.local`) values —
   which is exactly what happened in a near-miss during this feature's
   development (see the release report for that incident).

Both must stay in place. If either check starts blocking a legitimate run,
fix the underlying env mismatch — do not remove or bypass the check.

## Where to put new code (extends `ARCHITECTURE.md`)

- New shared lifecycle transition → `packages/db/queries/` (TypeScript) or
  a SQL function in a migration, whichever needs true cross-surface
  atomicity (scheduling, change-order mutation) — see "one shared service"
  above.
- New capability → `packages/shared/permissions.ts`'s `CAPABILITIES` map,
  never a hardcoded role check at a call site.
- New customer-portal-visible data → narrow dedicated query + RLS policy
  using the `customer_accounts` join pattern above, not a broadened
  existing policy.

## Request → site visit → estimate → quote workflow

**Live in production** since 2026-08-02 (merged via PR #80, commit `15078a3`,
plus a same-day hotfix PR #81, commit `9a376b3`). Backend, staff UI,
customer portal presentation, and Storage/upload finalization are all
complete; see `docs/implementation/request-site-visit-estimate-workflow.md`
for the full report and `docs/production/deployments/
2026-08-02-site-visit-workflow-deployment.md` for the deployment/smoke-test
record. Extends the request-to-payment lifecycle with an explicit, audited
front half:

```
service request → triage (remote_estimate | site_visit_required | direct_work_order)
  [site_visit_required] → site_visits (own table, linked via service_request_id,
    NOT via an estimate) → scheduled/rescheduled (site_visit_appointments,
    structured history, never overwritten in place) → started → completed
    → generate_estimate_from_site_visit() → draft estimate
      (estimates.source_site_visit_id is the ONLY link — one direction only)
  → staff review → approve_estimate_pricing() → create_quote_from_estimate()
    (DB-enforced via a BEFORE INSERT trigger on quotes, not just app logic)
```

Everything from quote creation onward (acceptance → job → scheduling →
deposit → working invoice → change order → final invoice → payment) is
unmodified — this workflow only extends the front half.

**New RPC-only mutation surface**, mirroring the existing
`change_order_revisions` pattern: `record_request_triage`,
`correct_request_triage`, `schedule_site_visit`, `reschedule_site_visit`,
`cancel_site_visit(_appointment)`, `start_site_visit`,
`undo_site_visit_start`, `complete_site_visit`,
`save_site_visit_inspection` (service-role-only — no `authenticated`
grant, see the implementation doc §5), `generate_estimate_from_site_visit`,
`approve_estimate_pricing`, `reopen_estimate_for_edit`,
`create_quote_from_estimate`, `get_my_site_visit_summary`
(customer-portal-safe projection — no RLS `SELECT` on `site_visits` for
the customer role at all, since RLS can't hide columns within an
authorized row).

New capabilities in `packages/shared/permissions.ts`, mirrored in SQL by
`role_has_capability()` (kept in sync by an automated parity test —
mismatch is treated as a security defect, not a UX bug):
`canTriageRequests`, `canCreateDirectWorkOrder`,
`canManageInspectionTemplates`, `canEditEstimate`,
`canApproveEstimatePricing`, `canCreateQuote`, `canSendQuote`.

**A capability existing in this map is not the same as it being enforced.**
`canSendQuote` was defined here and passed the TS/SQL parity test from day
one, but wasn't actually wired into the quote-send action until a same-day
production hotfix (PR #81) — the action checked the older, broader
`canSendEstimates` instead. Found during production validation, fixed, and
covered by dedicated tests (`apps/web/app/(app)/quotes/actions.test.ts`).
When adding a new capability, grep for where it's actually checked, not just
where it's defined, before considering the wiring done.

**Staff UI**: `apps/web/app/(app)/requests/[taskId]/page.tsx` (triage panel,
folded into the request detail page — includes the structured
direct-work-order authorization fields), `apps/web/app/(app)/site-visits/
[siteVisitId]/page.tsx` (scheduling, lifecycle buttons, mobile-first
inspection form with per-field debounced autosave, photo upload, estimate
generation), `apps/web/app/(app)/estimates/[estimateId]/page.tsx` (extended
with a line-items editor and a pricing-review panel gating quote creation).

**Customer portal**: `apps/web/app/portal/dashboard/page.tsx` calls
`getMySiteVisitSummary()` with the portal-scoped (RLS-authenticated) client
for every one of the customer's own requests — the only site-visit data the
portal ever reads.

## Multi-organization active-org selection

**Live in production** since 2026-08-02 (PR #82, merge commit `2d51546`).
Built as a prerequisite for creating the Premier CRM Demonstration
organization: `getActiveOrgContext()` (called from ~36 existing sites)
previously hard-rejected any account belonging to more than one active
`org_members` row, which would have broken Kevin's real PPM session the
moment a second membership was added for him. Full design/verification
record: `docs/implementation/premier-crm-demonstration-organization.md`.

**Mechanism**: a nullable `user_profiles.active_org_id` preference column,
written only through a guarded RPC:

```
switch_active_org(p_org_id) — SECURITY DEFINER, verifies the caller has an
  active org_members row for p_org_id before writing the preference;
  granted to `authenticated` because it is self-service and self-verifying.
```

`getActiveOrgContext()`'s resolution order, with **zero signature changes**
at any call site: a single active membership resolves exactly as before
(`hasMultipleOrgs: false`); more than one active membership uses the stored
`active_org_id` if it matches one of the caller's own memberships, otherwise
falls back deterministically to the **oldest** membership by `joined_at` —
never a random or newest-wins default, so adding a second org to an account
never silently changes which org that account lands in.

**RLS vs. preference — do not conflate the two.** Table-level access is
governed by genuine active `org_members` rows (`user_is_in_org()`), not by
`active_org_id`. A multi-org user can read either org's data at the RLS
layer regardless of which org is "active" — the preference only controls
which org the *application* queries and displays by default (see
`tests/e2e/multi-org-switching-bot.spec.ts` test 4b for the explicit,
intentionally-documented proof of this).

**UI**: `apps/web/app/(app)/today/_components/org-switcher.tsx` (client
component, renders only when `hasMultipleOrgs`), wired through
`switchActiveOrgAction` in `apps/web/app/(app)/today/actions.ts`.

**New capability precedent**: `bootstrap_demonstration_organization()` is
the second RPC in this codebase (after this workflow's `save_site_visit_inspection`)
that is deliberately **not** granted to `authenticated` — it is
`service_role`-only, idempotent by slug, invoked exclusively via a one-off
internal administrative script, with no UI route calling it. Use this as
the template for any future "internal-only, no general-purpose feature"
RPC: guard by grant, not by hoping the UI never calls it.
