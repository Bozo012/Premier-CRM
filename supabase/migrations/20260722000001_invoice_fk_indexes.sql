-- ============================================================================
-- INVOICE FK COVERING INDEXES
-- ============================================================================
-- Flagged by Supabase performance advisor after 20260722000000_invoice_foundation.sql:
-- invoices.quote_id and invoice_line_items.quote_line_id are FKs with no
-- covering index, used when tracing an invoice/line item back to its source
-- quote (traceability, never live-synced).

CREATE INDEX invoices_quote_id_idx
  ON public.invoices (quote_id);

CREATE INDEX invoice_line_items_quote_line_id_idx
  ON public.invoice_line_items (quote_line_id);
