# Baseline V1 — Integrated Request-to-Payment Workflow

Snapshot of verified, working behavior as of the integrated request-to-payment
workflow release (2026-07-31). This is the baseline future sessions should
diff against — re-derive state from here plus `git log`, not from scratch.

## Scope of this baseline

Everything below has been proven end-to-end against `premier-crm-e2e`
(project ref `slbnizoskumwhleeiccv`) via the Playwright bot suite
(`tests/e2e/`), plus `pnpm test` (Vitest) and `pnpm --filter web typecheck`.
Production (`premier-crm-prod`, `apnbpcauqrjvkoleisde`) status is tracked
separately in the release report for this deployment, not here — this
document describes the *code and schema*, not what has been applied to any
specific environment.

## Canonical lifecycle (implemented)

```
service request → estimate → quote → accepted quote → unscheduled job
  → scheduled job → deposit stage → working invoice
  → proposed change order → customer approval/decline
  → incorporated (exactly once) → final invoice
```

### Request → estimate → quote (pre-existing, re-verified)

- `service_requests` → `createEstimateFromRequestAction` (inspection-first)
  or `createJobFromRequestAction` (direct-to-job) — both idempotent via
  `request.estimate_id` / `request.job_id` guards.
- `estimates.status`: `draft → site_visit_scheduled → site_visit_complete →
  quoted → accepted/declined/expired → converted`, enforced by an explicit
  transition map in `updateEstimateStatusAction`.
- `createQuoteFromEstimateAction` builds a draft `quotes` row from an
  estimate; `sendQuoteAction` stamps `sent_at` and emails (best-effort).

### Accepted quote → unscheduled job (this release)

- Customer accepts via `/q/[token]` (public, unauthenticated share-token
  page) → `respondToQuoteAction` calls the shared
  `createJobFromAcceptedQuote()` service (`packages/db/queries/
  job-lifecycle.ts`), used identically by the staff manual action in
  `estimates/actions.ts`.
- **Idempotent at the database boundary**: `jobs.origin_quote_id` has a
  partial unique index (`jobs_origin_quote_unique`). A concurrent duplicate
  accept loses the race on `INSERT` and the service catches that specific
  conflict, returning the existing job instead of erroring or duplicating.
- `jobs.origin_quote_id` / `origin_estimate_id` / `origin_request_id` trace
  the full chain; a trigger (`validate_job_origin_consistency`) rejects any
  cross-org or cross-chain assignment.
- New job lands as `status = 'approved'` — this **is** "unscheduled" in the
  existing `job_status` enum; no competing value was added (see
  `ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md` for why).

### Scheduling

- `apply_job_scheduling()` (SECURITY DEFINER SQL function) is the single
  shared transition both staff-direct scheduling (`scheduleJobAction`) and
  customer slot-booking (`book_scheduling_slot()` → `apply_job_scheduling()`)
  call. Same resulting job state and activity-log entry either way.
- Customer scheduling is **curated-slot only** (`scheduling_slots` +
  `scheduling_slot_bookings`), not arbitrary self-picked times — staff
  publish slots, capacity is enforced via a row-locked, race-safe RPC
  (`book_scheduling_slot`), never an unlocked `COUNT(*)`.
- Scheduling a job auto-activates its working invoice (creates one if
  missing, `kind='working'`, `status='draft'`).

### Deposit

- `job_deposits` is a **requirement/configuration record only** — one row
  per job (`UNIQUE(job_id)`). It never stores paid/partial/refunded
  amounts; those stay authoritative on `invoices` (`kind='deposit'`) +
  `payments`, computed at read time by `getDepositState()`.
- States: `none | required | waived` (requirement) × derived payment status
  (`none | required | partially_paid | paid | waived | refunded`).

### Working invoice

- Exactly one non-void `invoices` row per job with `kind='working'`
  (`invoices_one_working_per_job` partial unique index).
- DB triggers block it from ever being sent, viewed, or paid directly
  (`prevent_working_invoice_send_or_pay`, `prevent_payment_against_working_invoice`).
- Every line carries `source_type` (`quote_line | change_order | credit |
  adjustment`) + `source_change_order_revision_id` / `source_quote_line_id`
  — full provenance, always.
- Customer portal visibility is **intentionally narrow**: RLS excludes
  `kind='working'` from the general customer invoice policy entirely;
  the portal instead reads `getWorkingInvoiceSummaryForCustomer()` — a
  running total and line count only, no internal notes or source
  attribution.

### Change orders

- `change_orders` (stable thread) + `change_order_revisions` (immutable
  once proposed) + `change_order_line_items` (frozen with their revision) +
  `change_order_comments` (thread-level, optional revision ref).
- Full lifecycle: `draft → proposed → under_review → approved | declined |
  revision_requested → incorporated → completed`, plus `withdrawn` and
  `expired`. Enforced by a `BEFORE UPDATE` trigger on
  `change_order_revisions` that fires for **every role including
  service_role** — a server-action bug cannot corrupt contractual state.
- Only `SECURITY DEFINER` RPC functions mutate these tables
  (`create_change_order_draft`, `propose_change_order_revision`,
  `respond_to_change_order_revision`, `withdraw_change_order_revision`,
  `incorporate_change_order_revision`) — no direct `authenticated`
  INSERT/UPDATE/DELETE grant exists.
- Price is **computed server-side from frozen line items**, never trusted
  from a caller-supplied total; a mismatched client value is rejected.
- Only the customer's approval is contractual acceptance — staff can draft
  and propose, never self-approve.
- Incorporation is exactly-once (guarded `UPDATE ... WHERE incorporated_at
  IS NULL`), writes working-invoice lines with source attribution.

### Final invoice

- `generateFinalInvoiceFromWorking()` **snapshots** working-invoice content
  into a new `invoices` row (`kind='final'`) — the working invoice's `kind`
  is never changed in place. `invoices.finalized_into_invoice_id` links
  them.

## Capability model (`packages/shared/permissions.ts`)

| Capability | Roles |
|---|---|
| `canScheduleJobs` | owner, admin, employee, subcontractor |
| `canProposeChangeOrders` | owner, admin, employee, subcontractor |
| `canManageDeposits` | owner, admin |
| `canEditWorkingInvoice` | owner, admin, employee, subcontractor |
| (existing) `canRecordPayments`, `canVoidInvoices`, `canDeleteInvoices`, `canIssueRefunds` | owner, admin |
| (existing) `canCreateEstimates`, `canSendEstimates`, `canCreateInvoices`, `canSendInvoices` | owner, admin, employee, subcontractor |

## Portal boundary

- `/q/[token]`, `/i/[token]`: unauthenticated share-token, unchanged.
- `/portal/*`: authenticated (Supabase Auth password + `customer_accounts`),
  now covers scheduling, deposits, working-invoice visibility, and
  change-order comments/decisions — all via `customer_accounts.auth_user_id
  = auth.uid()` RLS joins, matching the pattern already proven for
  `customer_select_own_invoices`.

## Explicitly out of scope / not built

- Job completion transition (`in_progress → completed`) — pre-existing gap,
  documented, not built here.
- Payment-provider (Stripe) integration — zero code anywhere.
- Combined atomic reschedule (cancel + rebook in one transaction) — only
  the two separate primitives exist.

## Test coverage

- `tests/e2e/integrated-lifecycle-bot.spec.ts` — the canonical proof: full
  happy path, duplicate-acceptance idempotency, unauthorized-approval
  denial, declined-change-order-no-billing-effect, and revision immutability.
- All pre-existing bots re-verified green after this change (scheduling,
  estimates lifecycle, quote response, invoice management, request
  conversion, permissions).
