/**
 * deposit-invoice-creation-bot: proves createDepositInvoice()
 * (packages/db/queries/deposits.ts) — the fix for a real gap found while
 * populating the Premier CRM Demonstration organization: no application
 * code path ever created a kind='deposit' invoice or set
 * job_deposits.deposit_invoice_id, even though the column, the DB-level
 * working-invoice protections, and getDepositState() all assumed it would
 * eventually be populated. This bot creates its own throwaway org/customer
 * /property/job fixtures via the service-role client — it does not touch
 * PPM or the real Demo organization.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { createDepositInvoice } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('deposit invoice creation bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: 'E2E_DEPOSIT_INVOICE_ORG', slug: `e2e-deposit-invoice-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_DEPOSIT_INVOICE_OTHER_ORG', slug: `e2e-deposit-invoice-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'Deposit', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Fixture Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    for (const id of [orgId, otherOrgId]) {
      await admin.from('organizations').delete().eq('id', id);
    }
  });

  async function createJob(quotedTotal: number | null): Promise<string> {
    const { data: job } = await admin
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Deposit fixture job', status: 'approved', quoted_total: quotedTotal })
      .select('id')
      .single();
    return job!.id;
  }

  test('1. fixed-amount requirement: creates a deposit invoice whose single line item equals the required amount, and links deposit_invoice_id', async () => {
    const jobId = await createJob(null);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_amount: 150 });

    const result = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.alreadyExisted).toBe(false);

    const { data: invoice } = await admin.from('invoices').select('kind, status, total, org_id, job_id').eq('id', result.data.invoiceId).single();
    expect(invoice?.kind).toBe('deposit');
    expect(invoice?.status).toBe('draft');
    expect(invoice?.total).toBe(150);

    const { data: requirement } = await admin.from('job_deposits').select('deposit_invoice_id').eq('job_id', jobId).single();
    expect(requirement?.deposit_invoice_id).toBe(result.data.invoiceId);
  });

  test('2. percentage-based requirement: amount is computed from the job\'s quoted_total', async () => {
    const jobId = await createJob(1000);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_percentage: 20 });

    const result = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { data: invoice } = await admin.from('invoices').select('total').eq('id', result.data.invoiceId).single();
    expect(invoice?.total).toBe(200);
  });

  test('3. is idempotent — a second call returns the existing invoice, no duplicate row', async () => {
    const jobId = await createJob(null);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_amount: 75 });

    const first = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(first.success).toBe(true);
    const second = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.data.invoiceId).toBe(first.data.invoiceId);
    expect(second.data.alreadyExisted).toBe(true);

    const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('kind', 'deposit');
    expect(count).toBe(1);
  });

  test('4. concurrent calls cannot create two deposit invoices for the same job (invoices_one_deposit_per_job backstop)', async () => {
    const jobId = await createJob(null);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_amount: 300 });

    const [a, b] = await Promise.all([
      createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' }),
      createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' }),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    if (!a.success || !b.success) return;
    expect(a.data.invoiceId).toBe(b.data.invoiceId);

    const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('kind', 'deposit');
    expect(count).toBe(1);
  });

  test('5. rejects when there is no active deposit requirement (none or waived)', async () => {
    const jobId = await createJob(null);
    const noneResult = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(noneResult.success).toBe(false);

    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'waived', waived_reason: 'test' });
    const waivedResult = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(waivedResult.success).toBe(false);
  });

  test('6. a job belonging to a different org is rejected (cross-org denial)', async () => {
    const jobId = await createJob(null);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_amount: 100 });

    const result = await createDepositInvoice(admin, { orgId: otherOrgId, jobId, actorUserId: 'fixture-user' });
    expect(result.success).toBe(false);
  });

  test('7. a working invoice on the same job is untouched — the two kinds never collide', async () => {
    const jobId = await createJob(null);
    await admin.from('job_deposits').insert({ org_id: orgId, job_id: jobId, requirement_status: 'required', required_amount: 50 });
    const { data: working } = await admin
      .from('invoices')
      .insert({ org_id: orgId, job_id: jobId, kind: 'working', status: 'draft', title: 'Working invoice' })
      .select('id')
      .single();

    const result = await createDepositInvoice(admin, { orgId, jobId, actorUserId: 'fixture-user' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.invoiceId).not.toBe(working!.id);

    const { data: workingAfter } = await admin.from('invoices').select('kind, status').eq('id', working!.id).single();
    expect(workingAfter?.kind).toBe('working');
    expect(workingAfter?.status).toBe('draft');
  });
});
