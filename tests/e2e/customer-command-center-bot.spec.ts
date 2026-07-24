/**
 * customer-command-center-bot: covers the customer detail page — the
 * "command center" view of a single customer's properties, jobs, quotes,
 * invoices, and communications in one place.
 *
 * Scope for this pass: scaffolding only. This bot needs a real (or
 * seeded/known) customer id to navigate to `/customers/[customerId]`, which
 * this pass does not create — that's customer-crud-bot's job once it's fully
 * implemented (see README). Once a create-customer flow exists, this bot
 * should navigate to the customer it created rather than hardcoding an id.
 */

import { test, expect } from '@playwright/test';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';
import { customers, routes } from './utils/selectors';

test.describe('customer command center bot', () => {
  test('customer detail route exists off the customers list', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');

    await loginAsAdmin(page);
    await page.goto(routes.customers);
    await expect(customers.heading(page)).toBeVisible();

    // Scaffold-level check only: confirm at least the list renders so a
    // future test can click into the first real customer row. We don't klick
    // through here yet because with zero seeded customers this would be a
    // false failure rather than a real one.
  });

  test.skip('customer detail page shows properties, jobs, quotes, and invoices', async () => {
    // TODO: implement once a known/seeded test customer id is available.
    // 1. loginAsAdmin(page)
    // 2. navigate to /customers/[known test customer id]
    // 3. assert sections for properties / jobs / quotes / invoices render
  });

  test.skip('logging a new job from the customer detail page', async () => {
    // TODO: implement alongside the above.
  });
});
