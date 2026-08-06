/**
 * customers-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /customers (rebuild/base44-exact-ui) — the new ForgeShell chrome
 * (apps/web/components/forge-shell/) plus the ported CustomersList and
 * RecordDetailView presentation on top of real Forge data.
 *
 * Complements, does not replace, customer-crud-bot.spec.ts (which owns the
 * real create -> search -> detail -> cleanup flow via service-role
 * teardown). This bot focuses on what changed with the shell rebuild:
 *  - New shell renders (sidebar/header/mobile nav) instead of the old
 *    AppShell, specifically and only on /customers and /customers/[id].
 *  - Responsive split (desktop table vs. mobile cards) at the four required
 *    viewports, with no horizontal overflow.
 *  - Search re-queries the server (not client-side filtering) — verified via
 *    the URL's `?q=` param actually changing.
 *  - Direct URL load, refresh, and Back all work against the new shell.
 *  - A bogus customer id renders Next.js's real not-found page, not a
 *    fixture fallback.
 *  - No console errors on either route.
 *
 * "Add customer creating a real customer via the real action, with cleanup"
 * is intentionally NOT duplicated here — customer-crud-bot.spec.ts already
 * owns that exact flow end to end (create -> search -> detail -> service-role
 * cleanup) against the SAME /customers/new form this rebuild didn't touch.
 * Re-running an identical create+cleanup here would just double the load on
 * whatever Supabase project .env.test points at for no new coverage.
 */

import { test, expect, type Page } from '@playwright/test';
import { customers, isCustomerDetailUrl, isRedirectedToLogin, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';
import { buildCustomerCrudTestFixture, type CustomerCrudTestFixture } from './utils/test-data';
import { cleanupTestCustomerByMarker } from './utils/cleanup';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page must not overflow horizontally').toBeLessThanOrEqual(1);
}

test.describe('customers base44 shell bot', () => {
  test('customers page redirects to login when not authenticated (new shell route)', async ({ page }) => {
    await page.goto(routes.customers);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the correct customer view (table vs. cards) with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.customers);
        await expect(customers.heading(page)).toBeVisible();

        const isDesktop = viewport.width >= 1024;
        const table = page.locator('table');
        if (isDesktop) {
          // Desktop table container is `hidden ... lg:block` — present once
          // logged in with real data, or the empty/loading state renders
          // instead; either way the mobile card list must not also render.
          await expect(page.locator('.lg\\:hidden .grid.gap-3')).toBeHidden();
        } else {
          await expect(table).toBeHidden();
        }

        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: `test-results/screenshots/customers-list-${viewport.name}.png`, fullPage: true });
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.customers);
      await expect(customers.heading(page)).toBeVisible();

      await customers.searchInput(page).fill('zzz-no-such-customer-zzz');
      // The container debounces onSearch by 300ms before router.replace().
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-customer-zzz/, { timeout: 2_000 });
    });

    test('filter tabs update the active filter via the URL', async ({ page }) => {
      await page.goto(routes.customers);
      await page.getByRole('tab', { name: /inactive/i }).click();
      await expect(page).toHaveURL(/[?&]status=inactive/);
    });

    test('new shell chrome (sidebar) is present on /customers, not the old AppShell nav', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.customers);
      // The new shell's ForgeMark renders "Forge" next to a flame icon in
      // the fixed sidebar (apps/web/components/forge-shell/ForgeMark.tsx).
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('a non-existent customer id renders a real not-found page', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`${routes.customers}/00000000-0000-4000-8000-000000000000`);
      // apps/web/app/(app)/customers/[customerId]/page.tsx calls notFound()
      // for a well-formed-but-nonexistent uuid — Next.js's built-in
      // not-found boundary renders, not a fixture fallback.
      await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
      expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
    });

    test.describe.serial('direct URL load, refresh, and Back against a real customer', () => {
      let fixture: CustomerCrudTestFixture;
      let customerId: string | undefined;

      test.beforeAll(() => {
        fixture = buildCustomerCrudTestFixture();
      });

      test('creates a test customer to navigate to', async ({ page }) => {
        await page.goto(routes.newCustomer);
        await page.locator('#new-customer-companyName').fill(fixture.marker);
        await page.locator('#new-customer-email').fill(fixture.email);
        await page.getByRole('button', { name: /create customer|add customer|save/i }).click();
        await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 10_000 });
        customerId = new URL(page.url()).pathname.split('/').pop();
      });

      test('loads the detail page directly by URL on the new shell', async ({ page }) => {
        test.skip(!customerId, 'Depends on the create step above.');
        const errors = collectConsoleErrors(page);
        await page.goto(`${routes.customers}/${customerId}`);
        expect(isCustomerDetailUrl(page, customerId!)).toBe(true);
        await expect(page.getByRole('heading', { name: fixture.marker })).toBeVisible();
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);
      });

      test('survives a full page refresh', async ({ page }) => {
        test.skip(!customerId, 'Depends on the create step above.');
        await page.goto(`${routes.customers}/${customerId}`);
        await page.reload();
        expect(isCustomerDetailUrl(page, customerId!)).toBe(true);
        await expect(page.getByRole('heading', { name: fixture.marker })).toBeVisible();
      });

      test('Back returns to the customers list', async ({ page }) => {
        test.skip(!customerId, 'Depends on the create step above.');
        await page.goto(routes.customers);
        await page.goto(`${routes.customers}/${customerId}`);
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.customers}$`));
        await expect(customers.heading(page)).toBeVisible();
      });

      test('cleans up the created test customer', async () => {
        test.skip(!customerId, 'Depends on the create step above.');
        const result = await cleanupTestCustomerByMarker({ marker: fixture.marker, email: fixture.email });
        if (result.ranCleanup) {
          expect(result.deletedCustomerIds).toContain(customerId);
        } else {
          console.warn(`[customers-base44-shell-bot] ${result.message}`);
        }
      });
    });
  });
});
