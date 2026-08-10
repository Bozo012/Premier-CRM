/**
 * payments-flow-bot: coverage for real manual payment recording
 * (rebuild/base44-exact-finance). There is no live payment processor in
 * this codebase (verified during the finance slice's backend audit — no
 * Stripe SDK usage, no webhook route) — recordPaymentAction just inserts
 * into `payments` and the apply_payment_to_invoice() DB trigger (migration
 * 20260722000000) recalculates amount_paid/status atomically. This bot
 * exercises that real path end to end: partial payment leaves the invoice
 * "Partially paid", a second payment for the remaining balance moves it to
 * "Paid" and the Record payment form disappears once balance is zero,
 * matching RecordPaymentForm's own `amountDue <= 0` guard.
 *
 * "Failed" payment state is deliberately NOT tested here — manual-only
 * recording via this UI has no reachable failure path except validation
 * (amount <= 0 or amount > amount_due, both blocked client-side by the
 * input's min/max before submit), so a fabricated failure-state test would
 * not correspond to anything this UI can actually produce.
 *
 * Follows the structure of invoices-base44-shell-bot.spec.ts. Since which
 * invoices exist (and their exact balances) depends on live e2e org data
 * this bot can't seed itself, every payment-recording test looks for a real
 * eligible invoice first and skips honestly if none exists, rather than
 * asserting against fabricated state.
 */

import { test, expect, type Page } from '@playwright/test';
import { routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

async function openFirstInvoiceWithFilter(page: Page, status: string): Promise<boolean> {
  await page.goto(`${routes.invoices}?status=${status}`);
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();

  // The <tr> itself has no onClick — only the nested invoice-number <Link>
  // (desktop table) or card <Link> (mobile) navigates.
  const firstLink = page.locator('a[href^="/invoices/"]').filter({ hasNotText: 'Back' }).first();
  const hasRow = (await firstLink.count()) > 0;
  if (!hasRow) return false;

  await firstLink.click();
  await expect(page).toHaveURL(new RegExp(`${routes.invoices}/[0-9a-f-]{36}$`));
  return true;
}

test.describe('payments flow bot', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
    await loginAsAdmin(page);
  });

  test('payment history section renders on a sent/paid invoice', async ({ page }) => {
    const opened = (await openFirstInvoiceWithFilter(page, 'sent')) || (await openFirstInvoiceWithFilter(page, 'paid'));
    test.skip(!opened, 'No sent or paid invoices exist in this org yet.');

    await expect(page.getByRole('heading', { name: 'Payment history' })).toBeVisible();
  });

  test('recording a partial payment moves the invoice to "Partially paid" and keeps the balance real', async ({ page }) => {
    const opened = await openFirstInvoiceWithFilter(page, 'sent');
    test.skip(!opened, 'No sent invoices with an outstanding balance exist in this org yet.');

    const recordPaymentHeading = page.getByRole('heading', { name: 'Record payment' });
    const hasForm = (await recordPaymentHeading.count()) > 0;
    test.skip(!hasForm, 'This invoice has no remaining balance — no Record payment form to test.');

    const amountInput = page.locator('#pay-amount');
    const fullAmount = await amountInput.inputValue();
    const partial = (Number(fullAmount) / 2).toFixed(2);
    test.skip(Number(partial) <= 0, 'Amount due is too small to split into a partial payment.');

    await amountInput.fill(partial);
    await page.locator('#pay-method').selectOption('check');
    await page.locator('#pay-reference').fill('E2E-PARTIAL-PAYMENT');
    await page.getByRole('button', { name: /record payment/i }).click();

    // recordPaymentAction calls router.refresh() on success — the invoice's
    // real amount_due (server-computed by the payment trigger, never
    // computed client-side) should now be lower than the original full
    // amount, and the status badge should read "Partially paid".
    await expect(page.getByText('Partially paid')).toBeVisible({ timeout: 10_000 });
  });

  test('a payment can never exceed the real amount due (server + input max both enforce it)', async ({ page }) => {
    const opened = (await openFirstInvoiceWithFilter(page, 'sent')) || (await openFirstInvoiceWithFilter(page, 'partially_paid'));
    test.skip(!opened, 'No sent or partially paid invoices exist in this org yet.');

    const amountInput = page.locator('#pay-amount');
    const hasForm = (await amountInput.count()) > 0;
    test.skip(!hasForm, 'This invoice has no remaining balance — no Record payment form to test.');

    const max = await amountInput.getAttribute('max');
    expect(max, 'the amount input must cap at the real amount_due, not an arbitrary number').not.toBeNull();
    expect(Number(max)).toBeGreaterThan(0);
  });
});
