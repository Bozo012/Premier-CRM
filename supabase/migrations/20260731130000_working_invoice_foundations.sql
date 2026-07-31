-- Working invoice foundations.
--
-- A working invoice is the one editable, never-sent, never-paid ledger a
-- job accumulates actuals/approved extras/credits against while work is in
-- progress. The final invoice is a separate row snapshotted from it — the
-- working invoice's kind is never changed in place, so the "what did we
-- actually send/collect" history stays exactly what was built and tested
-- in the invoice-management phase.

-- One non-void working invoice per job.
CREATE UNIQUE INDEX invoices_one_working_per_job
  ON public.invoices (job_id)
  WHERE kind = 'working' AND status != 'void';

-- Set once, when a final invoice is generated from this working invoice.
-- Marks it as "snapshotted" without repurposing the row.
ALTER TABLE public.invoices
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN finalized_into_invoice_id UUID REFERENCES public.invoices(id);

-- ============================================================================
-- Guard: a working invoice can never be sent, viewed, or paid directly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_working_invoice_send_or_pay()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'working' AND NEW.status NOT IN ('draft', 'void') THEN
    RAISE EXCEPTION 'A working invoice cannot be sent or paid directly (status=%). '
      'Generate a final invoice instead.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER invoices_prevent_working_send_or_pay
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_working_invoice_send_or_pay();

CREATE OR REPLACE FUNCTION public.prevent_payment_against_working_invoice()
RETURNS TRIGGER AS $$
DECLARE
  invoice_kind_value public.invoice_kind;
BEGIN
  SELECT kind INTO invoice_kind_value FROM public.invoices WHERE id = NEW.invoice_id;
  IF invoice_kind_value = 'working' THEN
    RAISE EXCEPTION 'Payments cannot be recorded against a working invoice.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER payments_prevent_against_working_invoice
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_against_working_invoice();

-- ============================================================================
-- Line-item source attribution
-- ============================================================================
-- Every working-invoice line must be traceable to why it's there. Nullable
-- because existing invoice_line_items (sent/paid invoices from before this
-- migration) have no source to backfill and are not working-invoice lines.

ALTER TABLE public.invoice_line_items
  ADD COLUMN source_type TEXT CHECK (source_type IN ('quote_line', 'change_order', 'credit', 'adjustment')),
  ADD COLUMN source_quote_line_id UUID REFERENCES public.quote_line_items(id),
  ADD COLUMN source_note TEXT;
-- source_change_order_revision_id is added in the change-orders migration
-- (change_order_revisions doesn't exist yet at this point in the sequence).
