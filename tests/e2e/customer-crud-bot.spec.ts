/**
 * customer-crud-bot: real create/search/detail-view coverage for customers,
 * plus tightly-guarded service-role cleanup so repeated runs don't pile up
 * E2E_TEST_-prefixed junk in dev data.
 *
 * Scope for this pass:
 *  - Create: real, via the actual /customers/new form.
 *  - Search: real, via the customers list's `?q=` URL param (see
 *    apps/web/app/(app)/customers/_components/customer-search-input.tsx and
 *    packages/db/queries/customers.ts — search matches display_name only,
 *    not email).
 *  - Detail view: real, via /customers/[customerId].
 *  - Edit: TODO — Premier CRM has no edit UI for customers today. Verified:
 *    the detail page (apps/web/app/(app)/customers/[customerId]/page.tsx) is
 *    read-only (phone/email/notes rendered via read-only <DetailRow>s, no
 *    form anywhere on the page), and there is no updateCustomer function
 *    anywhere in packages/db or apps/web. Inventing an edit flow here would
 *    be a product decision this test suite shouldn't make silently — this
 *    stays a documented placeholder until a real edit UI ships.
 *  - Delete/archive: also doesn't exist in the UI (same search came up
 *    empty). That's why cleanup below uses service-role Supabase access
 *    instead of a UI-driven delete — see tests/e2e/utils/cleanup.ts.
 *
 * These tests run in `describe.serial` deliberately: search/detail/cleanup
 * all depend on the customer the create step made. This is the one bot in
 * the suite where step order is inherent to the feature, not incidental —
 * unlike the rest of the suite's independent, any-order tests.
 */

import { test, expect } from '@playwright/test';
import {
  customers,
  customerDetail,
  isCustomerDetailUrl,
  isRedirectedToLogin,
  newCustomerForm,
  routes,
} from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';
import { buildCustomerCrudTestFixture, type CustomerCrudTestFixture } from './utils/test-data';
import { cleanupTestCustomerByMarker, hasServiceRoleCleanupCredentials } from './utils/cleanup';

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

  test.describe.serial('full create → search → detail → cleanup flow', () => {
    let fixture: CustomerCrudTestFixture;
    let customerId: string | undefined;

    test.beforeAll(() => {
      fixture = buildCustomerCrudTestFixture();
    });

    test('creates a new test customer end to end', async ({ page }) => {
      test.skip(
        !hasAdminCredentials(),
        'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test'
      );

      await loginAsAdmin(page);
      await page.goto(routes.newCustomer);

      await newCustomerForm.companyNameInput(page).fill(fixture.marker);
      await newCustomerForm.emailInput(page).fill(fixture.email);
      await newCustomerForm.phonePrimaryInput(page).fill(fixture.phone);
      await newCustomerForm.notesInput(page).fill(fixture.notes);
      await newCustomerForm.submitButton(page).click();

      // createCustomerAction redirects to /customers/<id> on success.
      await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 10_000 });
      customerId = new URL(page.url()).pathname.split('/').pop();

      await expect(customerDetail.heading(page, fixture.marker)).toBeVisible();
      await expect(customerDetail.emailRow(page, fixture.email)).toBeVisible();
    });

    test('appears in customer search results', async ({ page }) => {
      test.skip(
        !hasAdminCredentials(),
        'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test'
      );
      test.skip(!customerId, 'Depends on the create test above having run and succeeded.');

      await loginAsAdmin(page);
      await page.goto(`${routes.customers}?q=${encodeURIComponent(fixture.marker)}`);

      await expect(page.getByRole('link', { name: fixture.marker })).toBeVisible();
    });

    test('opens the customer detail page directly by id', async ({ page }) => {
      test.skip(
        !hasAdminCredentials(),
        'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test'
      );
      test.skip(!customerId, 'Depends on the create test above having run and succeeded.');

      await loginAsAdmin(page);
      await page.goto(`${routes.customers}/${customerId}`);

      expect(isCustomerDetailUrl(page, customerId!)).toBe(true);
      await expect(customerDetail.heading(page, fixture.marker)).toBeVisible();
      await expect(customerDetail.emailRow(page, fixture.email)).toBeVisible();
    });

    test.skip('edits an existing test customer', async () => {
      // TODO: Premier CRM has no edit UI for customers yet (verified: the
      // detail page renders phone/email/notes as read-only <DetailRow>s with
      // no form anywhere, and there's no updateCustomer function in
      // packages/db or apps/web). Implement this once an edit flow ships —
      // preferred field to change first: phonePrimary (safest, no dedupe/
      // uniqueness implications), then notes, then companyName/display name.
      // Assert the new value renders on the detail page, then reload and
      // assert it persisted (not just client-side state).
    });

    test('cleans up the created test customer', async () => {
      test.skip(!customerId, 'Depends on the create test above having run and succeeded.');

      const result = await cleanupTestCustomerByMarker({
        marker: fixture.marker,
        email: fixture.email,
      });

      if (hasServiceRoleCleanupCredentials()) {
        expect(result.ranCleanup, result.message).toBe(true);
        expect(result.deletedCustomerIds).toContain(customerId);
      } else {
        // Not configured is an expected, non-failing outcome — see
        // tests/e2e/README.md "Manually removing leftover E2E records".
        expect(result.ranCleanup).toBe(false);
        console.warn(`[customer-crud-bot] ${result.message}`);
      }
    });
  });
});
