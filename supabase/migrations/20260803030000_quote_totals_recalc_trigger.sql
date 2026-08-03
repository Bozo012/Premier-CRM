-- Fixes a real production defect found while populating the Premier CRM
-- Demonstration organization: create_quote_from_estimate() copies
-- estimate_line_items into quote_line_items via a raw SQL loop but never
-- recalculates quotes.subtotal/tax_amount/total afterward. quotes.total is
-- a plain stored column (NUMERIC DEFAULT 0), not a generated one — the only
-- code that ever recalculated it was the private TS helper
-- recalcQuoteTotals() in packages/db/queries/quotes.ts, called only from
-- addQuoteLineItem/updateQuoteLineItem/removeQuoteLineItem. Any quote
-- created via the RPC path (both the remote_estimate and
-- site_visit_required triage paths — the ONLY path
-- createQuoteFromEstimateWorkflowAction uses) was left permanently at
-- total=0 despite having correctly-priced line items, until a staff member
-- happened to manually touch a line item afterward.
--
-- Fixed structurally rather than by teaching the RPC a second copy of the
-- totals formula (which could drift from the TS version): a single SQL
-- function is now the one source of truth, fired by a trigger on
-- quote_line_items for every insert/update/delete regardless of which code
-- path wrote it — matching the original design intent already documented
-- in quotes' own column comment ("Totals (calculated from line items via
-- trigger)", 0002_crm_core.sql) which was apparently never implemented.
-- packages/db/queries/quotes.ts's recalcQuoteTotals() is updated in the
-- same commit to call this RPC instead of duplicating the arithmetic, so
-- there remains exactly one formula.

CREATE OR REPLACE FUNCTION public.recalc_quote_totals(p_quote_id UUID)
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
  SELECT COALESCE(SUM(total_quoted), 0) INTO v_subtotal
  FROM public.quote_line_items
  WHERE quote_id = p_quote_id;

  SELECT tax_pct, discount_amount INTO v_tax_pct, v_discount
  FROM public.quotes
  WHERE id = p_quote_id;

  v_tax_amount := ROUND(v_subtotal * (COALESCE(v_tax_pct, 0) / 100), 2);
  v_total := v_subtotal + v_tax_amount - COALESCE(v_discount, 0);

  UPDATE public.quotes
  SET subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total
  WHERE id = p_quote_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_quote_totals(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_quote_totals(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trigger_recalc_quote_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_quote_totals(COALESCE(NEW.quote_id, OLD.quote_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER quote_line_items_recalc_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalc_quote_totals();

-- One-time backfill: correct any already-existing quotes whose totals were
-- left at 0 by the defect (identified by having priced line items but a
-- stored total that doesn't match their sum — safe, idempotent, and a
-- strict no-op for every quote that was already correct, e.g. everything
-- created through addQuoteLineItem's existing recalc call).
DO $$
DECLARE
  v_quote_id UUID;
BEGIN
  FOR v_quote_id IN
    SELECT q.id
    FROM public.quotes q
    JOIN (
      SELECT quote_id, COALESCE(SUM(total_quoted), 0) AS computed_subtotal
      FROM public.quote_line_items
      GROUP BY quote_id
    ) agg ON agg.quote_id = q.id
    WHERE q.subtotal IS DISTINCT FROM agg.computed_subtotal
  LOOP
    PERFORM public.recalc_quote_totals(v_quote_id);
  END LOOP;
END;
$$;
