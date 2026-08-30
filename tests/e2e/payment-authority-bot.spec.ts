/**
 * payment-authority-bot: closes a real coverage gap found during the
 * invoice-cutover-readiness audit (docs/ops/invoice-cutover-readiness.md).
 *
 * apply_payment_to_invoice() (supabase/migrations/20260722000000_invoice_foundation.sql)
 * is the DB trigger that recomputes amount_paid/status on every payment
 * insert and rejects invalid payments. Before this file existed, no test in
 * the repo both (a) issued a *partial* payment with a controlled amount and
 * (b) asserted the resulting DB columns directly — the only test that
 * asserts DB columns for a payment (invoice-totals-recalc-bot.spec.ts #4)
 * happens to pay the invoice in full, landing on 'paid' rather than
 * 'partially_paid'. Likewise, no test attempted a negative or
 * overpayment amount against the live trigger and confirmed rejection —
 * payments-flow-bot.spec.ts's "can never exceed the real amount due" test
 * only checks the HTML input's client-side max attribute, not server
 * enforcement.
 *
 * This file calls recordPayment() directly (bypassing the Zod input schema
 * and server action entirely, same pattern as invoice-totals-recalc-bot.spec.ts),
 * so a pass here proves the *database trigger* itself enforces these rules,
 * not just app-layer validation.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { recordPayment } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('payment authority bot', () => {
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
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_PAYMENT_AUTHORITY_ORG', slug: `e2e-payment-authority-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'PayAuth', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Payment Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: created } = await admin.auth.admin.createUser({ email: `e2e-pay-authority-${Date.now()}@example.com`, password: `Pay_${Math.random().toString(36).slice(2)}!1`, email_confirm: true });
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

  async function createSentInvoice(total: number): Promise<string> {
    const { data: job } = await admin.from('jobs').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Payment authority fixture job', status: 'approved' }).select('id').single();
    const { data: invoice } = await admin.from('invoices').insert({ org_id: orgId, job_id: job!.id, kind: 'standalone', status: 'draft', title: 'Payment authority fixture invoice' }).select('id').single();
    const invoiceId = invoice!.id;
    await admin.from('invoice_line_items').insert({ invoice_id: invoiceId, name: 'Fixture line', unit: 'ea', quantity: 1, unit_price: total });
    await admin.from('invoices').update({ status: 'sent' }).eq('id', invoiceId);
    return invoiceId;
  }

  test('1. a $100 partial payment against a $300 invoice produces DB-computed partially_paid, amount_paid=100, amount_due=200', async () => {
    const invoiceId = await createSentInvoice(300);

    const result = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: 100, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(result.success).toBe(true);

    const { data: invoice } = await admin.from('invoices').select('total, amount_paid, amount_due, status').eq('id', invoiceId).single();
    expect(invoice?.total).toBe(300);
    expect(invoice?.amount_paid).toBe(100);
    expect(invoice?.amount_due).toBe(200);
    expect(invoice?.status).toBe('partially_paid');
  });

  test('2. a second payment completing the balance transitions partially_paid -> paid', async () => {
    const invoiceId = await createSentInvoice(300);
    await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: 100, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });

    const second = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: 200, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(second.success).toBe(true);

    const { data: invoice } = await admin.from('invoices').select('amount_paid, amount_due, status').eq('id', invoiceId).single();
    expect(invoice?.amount_paid).toBe(300);
    expect(invoice?.amount_due).toBe(0);
    expect(invoice?.status).toBe('paid');
  });

  test('3. the DB trigger rejects a payment that would exceed the remaining balance — not just the UI', async () => {
    const invoiceId = await createSentInvoice(100);

    // Bypasses the Zod schema and server action entirely — this proves the
    // *database* rejects overpayment, not merely a client-side <input max>.
    const result = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: 150, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(result.success).toBe(false);

    const { data: invoice } = await admin.from('invoices').select('amount_paid, amount_due, status').eq('id', invoiceId).single();
    expect(invoice?.amount_paid).toBe(0);
    expect(invoice?.amount_due).toBe(100);
    expect(invoice?.status).toBe('sent');
  });

  test('4. the DB trigger rejects a negative payment amount even when the Zod schema is bypassed', async () => {
    const invoiceId = await createSentInvoice(100);

    const result = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: -50, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(result.success).toBe(false);

    const { data: invoice } = await admin.from('invoices').select('amount_paid, status').eq('id', invoiceId).single();
    expect(invoice?.amount_paid).toBe(0);
    expect(invoice?.status).toBe('sent');
  });

  test('5. the DB trigger rejects any payment against a void invoice', async () => {
    const invoiceId = await createSentInvoice(100);
    await admin.from('invoices').update({ status: 'void' }).eq('id', invoiceId);

    const result = await recordPayment(admin, { orgId, actorUserId: userId, input: { invoiceId, amount: 50, method: 'check', paidAt: new Date().toISOString().slice(0, 10) } });
    expect(result.success).toBe(false);

    const { data: invoice } = await admin.from('invoices').select('amount_paid, status').eq('id', invoiceId).single();
    expect(invoice?.amount_paid).toBe(0);
    expect(invoice?.status).toBe('void');
  });
});
