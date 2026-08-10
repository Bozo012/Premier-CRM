-- Expense-to-invoice double-billing gap, found during independent
-- verification of rebuild/base44-exact-finance (PR #133). Repository audit
-- confirmed the intended business rule: one expense represents one incurred
-- cost and may be billed to the customer at most once. No code path anywhere
-- links the same expense to more than one invoice_line_items row, no
-- partial-billing UI exists despite the expenses.status enum containing
-- 'partially_invoiced' (an unbuilt, unwritten status literal — see
-- packages/db/queries/expenses.ts's deriveApprovedExpenseStatus, which never
-- produces it), and voidInvoice() never clears a linked expense's
-- invoice_id/status — historical linkage is treated as permanent, not
-- something a voided invoice frees for rebilling. Data audit against both
-- premier-crm-e2e and premier-crm-prod (read-only) found zero existing
-- invoice_line_items rows with a non-null source_expense_id, let alone a
-- duplicate, so this constraint is purely additive with nothing to clean up.
--
-- addExpenseChargeToInvoice() (packages/db/queries/invoices.ts) already
-- guards this with a pre-insert existence check, but that is a check-then-act
-- race: two concurrent requests can both pass the check before either insert
-- commits. This is the same DB-level-authority pattern already used by
-- invoices_one_deposit_per_job (20260802040000_deposit_invoice_uniqueness.sql)
-- and invoices_one_working_per_job — the app-layer check stays as a friendly
-- pre-check for the common case, this index is the real concurrency
-- guarantee. A losing concurrent insert now hits unique_violation, which
-- addExpenseChargeToInvoice must translate into the same
-- "already been added to an invoice" VALIDATION_ERROR its pre-check already
-- returns, not a raw DB exception.
CREATE UNIQUE INDEX invoice_line_items_source_expense_id_key
  ON public.invoice_line_items (source_expense_id)
  WHERE source_expense_id IS NOT NULL;
