-- Restrict direct-client write access to financial records (invoices,
-- payments) to owner/admin, matching the capability design in
-- packages/shared/permissions.ts (canRecordPayments/canVoidInvoices/
-- canDeleteInvoices/canIssueRefunds are owner/admin-only; canCreateInvoices/
-- canSendInvoices remain open to employee/subcontractor).
--
-- All legitimate app writes to these tables already go through server
-- actions using the service-role client (apps/web/app/(app)/invoices/
-- actions.ts's createServiceClient()), which bypasses RLS entirely — so
-- this has no effect on the app's own create/send invoice flow for
-- employee/subcontractor accounts. It closes the gap where an employee's
-- own authenticated session could otherwise insert a payment or void/delete
-- an invoice by calling the Supabase REST API directly, bypassing the
-- capability check in that file (confirmed via grep: no client-side code
-- anywhere in apps/web writes to 'invoices' or 'payments' directly — both
-- hits are the server-action file and the public /i/[token] read-only page).
--
-- invoice_line_items keeps its existing blanket org-member policy
-- unchanged: line-item editing is part of canCreateInvoices, which stays
-- open to employee/subcontractor at both the server-action and RLS layers.

DROP POLICY IF EXISTS "org_isolation_invoices" ON public.invoices;
DROP POLICY IF EXISTS "org_isolation_payments" ON public.payments;

CREATE POLICY "invoices_select_org_members" ON public.invoices
  FOR SELECT USING (user_is_in_org(org_id));

CREATE POLICY "invoices_insert_owner_admin" ON public.invoices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invoices.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "invoices_update_owner_admin" ON public.invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invoices.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "invoices_delete_owner_admin" ON public.invoices
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invoices.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "payments_select_org_members" ON public.payments
  FOR SELECT USING (user_is_in_org(org_id));

CREATE POLICY "payments_insert_owner_admin" ON public.payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = payments.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "payments_update_owner_admin" ON public.payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = payments.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "payments_delete_owner_admin" ON public.payments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = payments.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
