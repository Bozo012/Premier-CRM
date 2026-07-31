-- Job deposits: requirement/configuration record only.
--
-- Deliberately does NOT store paid/partial/refunded amounts — invoices
-- (kind='deposit') and payments already are, and remain, the authoritative
-- ledger for money. Duplicating payment state here would eventually
-- disagree with the invoice/payment records. Payment status is derived at
-- query time from deposit_invoice_id -> invoices/payments.

CREATE TYPE public.deposit_requirement_status AS ENUM ('none', 'required', 'waived');

CREATE TABLE public.job_deposits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- The deposit invoice, once one has been created. amount billed/paid/
  -- refunded/credited all live on this invoice + its payments — not here.
  deposit_invoice_id  UUID REFERENCES public.invoices(id),

  requirement_status  public.deposit_requirement_status NOT NULL DEFAULT 'none',
  required_amount     NUMERIC(12,2),
  required_percentage NUMERIC(5,2),
  due_date            DATE,

  blocks_scheduling   BOOLEAN NOT NULL DEFAULT false,
  blocks_work_start   BOOLEAN NOT NULL DEFAULT true,

  waived_reason       TEXT,
  waived_by_user_id   UUID REFERENCES auth.users(id),
  waived_at           TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT job_deposits_one_per_job UNIQUE (job_id),
  CONSTRAINT job_deposits_amount_nonnegative CHECK (required_amount IS NULL OR required_amount >= 0),
  CONSTRAINT job_deposits_percentage_range CHECK (
    required_percentage IS NULL OR (required_percentage >= 0 AND required_percentage <= 100)
  ),
  CONSTRAINT job_deposits_not_both_amount_and_percentage CHECK (
    NOT (required_amount IS NOT NULL AND required_percentage IS NOT NULL)
  ),
  CONSTRAINT job_deposits_waived_requires_reason CHECK (
    requirement_status != 'waived' OR (waived_reason IS NOT NULL AND waived_by_user_id IS NOT NULL)
  )
);

CREATE INDEX job_deposits_org_idx ON public.job_deposits (org_id);
CREATE INDEX job_deposits_invoice_idx ON public.job_deposits (deposit_invoice_id)
  WHERE deposit_invoice_id IS NOT NULL;

CREATE TRIGGER job_deposits_updated_at
  BEFORE UPDATE ON public.job_deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.job_deposits ENABLE ROW LEVEL SECURITY;

-- Deposits are a financial control point (matches the owner/admin-only
-- write policy already applied to invoices/payments): any org member can
-- read, but only owner/admin can write.
CREATE POLICY "org_select_job_deposits" ON public.job_deposits
  FOR SELECT USING (public.user_is_in_org(org_id));

CREATE POLICY "owner_admin_write_job_deposits" ON public.job_deposits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = job_deposits.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "owner_admin_update_job_deposits" ON public.job_deposits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = job_deposits.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "owner_admin_delete_job_deposits" ON public.job_deposits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = job_deposits.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "customer_select_own_job_deposits" ON public.job_deposits
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.id = job_deposits.job_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_deposits TO service_role;
