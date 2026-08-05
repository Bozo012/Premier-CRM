# Forge Base44 UX Integration — Batch 5 Expenses

## Source Anchors

- Premier-CRM base commit: `f274cf617a1b0ca69578f52ec5f534afe418cee4`
- Forge-Base44-UX visual reference commit: `497d0693cccafd89315ec17c3be9885cfaae5c84`
- Working branch: `agent/forge-ux-batch-5-expenses`

## Implemented

- Replaced the `/expenses` placeholder with a real Forge-styled expenses list backed by Premier data.
- Added `/expenses/new` for creating job-scoped expense records with explicit cost, tax, category, vendor, billing treatment, customer-charge snapshot, receipt visibility, and notes.
- Added `/expenses/:expenseId` detail with cost/context, internal vs customer-visible copy, receipt state, activity, invoice-readiness summary, and real submit/approve/reject/void actions.
- Added a Premier-owned `expenses` table, enums, org-scoped RLS, indexes, activity logging, and optional invoice-line trace fields.
- Added shared Zod schemas and DB query helpers for list/detail/create/update/submit/approve/reject/void flows.

## Preserved

- Premier auth remains authoritative through `getServerSupabase()`.
- Premier org context remains authoritative through `getActiveOrgContext()`.
- Premier permission structure remains authoritative:
  - Create/submit expenses uses existing `canCreateInvoices`.
  - Approve/reject expenses uses existing owner/admin financial authority via `canRecordPayments`.
  - Void expenses uses existing owner/admin authority via `canVoidInvoices`.
- Direct authenticated INSERT/UPDATE/DELETE on `public.expenses` is revoked; writes go through trusted server actions.
- Base44 fixtures, mocked persistence, preview harnesses, and platform/auth infrastructure were not ported.

## Backend Rework Notes

- This batch adds the missing expense backend foundation because the prior page was intentionally blocked by schema absence.
- Receipt upload UI is not added yet. The schema supports `receipt_vault_item_id`, but a later batch should wire this to Premier Vault upload/finalization instead of adding a parallel receipt system.
- Invoice integration is prepared but not fully implemented. `invoice_line_items` now has optional `source_expense_id` and snapshot columns, but expenses still require a future explicit invoice-builder action before affecting customer totals.
- Expense search is hydrated server-side over the first 500 org expenses so it can match job/customer/property labels without denormalizing. If expense volume grows, add indexed denormalized search text or a Postgres search function.

## Validation

- `pnpm typecheck` — passed.
- `pnpm test` — passed, 232 tests across 33 files with 6 skipped.
