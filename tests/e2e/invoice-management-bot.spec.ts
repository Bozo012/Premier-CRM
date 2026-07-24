/**
 * invoice-management-bot: verifies the invoices list is protected and, once
 * authenticated, reachable and rendering.
 *
 * Scope for this pass: reachability + auth-gating only. Creating/sending/
 * voiding/recording-payment-on invoices is left as TODOs.
 */

import { test, expect } from '@playwright/test';
import { invoices, isRedirectedToLogin, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

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

  test.skip('creates a new invoice for a test job', async () => {
    // TODO: implement once customer-crud-bot / a jobs fixture can produce a
    // known test job to invoice against.
  });

  test.skip('records a payment against a test invoice', async () => {
    // TODO: implement alongside the above.
  });

  test.skip('voids a test invoice', async () => {
    // TODO: implement alongside the above.
  });

  test.skip('sends a test invoice and confirms status updates', async () => {
    // TODO: this likely needs email/Resend mocking or a sandbox mode — flag
    // for a product decision before implementing.
  });
});
