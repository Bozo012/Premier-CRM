# Base44-exact rebuild: Finance (Invoices, Expenses, Payments, Change Orders)

Branch: `rebuild/base44-exact-finance` (worktree `C:\dev\Premier-CRM-base44-finance`)
Base commit: `26e547a` (PR #132 merged — Jobs + Calendar slice)
This is the seventh slice of the Base44-exact rebuild program (after Customers; Properties + Team; Requests + Site Visits + Inspection; Estimates + Service Catalog + Quotes; Jobs + Calendar).

**Scope-honesty note, up front, matching the prior slice's standard.** The Invoices and Expenses list/detail pages in this codebase were *already* built to a Base44-quality presentation standard by an earlier pass (batch-2-finance-integration, batch-5-expenses — see `docs/ux/forge-base44-batch-2-finance-integration-report.md` and `forge-base44-batch-5-expenses-report.md`) using the same `forge-*` presentation primitives (`ForgeCard`/`ForgePage`/`ForgeStatusPill`) as every other ported route — they were simply never moved into the `(forge)` route group with real `ForgeShell` chrome, the way Customers/Jobs/Requests/etc. were in later slices. Given that, this slice's actual new work is: (1) the mechanical `(legacy)` → `(forge)` route-group move + shell wiring for `/invoices` and `/expenses` (matching the established pattern exactly), and (2) closing a genuine, previously-undocumented backend gap — there was **no real mechanism anywhere in the app to link an approved billable expense to an invoice line item**, despite the schema (`invoice_line_items.source_expense_id` and friends) already supporting it. I did not attempt a full pixel-level Base44 source diff of every invoice/expense component before writing this report — I fetched and read Base44's `src/contracts/invoices.ts`, `src/contracts/expenses.ts`, and `InvoiceEligibleExpenses.tsx`/`ExpenseEligibilityPanel.tsx` (the exact concept this slice needed to build) and ported the "Eligible expenses" section directly from Base44's real component; the rest of the invoice/expense presentation was inherited unchanged from the prior batch passes rather than re-derived from Base44 source line-by-line. Flagged for the verification pass, same as prior slices.

Invoice creation itself was **not** rebuilt into the task's ideal 5-step wizard (Source/job → Customer & billing → Line items → Terms → Review). The existing `NewInvoiceDialog`/`createInvoiceFromJobAction`/`createInvoiceFromQuoteAction` (job- or quote-anchored, real, already covers the "source" decision) and `LineItemEditor` (already has an accepted client-side running-total preview, never treated as authoritative) were kept unchanged — they already satisfy the "no client-authoritative totals" and "job/quote anchoring" requirements. What *is* new is the ability to add real billable-expense charges into a draft invoice's line items (see "Expense → invoice linkage" below), which is the piece that had no real path at all before this slice. Given the size of the rest of this slice (route moves, the expense-linkage feature end to end, capability cleanup, tests, E2E, docs), a full step-wizard rebuild of invoice creation was assessed as a separate, additive follow-up rather than squeezed in — documented as a known limitation below, not silently dropped.

## Routes moved

| Route | Old location | New location |
|---|---|---|
| `/invoices` | `(legacy)/invoices/page.tsx` | `(forge)/invoices/page.tsx` |
| `/invoices/[invoiceId]` | `(legacy)/invoices/[invoiceId]/page.tsx` | `(forge)/invoices/[invoiceId]/page.tsx` |
| `/expenses` | `(legacy)/expenses/page.tsx` | `(forge)/expenses/page.tsx` |
| `/expenses/[expenseId]` | `(legacy)/expenses/[expenseId]/page.tsx` | `(forge)/expenses/[expenseId]/page.tsx` |
| `/expenses/new` | `(legacy)/expenses/new/page.tsx` | `(forge)/expenses/new/page.tsx` |

All `_components/`, `_lib/`, `actions.ts`, and `error.tsx` moved with `git mv` alongside their routes. URLs and dynamic-segment names are unchanged (route groups are stripped from the URL). `route-groups.test.ts` moved `invoices`/`expenses` from `LEGACY_ROUTES` to `FORGE_ROUTES`, added list/detail/new existence assertions and `InvoicesShell`/`ExpensesShell` chrome assertions. `branding.test.ts`'s Invoices page-title path updated to `(forge)/invoices/page.tsx`. Grepped the whole repo before and after the move for `(legacy)/invoices`/`(legacy)/expenses` references — none remained outside the two test files above.

## ForgeShell wiring

`invoices/page.tsx`, `invoices/[invoiceId]/page.tsx`, `expenses/page.tsx`, `expenses/[expenseId]/page.tsx`, and `expenses/new/page.tsx` previously rendered inside `(legacy)/layout.tsx`'s `AppShell`. New files, copied exactly from the established `jobs`/`requests` pattern (same `getActiveOrgContext` + user-profile lookup, same reused `signOutAction`/`switchActiveOrgAction`):

- `invoices/_lib/forge-shell-context.ts`, `invoices/_components/invoices-shell.tsx`
- `expenses/_lib/forge-shell-context.ts`, `expenses/_components/expenses-shell.tsx`

Each page's org-context-error branch renders a bare centered `<main>` (no shell — matches the Jobs slice's own pattern, since building `shellData` requires a resolved org context); every other branch (including error/empty states) renders inside the real shell.

## Backend audit

### Invoices — real, mature

Confirmed by reading `packages/db/queries/invoices.ts` (959 lines, now ~1040 after this slice's addition) in full:
- `invoices` table with real `job_id` FK (every invoice anchors to a job), optional `quote_id` FK (`createDraftInvoiceFromQuote` requires the quote to already have a linked job — "create the job first" is a real, correctly-worded validation error, not a fabricated one).
- Totals (`subtotal`/`tax_amount`/`total`/`amount_paid`/`amount_due`/`status`) are server/trigger-computed via `recalc_invoice_totals()` (migration `20260803040000_invoice_totals_recalc_trigger.sql`) — this slice's new `addExpenseChargeToInvoice` calls the exact same `recalcInvoiceTotals()` wrapper every other line-item mutation uses, so it never computes a total client- or app-side.
- `sendInvoice`/`voidInvoice`/`recordPayment` all have real status-transition guards, matching the report's own summary.
- Capabilities `canCreateInvoices`/`canSendInvoices`/`canRecordPayments`/`canVoidInvoices`/`canIssueRefunds`/`canEditWorkingInvoice`/`canManageDeposits` were reused unchanged for every existing invoice action.

### Payments — real, manual-recording only, confirmed no processor

Re-verified independently (not just trusting the task's own summary):
```
grep -rli stripe apps/web packages   → only packages/db/types.ts (dead stripe_* columns on `payments`, generated from schema, never read/written anywhere in app code)
find apps/web/app/api -iname "*webhook*"  → no results, no webhook directory exists at all
```
`recordPayment()` (packages/db/queries/invoices.ts) inserts into `payments` and lets the real `apply_payment_to_invoice()` trigger (migration `20260722000000_invoice_foundation.sql`) recalculate `amount_paid`/`status`/overpayment-void guards atomically; `translatePaymentError()` turns the trigger's `RAISE EXCEPTION` messages into `VALIDATION_ERROR` results. Nothing was added here beyond moving `RecordPaymentForm`/`recordPaymentAction` into the new route group unchanged — they already only ever expose method/amount/date/reference/notes, never a card-collection UI. `payments-flow-bot.spec.ts` deliberately does not test a "failed payment" UI state, since manual recording's only reachable failure is client-side-blocked validation (amount `min`/`max` on the input), not a processor decline — fabricating that state would test something this UI cannot actually produce.

### Expenses — real, recently added backend; genuine linkage gap found and closed

Read `supabase/migrations/20260805075928_forge_expenses_foundation.sql` and `packages/db/queries/expenses.ts` (719 lines) in full. Confirmed the exact gap described in the task brief by grepping the app layer, not just reading the schema:
```
grep -n "source_expense_id" packages/db/queries/*.ts   → zero matches before this slice
grep -n "invoice_id" apps/web/.../expenses/actions.ts  → zero matches — nothing ever set expenses.invoice_id
```
i.e. the `invoice_line_items.source_expense_id`/`source_expense_cost_snapshot`/`source_expense_customer_charge_snapshot` columns (added by the same 2026-08-05 migration) existed in the schema and in generated types, but **no query, action, or UI anywhere in the app ever wrote to them.** The expense detail page's "Invoice readiness" card literally said *"Ready for a future invoice builder handoff"* for `ready_to_invoice` expenses — an honest, already-present admission that this was unbuilt. This slice builds that handoff for real (see below) rather than leaving the placeholder text in place.

### Change orders — real, mature, intentionally left as Job-Detail-only

Fetched Base44's actual file tree at the pinned commit via `gh api repos/Bozo012/Forge-Base44-UX/git/trees/...recursive=1` and grepped for change-order-related paths:
```
grep -iE "changeorder|change_order|change-order"  → zero matches anywhere in Base44's src/
```
Base44 has no standalone change-order route or component at all — change orders are not part of its `contracts/`, `routes/`, or `components/forge/` trees. This confirms the task's own expectation: nothing to port as a standalone `/change-orders` list/detail route. The existing real, DB-trigger-enforced, RPC-backed integration already embedded in Job Detail (`apps/web/app/(app)/(forge)/jobs/_components/change-order-action-buttons.tsx`, `change-order-draft-form.tsx`, the `ChangeOrdersCard` section in `jobs/[jobId]/page.tsx`) is untouched by this slice. No `change-orders-base44-shell-bot.spec.ts` was written, per the task's own instruction to skip it when nothing in that area changes.

## Expense → invoice linkage (the real new feature in this slice)

**Query layer** (`packages/db/queries/expenses.ts`):
- `isExpenseEligibleForInvoiceCharge(expense)` — pure, exported, unit-tested function: an expense is eligible only when `status === 'ready_to_invoice'` **and** `billing_treatment` is one of `reimbursable_at_cost` / `billable_with_markup` / `customer_approved_pass_through` (the three treatments the existing view-model's own `getBillingTreatmentNote()` already described as "may be offered to invoice creation" — this slice didn't invent that classification, it made it real). `internal_cost_only`/`included_fixed_price`/`included_accepted_quote`/`non_billable`/`pending_review` never qualify, matching the existing UI copy exactly.
- `listEligibleExpensesForJob(client, {jobId, orgId})` — returns real `ready_to_invoice` expenses for a job whose treatment qualifies, **anti-joined against `invoice_line_items.source_expense_id`** (not just filtered by `expenses.status`) so an expense that somehow still reads `ready_to_invoice` but already has a real line item pointing at it never gets offered twice. Re-applies `isExpenseEligibleForInvoiceCharge` in application code too, not just the SQL `.eq()`/`.in()` filter, so the two call sites (this list and the mutation guard below) cannot silently drift apart.

**Query layer** (`packages/db/queries/invoices.ts`):
- `addExpenseChargeToInvoice(client, {invoiceId, expenseId, orgId})` — guards, in order: invoice must be draft (`assertDraftInvoice`, the same guard every other line-item mutation uses), expense must belong to the invoice's `job_id`, expense must pass `isExpenseEligibleForInvoiceCharge`, and — the double-billing guard — **no existing `invoice_line_items` row may already reference this `expense_id` via `source_expense_id`**, checked with a fresh query immediately before insert. On success: inserts one `invoice_line_items` row (`name` = expense description, `unit` = `'expense'`, `quantity = 1`, `unit_price` = the expense's `customer_charge_amount` or, if unset, its real `total_cost`) with `source_expense_id`/`source_expense_cost_snapshot`/`source_expense_customer_charge_snapshot` populated, sets `expenses.invoice_id`/`status = 'invoiced'` for fast-path display, and calls the same `recalcInvoiceTotals()` every other mutation uses.

**Presentation**: `invoices/_components/eligible-expenses-section.tsx` — ported from Base44's real `InvoiceEligibleExpenses.tsx` (fetched and read at the pinned commit), `forge-border`/`forge-card`/`forge-muted-foreground`/`forge-primary` tokens mapped onto this app's `border`/`bg-card`/`text-muted-foreground`/`bg-primary` tokens, same as every other ported component. Base44's version renders arbitrary Forge-supplied per-row `actions`; this real-backend port only ever offers the one real action — "Add to invoice" — since that's the only mutation the query layer actually supports. Rendered on the invoice detail page only for draft, non-working invoices, sourced from `listEligibleExpensesForJob(job.id)`. New adapter `invoices/_lib/forge-invoice-eligible-expenses-view-model.ts` (`toEligibleExpenseOptions`) maps the real expense rows to display labels — no math beyond `Intl.NumberFormat` formatting.

**Double-billing: honest gap classification.** There is **no database unique constraint** stopping the same `expense_id` from being written into `invoice_line_items.source_expense_id` twice (e.g. via two concurrent requests, or a future second code path that doesn't call through `addExpenseChargeToInvoice`). This slice's mitigation is **app-layer only**: the pre-insert existence check above, plus `listEligibleExpensesForJob`'s anti-join keeping already-linked expenses out of the picker UI. This closes the gap for every path that exists in the app today (there is exactly one way to link an expense to an invoice, and it goes through this function), but it is not a schema-level guarantee. **Per the task's stop-condition guidance, this was assessed as *not* requiring a migration to be usable safely today** — the only UI that can create this linkage already restricts to `ready_to_invoice` + qualifying `billing_treatment` + not-already-linked, closing the practical exploit path through the UI — but the smallest correct migration, if the reviewer wants to add real belt-and-suspenders enforcement, would be:

```sql
create unique index invoice_line_items_source_expense_id_key
  on invoice_line_items (source_expense_id)
  where source_expense_id is not null;
```
I did **not** write or apply this — flagged here per the task's instruction, for the reviewer's own separate migration review.

## Capabilities

**Gap found and closed (app-layer only, no migration):** `packages/shared/permissions.ts` had no expense-specific capability at all. The existing expense actions were reusing invoice capabilities as stand-ins: `createExpenseAction`/`submitExpenseAction` checked `canCreateInvoices` (labeled, confusingly, `'create or edit expenses'` in the action file's own label map — a pre-existing naming collision, not something this slice introduced), and `approveExpenseAction`/`rejectExpenseAction`/`voidExpenseAction` checked `canRecordPayments`/`canVoidInvoices`.

Added two new capabilities with **the exact same role sets as the stand-ins they replace** (a pure rename/clarification, not a permissions change):
```ts
canCreateExpenses: ['owner', 'admin', 'employee', 'subcontractor'],  // was canCreateInvoices's role set
canApproveExpenses: ['owner', 'admin'],                              // was canRecordPayments's / canVoidInvoices's role set
```
Updated `expenses/actions.ts` (`createExpenseAction`, `submitExpenseAction` → `canCreateExpenses`; `approveExpenseAction`, `rejectExpenseAction`, `voidExpenseAction` → `canApproveExpenses`) and the equivalent `hasCapability()` checks in `expenses/[expenseId]/page.tsx` (`canSubmit`/`canReview`/`canVoid`). Since `CAPABILITY_LABELS` is declared as an exhaustive `Record<Capability, string>` in three other action files (`invoices/actions.ts`, `quotes/actions.ts`, plus `expenses/actions.ts` itself), all three needed the two new keys added too — caught immediately by `pnpm typecheck`, not discovered at runtime.

## Testing

**Unit (`pnpm test`)**: 377 → 385 tests passing (44 → 45 test files, +1 new file), all green, before/after both fully clean (0 failures either way). New: `packages/db/queries/expenses.test.ts` gained `isExpenseEligibleForInvoiceCharge` coverage (eligible-treatment/status matrix); new file `invoices/_lib/forge-invoice-eligible-expenses-view-model.test.ts` (field mapping, `total_cost` fallback to `amount + tax`, `customer_charge_amount` fallback to cost, missing-receipt/missing-vendor honesty).

**Typecheck (`pnpm typecheck`)**: clean across all 5 packages with a `typecheck` script (`apps/web`, `packages/ai`, `packages/automation`, `packages/db`, `packages/shared`).

**Build (`pnpm --filter web build`)**: succeeds. Route list confirms `/invoices`, `/invoices/[invoiceId]`, `/expenses`, `/expenses/[expenseId]`, `/expenses/new` each appear exactly once, all server-rendered (`ƒ`), no middleware in the build output. Two pre-existing ESLint warnings in untouched files (`quotes/actions.test.ts`, `quotes/_components/line-item-editor.tsx`) are baseline, not introduced by this slice.

**E2E (`npx tsc --noEmit -p tests/e2e/tsconfig.json`)**: new spec files (`invoices-base44-shell-bot.spec.ts`, `expenses-base44-shell-bot.spec.ts`, `payments-flow-bot.spec.ts`) introduce **zero** new type errors — confirmed by cross-checking `git status --porcelain tests/e2e` (only `utils/selectors.ts` modified, plus the three new files) against the tsc error list, which contains only pre-existing errors in files this slice never touched (`authorization-service-requests-bot.spec.ts`, `customer-intake-bot.spec.ts`, `demonstration-org-bootstrap-bot.spec.ts`, `integrated-lifecycle-bot.spec.ts`, `invoice-management-bot.spec.ts`, `quote-response-bot.spec.ts`, `request-site-visit-workflow-bot.spec.ts`). Not executed live (no `.env.test` in this worktree, per the task's instructions) — written to the same quality bar as `jobs-base44-shell-bot.spec.ts`: redirect-to-login, 4-viewport no-overflow, search/filter-URL, direct-URL/refresh/Back, keyboard focus, no-console-errors. `routes.expenses`/`routes.newExpense` added to `tests/e2e/utils/selectors.ts` (`routes.invoices` already existed from an earlier batch pass). No `change-orders-base44-shell-bot.spec.ts` was written — nothing in that area changed, per the task's own instruction to skip a redundant file.

`payments-flow-bot.spec.ts` specifically exercises: payment history section presence, a real partial-payment submission asserting the UI reflects the server-computed "Partially paid" status afterward (never asserting a client-computed balance), and that the amount input's `max` attribute is always bound to the real `amount_due` rather than an arbitrary cap. Every test skips honestly (`test.skip(...)`, with a human-readable reason) when the live e2e org has no invoice in the needed state, rather than asserting against fabricated fixture data.

## Known limitations / follow-ups

1. Invoice creation was **not** rebuilt into the task's ideal 5-step wizard (Source/job → Customer & billing → Line items → Terms/due date → Review) — the existing job-/quote-anchored `NewInvoiceDialog` + `LineItemEditor` were kept, and this slice's new work focused entirely on closing the expense-linkage gap instead. A future slice could rebuild invoice creation into that fuller flow; the current flow already satisfies "no client-authoritative totals" and "anchor to a real job/quote."
2. `addExpenseChargeToInvoice`'s double-billing guard is app-layer only (a pre-insert existence check), not a DB unique constraint — see the proposed smallest migration above, not applied per the task's stop-condition instructions.
3. This slice's presentation work for the "Eligible expenses" section is the only piece independently verified against live Base44 source this pass; the rest of the invoice/expense list/detail presentation was inherited from earlier batch passes (batch-2, batch-5) rather than re-diffed against Base44 byte-for-byte in this pass — visual pixel-fidelity to Base44 for those inherited pages is not newly re-confirmed here.
4. `addExpenseChargeToInvoice` only supports adding an expense as a brand-new whole line item (quantity 1, full charge amount) — there is no partial-billing UI (billing part of an expense's cost to one invoice and the remainder to another), even though the schema's `partially_invoiced` expense status implies that concept exists. Only `ready_to_invoice` (not `partially_invoiced`) expenses are offered, so partial invoicing is a real, documented, unbuilt follow-up, not a silently broken path.
5. E2E specs were written but not executed live in this pass (no `.env.test` in this worktree) — the requester's own independent verification pass will run them live, per the established program pattern.

## Commits on this branch (in order)

1. Move `Invoices` and `Expenses` into `(forge)`, add ForgeShell chrome and route-group/branding test updates.
2. db: `isExpenseEligibleForInvoiceCharge`, `listEligibleExpensesForJob` (expenses.ts), `addExpenseChargeToInvoice` (invoices.ts) — the real expense → invoice linkage.
3. Wire the "Eligible expenses" section into invoice detail (`eligible-expenses-section.tsx`, `forge-invoice-eligible-expenses-view-model.ts`, `addExpenseChargeToInvoiceAction`).
4. Capabilities: add `canCreateExpenses`/`canApproveExpenses`, replace invoice-capability stand-ins across `expenses/actions.ts` and the expense detail page.
5. Tests: `isExpenseEligibleForInvoiceCharge` + eligible-expenses view-model unit tests.
6. tests: new `invoices-base44-shell-bot.spec.ts`/`expenses-base44-shell-bot.spec.ts`/`payments-flow-bot.spec.ts` E2E specs, `selectors.ts` route additions.
7. docs: this report.

(Exact SHAs to be filled in by `git log --oneline` once committed — see the commit step immediately following this report in the branch history.)
