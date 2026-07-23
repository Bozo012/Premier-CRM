-- ============================================================================
-- INVOICE FOUNDATION
-- ============================================================================
-- Invoice numbering, share_token integrity, FK delete-behavior hardening, and
-- atomic payment application. Schema for invoices/invoice_line_items/payments
-- already exists (see 0002_crm_core.sql) with zero rows in production as of
-- this migration, so no data backfill is required.

-- ============================================================================
-- INVOICE NUMBERING (matches the estimate_number pattern in
-- 20260511123231_estimates.sql — quote_number/job_number were never actually
-- wired up despite existing as columns, so this is the pattern to follow)
-- ============================================================================

CREATE SEQUENCE public.invoice_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT AS $$
  SELECT 'INV-' || to_char(nextval('public.invoice_number_seq'), 'FM000000');
$$ LANGUAGE sql VOLATILE
   SET search_path = public;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET DEFAULT public.next_invoice_number();

-- Zero rows in production; safe to enforce NOT NULL directly.
ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET NOT NULL;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);

GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;

-- ============================================================================
-- SHARE TOKEN INTEGRITY
-- ============================================================================
-- invoices_share_token_idx already exists but was never a uniqueness
-- guarantee. Public token lookups (app/i/[token]) need this enforced, not
-- just indexed, matching the public-access-token pattern.

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_share_token_unique UNIQUE (share_token);

-- ============================================================================
-- FK DELETE BEHAVIOR
-- ============================================================================
-- CONVENTIONS.md requires every FK to specify ON DELETE explicitly; these
-- four were left at the implicit NO ACTION default. Fixed here to match how
-- this data should actually behave:
--   invoices.job_id    -> RESTRICT   (financial record; must not disappear
--                                     silently if someone tries to delete a
--                                     job that has been invoiced)
--   invoices.quote_id  -> SET NULL   (optional reference; deleting the quote
--                                     should not block or cascade the invoice)
--   payments.invoice_id -> RESTRICT (payment history is immutable evidence)
--   quotes.job_id      -> SET NULL   (was CASCADE; flagged as a known risk in
--                                     the prior session's handoff notes —
--                                     deleting a job must not delete quote
--                                     history)
--
-- Out of scope for this pass: jobs.customer_id / jobs.property_id also lack
-- an explicit ON DELETE (pre-existing from 0002_crm_core.sql, unrelated to
-- invoicing specifically) — flagged in docs/IMPLEMENTATION-STATUS.md for a
-- future hardening pass rather than bundled in here.

ALTER TABLE public.invoices
  DROP CONSTRAINT invoices_job_id_fkey,
  ADD CONSTRAINT invoices_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices
  DROP CONSTRAINT invoices_quote_id_fkey,
  ADD CONSTRAINT invoices_quote_id_fkey
    FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT payments_invoice_id_fkey,
  ADD CONSTRAINT payments_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.quotes
  DROP CONSTRAINT quotes_job_id_fkey,
  ADD CONSTRAINT quotes_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

-- ============================================================================
-- ATOMIC PAYMENT APPLICATION
-- ============================================================================
-- Recalculates amount_paid and status inside the same transaction as the
-- payment INSERT, so it can't race with a concurrent payment. Rejects
-- payments against void invoices, non-positive amounts, and amounts that
-- would exceed the invoice total (overpayment). Runs as the invoking user —
-- no SECURITY DEFINER needed since the existing org_isolation RLS policy
-- (FOR ALL) already grants UPDATE on invoices to org members.

CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice()
RETURNS TRIGGER AS $$
DECLARE
  inv RECORD;
  new_paid NUMERIC;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', NEW.invoice_id;
  END IF;

  IF inv.status = 'void' THEN
    RAISE EXCEPTION 'Cannot record a payment against a void invoice';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  new_paid := inv.amount_paid + NEW.amount;

  IF new_paid > inv.total THEN
    RAISE EXCEPTION
      'Payment of % would exceed the invoice total (amount due: %)',
      NEW.amount, inv.amount_due;
  END IF;

  UPDATE public.invoices
  SET amount_paid = new_paid,
      status = CASE
        WHEN new_paid >= inv.total THEN 'paid'::invoice_status
        ELSE 'partially_paid'::invoice_status
      END,
      paid_at = CASE WHEN new_paid >= inv.total THEN now() ELSE inv.paid_at END
  WHERE id = inv.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER payments_apply_to_invoice
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_invoice();
