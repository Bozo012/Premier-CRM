-- Customer portal: signed-in customers can read their own invoices (SELECT-only).
-- Additive to org_isolation_invoices — staff access is unaffected. Reached via
-- jobs.customer_id since invoices has no direct customer_id column (job_id is
-- NOT NULL on invoices, so every invoice has exactly one path to a customer).
--
-- Part of the website customer-portal integration (docs/07-customer-portal-integration-plan.md,
-- rollout step 3): closes the gap where invoices/quotes/payments had only the
-- staff-facing org_isolation policy and no customer-scoped SELECT policy,
-- confirmed by direct query against pg_policies before this migration was written.
CREATE POLICY "customer_select_own_invoices" ON public.invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.id = invoices.job_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );
