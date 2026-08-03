-- Deposit invoice creation gap, found while populating the Premier CRM
-- Demonstration organization: job_deposits.deposit_invoice_id was added by
-- 20260731110000_job_deposits.sql but no application code path ever created
-- a kind='deposit' invoice or set that column. (The working invoice's
-- equivalent gap does NOT exist — apply_job_scheduling() already
-- auto-creates it; this migration is scoped to deposit invoices only.)
--
-- DB-level protection, mirroring invoices_one_working_per_job: at most one
-- non-void deposit invoice per job. The application-layer creation function
-- (createDepositInvoice in packages/db/queries/deposits.ts) is
-- select-then-insert for the common case, with this constraint as the real
-- concurrency guarantee — a losing concurrent insert hits unique_violation
-- and the caller re-selects the winner's row, same pattern already used by
-- generate_estimate_from_site_visit() and createJobFromAcceptedQuote().
CREATE UNIQUE INDEX invoices_one_deposit_per_job
  ON public.invoices (job_id)
  WHERE kind = 'deposit' AND status != 'void';
