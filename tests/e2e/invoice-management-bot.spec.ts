/**
 * invoice-management-bot: verifies the invoices list is protected and
 * reachable, plus the full create/send/pay/void lifecycle (Phase 9 of the
 * 2026-07-31 workflow reliability audit).
 *
 * Role-based capability gating (employee can send but not record payments
 * or void) is covered by staff-permissions-bot.spec.ts's "financial
 * capability restrictions" block, not duplicated here — this file uses the
 * owner account throughout and focuses on the positive-path lifecycle.
 */

import { test, expect } from '@playwright/test';
import { invoices, isRedirectedToLogin, routes, recordPaymentForm } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';
import { createTestSession } from './context/session';
import { loginAsAdmin as loginSessionAsAdmin } from './context/auth';
import { addInvoiceLineItem } from './context/invoice';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';

test.describe('invoice management bot', () => {
  test('invoices page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.invoices);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test('invoices page is reachable after login', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');

    await loginAsAdmin(page);
    await page.goto(routes.invoices);

    await expect(page).toHaveURL(/\/invoices/);
    await expect(invoices.heading(page)).toBeVisible();
  });

  test('creates a new invoice for a test job', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();

    const client = createGuardedServiceClient();
    const { data } = await client.from('invoices').select('status, total').eq('id', invoice.id).maybeSingle();
    expect(data?.status).toBe('draft');
    expect(data?.total).toBe(0);

    await session.finish();
  });

  test('sends a test invoice and confirms status updates', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();

    // Poll the DB rather than trust the button's disappearance — its
    // accessible name changes during the pending state, which can make a
    // getByRole(... name: /send invoice/i) count hit 0 before the mutation
    // actually lands (same false-positive class of wait bug found and
    // fixed in scheduling-bot.spec.ts).
    const client = createGuardedServiceClient();
    await expect(async () => {
      const { data } = await client.from('invoices').select('status').eq('id', invoice.id).maybeSingle();
      expect(data?.status).toBe('sent');
    }).toPass({ timeout: 10_000 });

    const { data } = await client
      .from('invoices')
      .select('status, share_token')
      .eq('id', invoice.id)
      .maybeSingle();
    expect(data?.status).toBe('sent');
    expect(data?.share_token).toBeTruthy();

    // Public share-token page is now reachable (drafts 404 — confirms the
    // customer link the send action generated is actually live).
    await page.goto(`/i/${data!.share_token}`);
    await expect(page.getByText(/invoice/i).first()).toBeVisible({ timeout: 10_000 });

    await session.finish();
  });

  test('records a payment against a test invoice', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();
    await addInvoiceLineItem(page, invoice);

    // Record-payment-form only renders a real form for a non-draft invoice
    // with amountDue > 0 (see staff-permissions-bot's Phase 4 coverage of
    // the same gating) — send it first.
    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();
    await expect(page.getByRole('button', { name: /^send invoice$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.goto(invoice.url);
    await recordPaymentForm.methodSelect(page).selectOption('card');
    await recordPaymentForm.submitButton(page).click();
    await expect(page.getByText(/no remaining balance/i)).toBeVisible({ timeout: 10_000 });

    const client = createGuardedServiceClient();
    const { data: invoiceRow } = await client
      .from('invoices')
      .select('status, amount_paid, amount_due')
      .eq('id', invoice.id)
      .maybeSingle();
    expect(invoiceRow?.status).toBe('paid');
    expect(invoiceRow?.amount_due).toBe(0);

    const { data: payments } = await client.from('payments').select('id, amount, method').eq('invoice_id', invoice.id);
    expect(payments ?? []).toHaveLength(1);
    expect(payments![0].method).toBe('card');

    await session.finish();
  });

  test('voids a test invoice', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();
    await expect(page.getByRole('button', { name: /^send invoice$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.goto(invoice.url);
    await page.getByRole('button', { name: 'Void invoice' }).click();
    await page.getByRole('button', { name: 'Confirm void' }).click();

    const client = createGuardedServiceClient();
    await expect(async () => {
      const { data } = await client.from('invoices').select('status').eq('id', invoice.id).maybeSingle();
      expect(data?.status).toBe('void');
    }).toPass({ timeout: 10_000 });

    // A voided invoice's record-payment section disappears (invoices/
    // [invoiceId]/page.tsx: `!isDraft && invoice.status !== 'void'` gate) —
    // confirms staff can no longer attempt a payment against it.
    await page.goto(invoice.url);
    await expect(page.locator(`#pay-method`)).toHaveCount(0);

    await session.finish();
  });
});
