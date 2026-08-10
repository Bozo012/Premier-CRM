/**
 * expense-invoice-integrity-bot: proves the DB, not application timing, is
 * the real authority preventing an expense from being billed to more than
 * one invoice — the exact gap flagged during independent verification of
 * rebuild/base44-exact-finance (PR #133). addExpenseChargeToInvoice()'s
 * pre-insert existence check (packages/db/queries/invoices.ts) is a
 * check-then-act race: two concurrent requests can both pass it before
 * either insert commits. invoice_line_items_source_expense_id_key
 * (migration 20260810060936, a partial unique index on
 * invoice_line_items.source_expense_id WHERE NOT NULL) is the real
 * guarantee — this bot fires two genuinely concurrent linkage attempts at
 * the same expense and proves exactly one wins.
 *
 * Uses the same self-contained service-role fixture pattern as
 * invoice-totals-recalc-bot.spec.ts (a dedicated org/customer/property/
 * job/user created and torn down per run) rather than the shared
 * premier-crm-e2e demonstration org, since the concurrency proof needs
 * exact control over expense/invoice state that live shared org data can't
 * guarantee. Test 7 additionally logs into the real browser UI as this
 * fixture's own owner account to prove the "Add to invoice" success path
 * that the shared-org bots (expenses-base44-shell-bot, invoices-base44-
 * shell-bot) could not reach live, since no job in the shared org's fixture
 * data was simultaneously expense-eligible and paired with a draft,
 * non-working invoice.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { addExpenseChargeToInvoice, listEligibleExpensesForJob } from '@premier/db';
import { loginAs } from './utils/auth';

const canRun = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('expense invoice integrity bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let customerId: string;
  let propertyId: string;
  let jobId: string;
  let userId: string;
  let userEmail: string;
  let userPassword: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_EXPENSE_INVOICE_INTEGRITY_ORG', slug: `e2e-expinv-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'ExpInv', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 ExpInv Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    // status: 'scheduled' — the real /expenses/new job picker only lists
    // operationally-eligible jobs (not 'lead'-stage), confirmed during
    // manual live verification of this same gap.
    const { data: job } = await admin
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'ExpInv fixture job', status: 'scheduled' })
      .select('id')
      .single();
    jobId = job!.id;

    userEmail = `e2e-expinv-${Date.now()}@example.com`;
    userPassword = `ExpInv_${Math.random().toString(36).slice(2)}!1`;
    const { data: created } = await admin.auth.admin.createUser({ email: userEmail, password: userPassword, email_confirm: true });
    userId = created!.user!.id;
    await admin.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner', status: 'active' });
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: invoices } = await admin.from('invoices').select('id').eq('job_id', jobId);
    for (const invoice of invoices ?? []) {
      await admin.from('invoice_line_items').delete().eq('invoice_id', invoice.id);
    }
    await admin.from('invoices').delete().eq('job_id', jobId);
    await admin.from('expenses').delete().eq('job_id', jobId);
    await admin.from('jobs').delete().eq('id', jobId);
    await admin.from('org_members').delete().eq('org_id', orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function createReadyToInvoiceExpense(description: string, chargeAmount = 100): Promise<string> {
    const { data, error } = await admin
      .from('expenses')
      .insert({
        org_id: orgId,
        job_id: jobId,
        customer_id: customerId,
        property_id: propertyId,
        description,
        category: 'materials',
        amount: chargeAmount,
        status: 'ready_to_invoice',
        billing_treatment: 'reimbursable_at_cost',
        customer_charge_amount: chargeAmount,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data!.id;
  }

  async function createDraftInvoice(title: string): Promise<string> {
    const { data, error } = await admin
      .from('invoices')
      .insert({ org_id: orgId, job_id: jobId, kind: 'standalone', status: 'draft', title })
      .select('id')
      .single();
    if (error) throw error;
    return data!.id;
  }

  test('1. expense is eligible before linkage', async () => {
    const expenseId = await createReadyToInvoiceExpense('Eligibility check expense');
    const result = await listEligibleExpensesForJob(admin, { jobId, orgId });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.some((e) => e.expense.id === expenseId)).toBe(true);
  });

  test('2-4. add expense to invoice succeeds, persists the exact source_expense_id, recalculates totals, and removes it from the eligible list', async () => {
    const expenseId = await createReadyToInvoiceExpense('Linkage success expense', 150);
    const invoiceId = await createDraftInvoice('Linkage success invoice');

    const before = await admin.from('invoices').select('total').eq('id', invoiceId).single();
    expect(before.data?.total).toBe(0);

    const result = await addExpenseChargeToInvoice(admin, { invoiceId, expenseId, orgId });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.source_expense_id).toBe(expenseId);
    expect(Number(result.data.unit_price)).toBe(150);

    const after = await admin.from('invoices').select('total').eq('id', invoiceId).single();
    expect(Number(after.data?.total)).toBe(150);

    const eligibleAfter = await listEligibleExpensesForJob(admin, { jobId, orgId });
    expect(eligibleAfter.success).toBe(true);
    if (eligibleAfter.success) {
      expect(eligibleAfter.data.some((e) => e.expense.id === expenseId)).toBe(false);
    }
  });

  test('5. attempting to add the same expense again is rejected with a controlled error, not a raw DB exception', async () => {
    const expenseId = await createReadyToInvoiceExpense('Duplicate-attempt expense', 75);
    const invoiceA = await createDraftInvoice('Duplicate-attempt invoice A');
    const invoiceB = await createDraftInvoice('Duplicate-attempt invoice B');

    const first = await addExpenseChargeToInvoice(admin, { invoiceId: invoiceA, expenseId, orgId });
    expect(first.success).toBe(true);

    const second = await addExpenseChargeToInvoice(admin, { invoiceId: invoiceB, expenseId, orgId });
    expect(second.success).toBe(false);
    if (!second.success) {
      // The first call already flipped the expense's own status to
      // 'invoiced' (addExpenseChargeToInvoice's fast-path update), so the
      // second call's eligibility guard rejects it before even reaching
      // the duplicate-link check — a stricter, earlier-firing guard, not a
      // weaker one. The concurrency test below (test 6) is what actually
      // proves the duplicate-link/unique-constraint guard's own message,
      // since there the eligibility check on both racing calls still sees
      // 'ready_to_invoice' at read time.
      expect(second.error).toContain('not eligible to be added to an invoice');
    }

    const { count } = await admin
      .from('invoice_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('source_expense_id', expenseId);
    expect(count).toBe(1);
  });

  test('6. two concurrent linkage attempts on the same expense — the database, not app timing, allows only one to win', async () => {
    const expenseId = await createReadyToInvoiceExpense('Concurrency expense', 60);
    const invoiceA = await createDraftInvoice('Concurrency invoice A');
    const invoiceB = await createDraftInvoice('Concurrency invoice B');

    // Fired together, not awaited sequentially — both requests race past
    // addExpenseChargeToInvoice's own pre-insert existence check before
    // either insert has committed, exactly the race the DB constraint
    // exists to close.
    const [resultA, resultB] = await Promise.all([
      addExpenseChargeToInvoice(admin, { invoiceId: invoiceA, expenseId, orgId }),
      addExpenseChargeToInvoice(admin, { invoiceId: invoiceB, expenseId, orgId }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    const failures = [resultA, resultB].filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const winner = successes[0];
    const loser = failures[0];
    if (loser && !loser.success) {
      // Whichever request loses the race must still surface the same
      // controlled VALIDATION_ERROR the sequential-duplicate test gets —
      // proving the 23505 -> friendly-error translation in
      // addExpenseChargeToInvoice actually fires under real concurrency,
      // not just when the pre-check alone catches it.
      expect(loser.error).toContain('already been added to an invoice');
    }

    const { data: links, count } = await admin
      .from('invoice_line_items')
      .select('id, invoice_id', { count: 'exact' })
      .eq('source_expense_id', expenseId);
    expect(count).toBe(1);
    const winningInvoiceId = winner && winner.success ? winner.data.invoice_id : null;
    expect(links?.[0]?.invoice_id).toBe(winningInvoiceId);
  });

  test('7. real UI click-through: "Add to invoice" succeeds, shows the line item, and the invoice detail reflects the real linkage', async ({ page }: { page: Page }) => {
    const expenseId = await createReadyToInvoiceExpense('E2E_UI_CLICKTHROUGH_EXPENSE', 90);
    const invoiceId = await createDraftInvoice('UI click-through invoice');

    await loginAs(page, { email: userEmail, password: userPassword });
    await page.goto(`/invoices/${invoiceId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#eligible-expenses-heading')).toBeVisible();
    // Scoped to the specific expense card, not `.first()` — test 1's
    // expense is deliberately never linked (it stays 'ready_to_invoice'
    // forever to prove eligibility persists), so it remains permanently
    // eligible on this same shared fixture job and would otherwise render
    // its own "Add to invoice" button ahead of this test's own expense.
    const expenseCard = page.locator('li', { hasText: 'E2E_UI_CLICKTHROUGH_EXPENSE' });
    const addButton = expenseCard.getByRole('button', { name: /add to invoice/i });
    await expect(addButton).toBeVisible();
    await addButton.click();
    // addExpenseChargeToInvoiceAction responds via a real server-side
    // redirect() to ?message=..., not a client-side state update —
    // waitForLoadState('networkidle') alone does not reliably observe that
    // navigation landing, so wait for the URL itself.
    await page.waitForURL(/\?message=/, { timeout: 10_000 });
    await expect(page.getByText('Expense added to invoice.')).toBeVisible();

    // "No line items yet." only ever renders when the invoice truly has
    // zero line items — asserting it is gone proves a real line item now
    // exists, unlike checking for the expense description/amount text
    // alone (those already appear in the "Eligible expenses" card before
    // the click and would make a weaker assertion pass even if the
    // mutation silently no-op'd).
    await expect(page.getByText('No line items yet.')).not.toBeVisible();

    const { data: lineItem } = await admin
      .from('invoice_line_items')
      .select('source_expense_id, invoice_id, name')
      .eq('source_expense_id', expenseId)
      .maybeSingle();
    expect(lineItem?.invoice_id).toBe(invoiceId);
    expect(lineItem?.name).toBe('E2E_UI_CLICKTHROUGH_EXPENSE');
  });
});
