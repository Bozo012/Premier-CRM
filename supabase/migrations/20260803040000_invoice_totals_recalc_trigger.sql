-- Same defect class as 20260803030000 (quote totals), found immediately
-- afterward while populating the Premier CRM Demonstration organization:
-- generateFinalInvoiceFromWorking() copies invoice_line_items into a new
-- final invoice via a raw multi-row insert but never recalculates
-- invoices.subtotal/tax_amount/total afterward. invoices.total is a plain
-- stored column (NUMERIC DEFAULT 0), not generated. The only code that
-- recalculates it is a private TS helper recalcInvoiceTotals() in
-- packages/db/queries/invoices.ts, called only from
-- addInvoiceLineItem/updateInvoiceLineItem/removeInvoiceLineItem — never
-- from generateFinalInvoiceFromWorking(). Every final invoice generated
-- this way was left at $0.00 despite correctly-copied line items.
--
-- Fixed with the same structural approach as the quote fix: one SQL
-- function as the single source of truth, fired by a trigger on
-- invoice_line_items for every insert/update/delete regardless of write
-- path. Never touches amount_paid (owned exclusively by the existing
-- apply_payment_to_invoice() payment trigger) or invoice kind/status —
-- this migration only maintains subtotal/tax_amount/total.
-- packages/db/queries/invoices.ts's recalcInvoiceTotals() now calls this
-- RPC instead of duplicating the arithmetic, so there remains exactly one
-- formula (same pattern as recalc_quote_totals).

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_pct NUMERIC(5,2);
  v_discount NUMERIC(12,2);
  v_tax_amount NUMERIC(12,2);
  v_total NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;

  SELECT tax_pct, discount_amount INTO v_tax_pct, v_discount
  FROM public.invoices
  WHERE id = p_invoice_id;

  v_tax_amount := ROUND(v_subtotal * (COALESCE(v_tax_pct, 0) / 100), 2);
  v_total := v_subtotal + v_tax_amount - COALESCE(v_discount, 0);

  -- amount_paid is never touched here — owned exclusively by
  -- apply_payment_to_invoice(); amount_due is a generated column
  -- (total - amount_paid) that recomputes automatically.
  UPDATE public.invoices
  SET subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total
  WHERE id = p_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_invoice_totals(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trigger_recalc_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER invoice_line_items_recalc_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalc_invoice_totals();

-- One-time backfill: correct any already-existing invoice whose stored
-- subtotal doesn't match the sum of its own line items. Never touches
-- amount_paid, status, kind, sent_at, paid_at, or finalized_at — only
-- subtotal/tax_amount/total, computed strictly from each invoice's own
-- existing line items (no line items are invented or altered).
DO $$
DECLARE
  v_invoice_id UUID;
  v_affected_count INT := 0;
BEGIN
  FOR v_invoice_id IN
    SELECT i.id
    FROM public.invoices i
    JOIN (
      SELECT invoice_id, COALESCE(SUM(total), 0) AS computed_subtotal
      FROM public.invoice_line_items
      GROUP BY invoice_id
    ) agg ON agg.invoice_id = i.id
    WHERE i.subtotal IS DISTINCT FROM agg.computed_subtotal
  LOOP
    PERFORM public.recalc_invoice_totals(v_invoice_id);
    v_affected_count := v_affected_count + 1;
  END LOOP;
  RAISE NOTICE 'recalc_invoice_totals backfill: % invoice(s) corrected', v_affected_count;
END;
$$;
