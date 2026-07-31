/**
 * staff-permissions-bot: proves what the persistent E2E employee account
 * (see utils/auth.ts's getStaffAccount()) can and cannot do in its own
 * account, alongside the owner in a separate browser context, sharing one
 * org (PR B, Phases 1 & 3).
 *
 * Two things this bot deliberately does NOT infer from:
 *  - Hidden UI alone. Every owner-only restriction below is also attempted
 *    as a DIRECT API write, using createUserApiClient() to sign in as the
 *    employee with the real anon key (the same client shape the browser
 *    app itself uses) — bypassing the UI entirely. A restriction only
 *    counts as proven here if the direct write is also refused.
 *  - Assumed defects. Phase 1's audit (see PR B commit history /
 *    supabase/migrations/20260727000000_org_invites_owner_admin_only.sql)
 *    found and fixed exactly one real gap: org_invites had no role check at
 *    all, so any active org member — including this employee account —
 *    could create/revoke invites directly via the REST API. That fix is
 *    what test 5 below proves is now closed. Every other boundary tested
 *    here (org_members role changes, organizations table writes, /team and
 *    /settings/website page access) was already correctly enforced and
 *    needed no change — these tests exist to keep it that way.
 *
 * CRM data tables (customers, properties, estimates, jobs, quotes) have NO
 * role restriction beyond org membership — confirmed by design (any active
 * member does real field work), not a gap. See
 * employee-estimate-workflow-bot.spec.ts for the positive workflow proof.
 *
 * Invoices/payments are the one exception (Phase 4 below, 2026-07-31
 * capability-layer audit): packages/shared/permissions.ts's capability map
 * lets employee/subcontractor create and send invoices — normal daily
 * operations — but reserves recording payments, voiding, deleting, and
 * refunds for owner/admin, since those alter financial history. That
 * boundary is enforced at TWO layers, and Phase 4 proves both: the server
 * action (apps/web/app/(app)/invoices/actions.ts's getInvoiceActionContext)
 * and, since server-action checks alone don't stop a direct Supabase REST
 * call using the employee's own session, RLS itself (migration
 * 20260731000000_invoices_payments_owner_admin_write.sql).
 */

import { test, expect } from '@playwright/test';
import {
  createUserApiClient,
  getAdminAccount,
  getStaffAccount,
  hasAdminCredentials,
  hasApiTestCredentials,
  hasStaffCredentials,
} from './utils/auth';
import { createStaffScenario, type StaffScenario } from './context/scenario';
import { addInvoiceLineItem, createTestInvoice, type InvoiceFixture } from './context/invoice';
import { createTestJob } from './context/job';
import { recordPaymentForm, routes, team } from './utils/selectors';

const canRun = () => hasAdminCredentials() && hasStaffCredentials();
const SKIP_REASON = 'TEST_ADMIN_* and/or TEST_STAFF_* not set in .env.test';
const canRunApiChecks = () => canRun() && hasApiTestCredentials();
const API_SKIP_REASON =
  SKIP_REASON + ', and/or NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY not set';

test.describe('staff permissions bot', () => {
  test.describe.serial('employee allowed actions (Phase 2)', () => {
    let scenario: StaffScenario;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({
        ownerPage,
        employeePage,
        customer: true,
        property: true,
      });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. employee is signed in under its own persistent account', async () => {
      expect(scenario.employeeSession.isStaffLoggedIn).toBe(true);
      expect(scenario.membership.role).toBe('employee');
      expect(scenario.membership.status).toBe('active');
    });

    test('2. employee can access the dashboard', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.today);
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('3. employee can list and find the owner-created customer', async () => {
      const { page } = scenario.employeeSession;
      const customer = scenario.customer!;

      await page.goto(routes.customers);
      await expect(page.getByText(customer.marker, { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test('4. employee can open the customer and see the owner-created property', async () => {
      const { page } = scenario.employeeSession;
      const customer = scenario.customer!;
      const property = scenario.property!;

      await page.goto(`/customers/${customer.id}`);
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
      await expect(page.getByText(property.addressLine1, { exact: false })).toBeVisible();
    });

    test('5. employee can view org-wide lists (jobs, invoices, quotes, estimates)', async () => {
      const { page } = scenario.employeeSession;

      for (const route of [routes.jobs, routes.invoices, routes.quotes, routes.estimates]) {
        await page.goto(route);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.locator('main')).not.toContainText(/forbidden|not authorized/i);
      }
    });

    test('6. employee session survives logout and re-login', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.today);
      await page.getByRole('button', { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      const account = getStaffAccount();
      await page.goto(routes.login);
      await page.locator('#email').fill(account.email);
      await page.locator('#password').fill(account.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    });
  });

  test.describe.serial('owner-only restrictions (Phase 3)', () => {
    let scenario: StaffScenario;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({ ownerPage, employeePage });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. UI: employee cannot view team management', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.team);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/only owners and admins can view team access/i)).toBeVisible();
      await expect(page.locator('#invite-fullName')).toHaveCount(0);
    });

    test('2. UI: owner can still view team management from its own context', async () => {
      const { page } = scenario.ownerSession;
      await page.goto(routes.team);
      await expect(team.heading(page)).toBeVisible();
    });

    test('3. UI: employee cannot view website settings', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.settings);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/only owners and admins can manage website content/i)).toBeVisible();
    });

    test('4. direct API: employee cannot create an org invite (bypassing the UI)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { error } = await employeeApi
        .from('org_invites')
        .insert({
          org_id: scenario.membership.orgId,
          email: `e2e-blocked-invite-${Date.now()}@example.com`,
          full_name: 'Should Be Blocked',
          role: 'admin',
          invited_by: scenario.membership.userId,
        });

      expect(error, 'expected the direct insert to be refused by RLS/grants').not.toBeNull();
    });

    test('5. direct API: employee cannot promote itself to owner/admin', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { data, error } = await employeeApi
        .from('org_members')
        .update({ role: 'owner' })
        .eq('user_id', scenario.membership.userId)
        .select('role');

      // RLS silently filters (no rows matched/returned) rather than erroring
      // — either outcome is fine, as long as the role did not actually change.
      if (!error) {
        expect(data ?? []).toHaveLength(0);
      }

      const client = await createUserApiClient(getStaffAccount());
      const { data: after } = await client
        .from('org_members')
        .select('role')
        .eq('user_id', scenario.membership.userId)
        .single();
      expect(after?.role).toBe('employee');
    });

    test('5b. direct API: employee cannot insert an org_members row directly (Auth Reset architecture)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      // org_members has no INSERT policy at all — every real membership row
      // is created exclusively by SECURITY DEFINER functions
      // (accept_org_invite(), handle_new_user()'s first-owner bootstrap),
      // never by a direct client insert, regardless of role.
      const { error } = await employeeApi.from('org_members').insert({
        org_id: scenario.membership.orgId,
        user_id: scenario.membership.userId,
        role: 'admin',
        status: 'active',
      });

      expect(error, 'expected the direct insert to be refused by RLS').not.toBeNull();
    });

    test('6. direct API: employee cannot rename or delete the organization', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { data: updateData, error: updateError } = await employeeApi
        .from('organizations')
        .update({ name: 'Blocked Rename Attempt' })
        .eq('id', scenario.membership.orgId)
        .select('id');
      if (!updateError) {
        expect(updateData ?? []).toHaveLength(0);
      }

      const { data: deleteData, error: deleteError } = await employeeApi
        .from('organizations')
        .delete()
        .eq('id', scenario.membership.orgId)
        .select('id');
      if (!deleteError) {
        expect(deleteData ?? []).toHaveLength(0);
      }
    });

    test.skip('no UI or server action exists yet for ownership transfer or org deletion', async () => {
      // NOT IMPLEMENTED anywhere in the app (verified: no action in
      // app/(app)/team/actions.ts or app/(app)/settings beyond website
      // content management manages org.owner_id or deletes an organizations
      // row). Nothing to test here beyond test 6 above proving the DB layer
      // already refuses both operations regardless of who's asking. Add a
      // real test once such a feature and its own authorization ships.
    });
  });

  test.describe.serial('financial capability restrictions (Phase 4)', () => {
    let scenario: StaffScenario;
    let invoice: InvoiceFixture;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({
        ownerPage,
        employeePage,
        customer: true,
        property: true,
      });

      // Owner creates the job/invoice fixture the employee will attempt
      // restricted actions against below — invoice creation itself stays
      // open to employees (see test 1), so a separate, already-created
      // invoice isolates the payment/void tests from that positive case.
      // Recording a payment (and the invoice's own detail page) only ever
      // renders for a non-draft invoice (invoices/[invoiceId]/page.tsx:
      // `{!isDraft && invoice.status !== 'void' ? <RecordPaymentForm .../> : null}`)
      // — so this must be sent, not just have a line item, before tests 2-5
      // run against it.
      const job = await scenario.ownerSession.job(scenario.customer!, scenario.property);
      invoice = await scenario.ownerSession.invoice(job);
      await addInvoiceLineItem(scenario.ownerSession.page, invoice);
      await scenario.ownerSession.page.goto(invoice.url);
      await scenario.ownerSession.page.getByRole('button', { name: /send invoice/i }).click();
      await expect(
        scenario.ownerSession.page.getByRole('button', { name: /send invoice/i })
      ).toHaveCount(0, { timeout: 10_000 });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. UI + DB: employee CAN send an invoice (canSendInvoices stays open to employees)', async () => {
      const { page } = scenario.employeeSession;
      // session.job()/.invoice() cache per-session (create once, reuse) — use
      // the underlying fixture functions directly for a genuinely separate
      // invoice from the one tests 2-5 attempt payment/void on below.
      const job = await createTestJob(scenario.ownerSession.page, scenario.customer!, scenario.property);
      const sendableInvoice = await createTestInvoice(scenario.ownerSession.page, job);
      await addInvoiceLineItem(scenario.ownerSession.page, sendableInvoice);

      await page.goto(sendableInvoice.url);
      await page.getByRole('button', { name: /send invoice/i }).click();
      // The button unmounts once status !== 'draft' (see send-invoice-button.tsx).
      await expect(page.getByRole('button', { name: /send invoice/i })).toHaveCount(0, {
        timeout: 10_000,
      });

      const api = await createUserApiClient(getStaffAccount());
      const { data } = await api
        .from('invoices')
        .select('status')
        .eq('id', sendableInvoice.id)
        .single();
      expect(data?.status).toBe('sent');
    });

    test('2. UI: employee attempting to record a payment is refused with a capability error', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(invoice.url);
      // "Back to job" is unique to the invoice detail page (customer detail
      // pages render "Back to customers" instead) — a concrete, unambiguous
      // signal that the correct page actually rendered.
      await expect(page.getByRole('link', { name: 'Back to job' })).toBeVisible({
        timeout: 15_000,
      });
      await recordPaymentForm.methodSelect(page).selectOption('cash');
      await recordPaymentForm.submitButton(page).click();
      await expect(
        page.getByRole('main').getByText(/does not have permission to record payments/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test('3. direct API: employee cannot insert a payment row (bypassing the UI)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { error } = await employeeApi.from('payments').insert({
        org_id: scenario.membership.orgId,
        invoice_id: invoice.id,
        amount: 100,
        method: 'cash',
      });

      expect(error, 'expected the direct insert to be refused by RLS').not.toBeNull();
    });

    test('4. UI: employee attempting to void the invoice is refused with a capability error', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(invoice.url);
      await page.getByRole('button', { name: 'Void invoice' }).click();
      await page.getByRole('button', { name: 'Confirm void' }).click();
      await expect(
        page.getByRole('main').getByText(/does not have permission to void invoices/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test('5. direct API: employee cannot update the invoice status to void (bypassing the UI)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { data, error } = await employeeApi
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', invoice.id)
        .select('status');

      if (!error) {
        expect(data ?? []).toHaveLength(0);
      }

      const client = await createUserApiClient(getStaffAccount());
      const { data: after } = await client
        .from('invoices')
        .select('status')
        .eq('id', invoice.id)
        .single();
      expect(after?.status).not.toBe('void');
    });

    test('6. UI + DB: owner CAN record a payment and void an invoice (positive control)', async () => {
      const { page } = scenario.ownerSession;

      await page.goto(invoice.url);
      await recordPaymentForm.methodSelect(page).selectOption('cash');
      await recordPaymentForm.submitButton(page).click();
      await expect(page.getByText(/no remaining balance/i)).toBeVisible({ timeout: 10_000 });

      const job2 = await createTestJob(scenario.ownerSession.page, scenario.customer!, scenario.property);
      const voidableInvoice = await createTestInvoice(scenario.ownerSession.page, job2);
      await addInvoiceLineItem(scenario.ownerSession.page, voidableInvoice);
      // Void invoice button only renders for a non-draft invoice (same
      // isDraft gating as RecordPaymentForm — see beforeAll's comment).
      await page.goto(voidableInvoice.url);
      await page.getByRole('button', { name: /send invoice/i }).click();
      await expect(page.getByRole('button', { name: /send invoice/i })).toHaveCount(0, {
        timeout: 10_000,
      });
      await page.getByRole('button', { name: 'Void invoice' }).click();
      await page.getByRole('button', { name: 'Confirm void' }).click();
      await expect(page.getByText(/does not have permission/i)).toHaveCount(0);

      const api = await createUserApiClient(getAdminAccount());
      const { data } = await api
        .from('invoices')
        .select('status')
        .eq('id', voidableInvoice.id)
        .single();
      expect(data?.status).toBe('void');
    });
  });
});
