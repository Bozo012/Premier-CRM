-- Permanently protect working invoices: once kind = 'working', it can never
-- change to anything else via mutation.
--
-- Root cause this closes: updateInvoiceMetadata() allowed changing `kind`
-- with only an app-level `status = 'draft'` check, no DB trigger. Once
-- `kind` moved away from 'working', the existing
-- prevent_working_invoice_send_or_pay trigger (condition: kind = 'working')
-- no longer applied, so send/pay proceeded normally on a row that was
-- supposed to be protected. The only sanctioned path from a working
-- invoice to a final invoice is generateFinalInvoiceFromWorking()
-- snapshotting a NEW row — the working invoice's kind must never be
-- repurposed in place. Fires for every role including service_role, same
-- guarantee as the change-order immutability triggers.

CREATE OR REPLACE FUNCTION public.prevent_working_invoice_kind_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.kind = 'working' AND NEW.kind != 'working' THEN
    RAISE EXCEPTION 'A working invoice''s kind cannot be changed. Use the '
      'final-invoice generation flow to create a new final invoice instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER invoices_prevent_working_kind_change
  BEFORE UPDATE OF kind ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_working_invoice_kind_change();
