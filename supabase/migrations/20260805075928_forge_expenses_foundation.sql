-- Forge expenses foundation.
--
-- Expenses are Premier's internal cost ledger. Invoices remain the customer-
-- payable ledger. The optional invoice link below is traceability only: costs
-- must never be silently copied into invoice totals without an explicit
-- server action.

CREATE TYPE public.expense_category AS ENUM (
  'materials',
  'labor',
  'equipment',
  'subcontractor',
  'travel',
  'permit',
  'other'
);

CREATE TYPE public.expense_status AS ENUM (
  'draft',
  'submitted',
  'needs_receipt',
  'needs_review',
  'approved',
  'rejected',
  'internal_only',
  'ready_to_invoice',
  'partially_invoiced',
  'invoiced',
  'reimbursed',
  'voided'
);

CREATE TYPE public.expense_billing_treatment AS ENUM (
  'internal_cost_only',
  'included_fixed_price',
  'included_accepted_quote',
  'reimbursable_at_cost',
  'billable_with_markup',
  'customer_approved_pass_through',
  'pending_review',
  'non_billable'
);

CREATE TYPE public.expense_receipt_visibility AS ENUM (
  'internal',
  'customer_visible'
);

CREATE SEQUENCE IF NOT EXISTS public.expense_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_expense_number()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'EXP-' || LPAD(nextval('public.expense_number_seq')::TEXT, 6, '0');
$$;

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_number TEXT NOT NULL DEFAULT public.next_expense_number(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  receipt_vault_item_id UUID REFERENCES public.vault_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  category public.expense_category NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (amount + tax) STORED,
  status public.expense_status NOT NULL DEFAULT 'draft',
  billing_treatment public.expense_billing_treatment NOT NULL DEFAULT 'pending_review',
  customer_charge_amount NUMERIC(12,2),
  markup_pct NUMERIC(5,2),
  payment_method public.payment_method NOT NULL DEFAULT 'other',
  receipt_visibility public.expense_receipt_visibility NOT NULL DEFAULT 'internal',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_comment TEXT,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  internal_notes TEXT NOT NULL DEFAULT '',
  customer_visible_description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT expenses_expense_number_key UNIQUE (expense_number),
  CONSTRAINT expenses_description_nonempty CHECK (length(trim(description)) > 0),
  CONSTRAINT expenses_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT expenses_tax_nonnegative CHECK (tax >= 0),
  CONSTRAINT expenses_customer_charge_nonnegative CHECK (
    customer_charge_amount IS NULL OR customer_charge_amount >= 0
  ),
  CONSTRAINT expenses_markup_nonnegative CHECK (markup_pct IS NULL OR markup_pct >= 0),
  CONSTRAINT expenses_billing_customer_copy CHECK (
    billing_treatment IN (
      'reimbursable_at_cost',
      'billable_with_markup',
      'customer_approved_pass_through'
    )
    OR customer_visible_description IS NULL
    OR length(trim(customer_visible_description)) = 0
  )
);

CREATE INDEX expenses_org_created_idx ON public.expenses (org_id, created_at DESC);
CREATE INDEX expenses_org_status_created_idx ON public.expenses (org_id, status, created_at DESC);
CREATE INDEX expenses_org_job_idx ON public.expenses (org_id, job_id);
CREATE INDEX expenses_org_invoice_idx ON public.expenses (org_id, invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX expenses_receipt_vault_item_idx ON public.expenses (receipt_vault_item_id) WHERE receipt_vault_item_id IS NOT NULL;

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expenses FROM authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.expense_number_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.next_expense_number() TO service_role;

CREATE POLICY "expenses_select_org_members" ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.user_is_in_org(org_id));

COMMENT ON TABLE public.expenses IS
  'Internal PPM cost ledger. Customer invoice totals are authoritative in invoices and are linked only through explicit reviewed actions.';

ALTER TABLE public.invoice_line_items
  ADD COLUMN source_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN source_expense_cost_snapshot NUMERIC(12,2),
  ADD COLUMN source_expense_customer_charge_snapshot NUMERIC(12,2);

CREATE INDEX invoice_line_items_source_expense_idx
  ON public.invoice_line_items (source_expense_id)
  WHERE source_expense_id IS NOT NULL;

COMMENT ON COLUMN public.invoice_line_items.source_expense_id IS
  'Optional trace link to an approved expense; invoice row amounts remain explicit snapshots, not live expense values.';
