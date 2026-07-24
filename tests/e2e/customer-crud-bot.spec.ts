/**
 * customer-crud-bot: verifies the customers list is protected and, once
 * authenticated, reachable and rendering.
 *
 * Scope for this pass: reachability + auth-gating only. Full create/edit/
 * delete flows are intentionally left as TODOs — see README "next recommended
 * bot to implement fully" for why customer-crud is a good next target.
 */

import { test, expect } from '@playwright/test';
import { customers, isRedirectedToLogin, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

test.describe('customer crud bot', () => {
  test('customers page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.customers);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test('customers page is reachable after login', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');

    await loginAsAdmin(page);
    await page.goto(routes.customers);

    await expect(page).toHaveURL(/\/customers/);
    await expect(customers.heading(page)).toBeVisible();
    await expect(customers.newCustomerLink(page)).toBeVisible();
  });

  test.skip('creates a new test customer end to end', async () => {
    // TODO: fill in once this bot is fully implemented.
    // 1. loginAsAdmin(page)
    // 2. navigate to /customers/new
    // 3. fill form with testCustomerName()/testCustomerEmail() from utils/test-data
    // 4. submit, assert redirect to new customer detail page
    // 5. register cleanup task (utils/cleanup) to remove the record
  });

  test.skip('edits an existing test customer', async () => {
    // TODO: implement alongside the create test above.
  });

  test.skip('search filters the customer list', async () => {
    // TODO: create a uniquely-named test customer, search for it, assert it
    // appears and that other rows are filtered out.
  });
});
