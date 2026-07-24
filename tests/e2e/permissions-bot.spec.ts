/**
 * permissions-bot: verifies role/account boundaries — most importantly, that
 * customer accounts can never see another customer's data (RLS + portal
 * scoping, per ARCHITECTURE.md's "All buckets have RLS" / multi-tenant
 * posture and the customer portal's magic-link/token scoping).
 *
 * Scope for this pass: route-level auth gating (real, active tests) plus
 * TODO/skipped scaffolds for true cross-account data isolation, which needs
 * TWO real customer portal accounts with distinct data to be meaningful.
 */

import { test, expect } from '@playwright/test';
import { isRedirectedToLogin, routes } from './utils/selectors';
import { hasCustomerCredentials, hasCustomerTwoCredentials } from './utils/auth';

test.describe('permissions bot', () => {
  test('unauthenticated request to an owner/staff route is denied and redirected', async ({
    page,
  }) => {
    await page.goto(routes.settings);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test('unauthenticated request to the team route is denied and redirected', async ({ page }) => {
    await page.goto(routes.team);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.skip('customer account cannot view another customer’s invoices', async () => {
    // TODO: requires TEST_CUSTOMER_EMAIL/PASSWORD and TEST_CUSTOMER_2_EMAIL/PASSWORD
    // plus known distinct data per account. Log in as customer 1, attempt to
    // navigate to a direct URL for customer 2's invoice/quote, assert denial
    // (403/redirect/empty state) — never a leaked record.
    void hasCustomerCredentials;
    void hasCustomerTwoCredentials;
  });

  test.skip('customer account cannot view another customer’s properties', async () => {
    // TODO: same pattern as above, for /properties or portal property views.
  });

  test.skip('customer portal magic-link token is single-use and scoped', async () => {
    // TODO: per ARCHITECTURE.md, magic_link_tokens are single-use with 30-day
    // default expiry, scoped to a specific quote/invoice/job. Verify a token
    // cannot be reused for a different record and expires as configured.
  });

  test.skip('staff account without owner role cannot access org settings', async () => {
    // TODO: needs a seeded non-owner staff account; not yet in scope of the
    // env vars set up in this pass (TEST_ADMIN_* is assumed to be Owner).
  });
});
