/**
 * invoice-totals-recalc-bot: proves the fix for a real production defect
 * found immediately after (and structurally identical to) the quote-totals
 * defect, while populating the Premier CRM Demonstration organization —
 * generateFinalInvoiceFromWorking() copies invoice_line_items into a new
 * final invoice but never recalculated the invoice's subtotal/tax/total,
 * leaving every generated final invoice at $0.00 despite correctly-priced
 * line items. Fixed by a single SQL function (recalc_invoice_totals) fired
 * by an AFTER INSERT/UPDATE/DELETE trigger on invoice_line_items — this
 * test proves the final-invoice generation path is now correct
 * immediately on return, that manual line-item editing still works, and
 * that amount_paid/payments are never touched by the recalculation.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { addInvoiceLineItem, updateInvoiceLineItem, removeInvoiceLineItem, generateFinalInvoiceFromWorking, recordPayment } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('invoice totals recalculation bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let customerId: string;
  let propertyId: string;
  let userId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_INVOICE_TOTALS_ORG', slug: `e2e-invoice-totals-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'InvTotals', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Inv Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: created } = await admin.auth.admin.createUser({ email: `e2e-inv-totals-${Date.now()}@example.com`, password: `Inv_${Math.random().toString(36).slice(2)}!1`, email_confirm: true });
    userId = created!.user!.id;
    await admin.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner', status: 'active' });
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('org_members').delete().eq('org_id', orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function createJobWithWorkingInvoice(): Promise<{ jobId: string; workingInvoiceId: string }> {
    const { data: job } = await admin.from('jobs').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Inv totals fixture job', status: 'approved' }).select('id').single();
    const jobId = job!.id;
    const { data: working } = await admin.from('invoices').insert({ org_id: orgId, job_id: jobId, kind: 'working', status: 'draft', title: 'Working invoice' }).select('id').single();
    return { jobId, workingInvoiceId: working!.id };
  }

  test('1. a final invoice generated from a working invoice has the correct total immediately on return — no longer $0.00', async () => {
    const { jobId, workingInvoiceId } = await createJobWithWorkingInvoice();
    await admin.from('invoice_line_items').insert([
      { invoice_id: workingInvoiceId, name: 'Line A', unit: 'ea', quantity: 1, unit_price: 300 },
      { invoice_id: workingInvoiceId, name: 'Line B', unit: 'ea', quantity: 1, unit_price: 220 },
    ]);

    const result = await generateFinalInvoiceFromWorking(admin, { orgId, jobId, actorUserId: userId });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { data: finalInvoice } = await admin.from('invoices').select('subtotal, tax_amount, total').eq('id', result.data.finalInvoiceId).single();
    expect(finalInvoice?.subtotal).toBe(520);
    expect(finalInvoice?.total).toBe(520);

    const { data: finalLines } = await admin.from('invoice_line_items').select('total').eq('invoice_id', result.data.finalInvoiceId);
    expect(finalLines).toHaveLength(2);
  });

  test('2. tax_pct is honored on the final invoice', async () => {
    const { jobId, workingInvoiceId } = await createJobWithWorkingInvoice();
    await admin.from('invoice_line_items').insert({ invoice_id: workingInvoiceId, name: 'Line', unit: 'ea', quantity: 1, unit_price: 100 });

    const result = await generateFinalInvoiceFromWorking(admin, { orgId, jobId, actorUserId: userId });
    expect(result.success).toBe(true);
    if (!result.success) return;
    await admin.from('invoices').update({ tax_pct: 5 }).eq('id', result.data.finalInvoiceId);
    await admin.rpc('recalc_invoice_totals', { p_invoice_id: result.data.finalInvoiceId });

    const { data: finalInvoice } = await admin.from('invoices').select('subtotal, tax_amount, total').eq('id', result.data.finalInvoiceId).single();
    expect(finalInvoice?.subtotal).toBe(100);
    expect(finalInvoice?.tax_amount).toBe(5);
    expect(finalInvoice?.total).toBe(105);
  });

  test('3. repeated finalization is idempotent — returns the same final invoice, no duplicate', async () => {
    const { jobId, workingInvoiceId } = await createJobWithWorkingInvoice();
    await admin.from('invoice_line_items').insert({ invoice_id: workingInvoiceId, name: 'Line', unit: 'ea', quantity: 1, unit_price: 50 });

    const first = await generateFinalInvoiceFromWorking(admin, { orgId, jobId, actorUserId: userId });
    const second = await generateFinalInvoiceFromWorking(admin, { orgId, jobId, actorUserId: userId });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.data.finalInvoiceId).toBe(first.data.finalInvoiceId);

    const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('kind', 'final');
    expect(count).toBe(1);
  });

  test('4. manual line-item editing (add/update/remove) still recalculates correctly, and recording a payment never overwrites amount_paid', async () => {
    const { jobId, workingInvoiceId } = await createJobWithWorkingInvoice();
    await admin.from('invoice_line_items').insert({ invoice_id: workingInvoiceId, name: 'Base', unit: 'ea', quantity: 1, unit_price: 100 });
    const result = await generateFinalInvoiceFromWorking(admin, { orgId, jobId, actorUserId: userId });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const finalInvoiceId = result.data.finalInvoiceId;

    const added = await addInvoiceLineItem(admin, { orgId, input: { invoiceId: finalInvoiceId, name: 'Extra', unit: 'ea', quantity: 1, unitPrice: 25 } });
    expect(added.success).toBe(true);
    let invoice = (await admin.from('invoices').select('total').eq('id', finalInvoiceId).single()).data;
    expect(invoice?.total).toBe(125);

    if (added.success) {
      await updateInvoiceLineItem(admin, { orgId, input: { lineItemId: added.data.id, invoiceId: finalInvoiceId, name: 'Extra', unit: 'ea', quantity: 2, unitPrice: 25 } });
      invoice = (await admin.from('invoices').select('total').eq('id', finalInvoiceId).single()).data;
      expect(invoice?.total).toBe(150);

      await removeInvoiceLineItem(admin, { orgId, input: { lineItemId: added.data.id, invoiceId: finalInvoiceId } });
      invoice = (await admin.from('invoices').select('total').eq('id', finalInvoiceId).single()).data;
      expect(invoice?.total).toBe(100);
    }

    await admin.from('invoices').update({ status: 'sent' }).eq('id', finalInvoiceId);
    const paymentResult = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId: finalInvoiceId, amount: 100, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(paymentResult.success).toBe(true);

    const { data: paidInvoice } = await admin.from('invoices').select('total, amount_paid, amount_due, status').eq('id', finalInvoiceId).single();
    expect(paidInvoice?.total).toBe(100);
    expect(paidInvoice?.amount_paid).toBe(100);
    expect(paidInvoice?.amount_due).toBe(0);
    expect(paidInvoice?.status).toBe('paid');
  });
});
