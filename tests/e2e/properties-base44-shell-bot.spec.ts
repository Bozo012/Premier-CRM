/**
 * properties-base44-shell-bot: coverage for the Base44-exact shell rebuild
 * of /properties (rebuild/base44-exact-properties-team) — the ForgeShell
 * chrome plus the ported PropertiesList (desktop table + mobile cards) and
 * RecordDetailView presentation on top of real listProperties/
 * getPropertyMemory data.
 *
 * Follows the exact pattern of customers-base44-shell-bot.spec.ts:
 *  - New shell renders on /properties and /properties/[id].
 *  - Responsive split (desktop table vs. mobile cards) at the four required
 *    viewports, no horizontal overflow.
 *  - Search re-queries the server (URL `?q=` actually changes).
 *  - Status/type filter tabs update the URL.
 *  - A bogus property id renders Next.js's real not-found page.
 *  - No console errors on either route.
 *
 * No dedicated properties-crud-bot exists yet to reuse for a real
 * create -> detail -> cleanup flow (unlike Customers). This bot therefore
 * does NOT create a property directly — it navigates to whatever the admin
 * account's org already has (properties are created today only via
 * Customer Detail's "Add property" flow; see the gap report). If the org
 * has zero properties, the direct-URL/refresh/Back block skips itself
 * rather than fabricating a fixture.
 */

import { test, expect, type Page } from '@playwright/test';
import { isRedirectedToLogin, properties, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

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

test.describe('properties base44 shell bot', () => {
  test('properties page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.properties);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the correct property view (table vs. cards) with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.properties);
        await expect(properties.heading(page)).toBeVisible();

        const isDesktop = viewport.width >= 1024;
        const table = page.locator('table');
        if (isDesktop) {
          await expect(page.locator('.lg\\:hidden .space-y-3')).toBeHidden();
        } else {
          await expect(table).toBeHidden();
        }

        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: `test-results/screenshots/properties-list-${viewport.name}.png`, fullPage: true });
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.properties);
      await expect(properties.heading(page)).toBeVisible();

      await page.getByPlaceholder(/search by property, address, or customer/i).fill('zzz-no-such-property-zzz');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-property-zzz/, { timeout: 2_000 });
    });

    test('status filter chips update the URL', async ({ page }) => {
      await page.goto(routes.properties);
      await page.getByRole('button', { name: /^Inactive/ }).click();
      await expect(page).toHaveURL(/[?&]status=inactive/);
    });

    test('type filter chips update the URL', async ({ page }) => {
      await page.goto(routes.properties);
      await page.getByRole('button', { name: /^Commercial/ }).click();
      await expect(page).toHaveURL(/[?&]type=commercial/);
    });

    test('new shell chrome (sidebar) is present on /properties', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.properties);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('a non-existent property id renders a real not-found page', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`${routes.properties}/00000000-0000-4000-8000-000000000000`);
      await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
      expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
    });

    test.describe('direct URL load, refresh, and Back against an existing property', () => {
      test('opens the first available property from the list, then refreshes and goes Back', async ({ page }) => {
        await page.goto(routes.properties);
        await expect(properties.heading(page)).toBeVisible();

        const firstRow = page.locator('table tbody tr').first();
        const hasRows = (await firstRow.count()) > 0;
        test.skip(!hasRows, 'Org has no properties yet — nothing to open (see gap report: no list-level create route).');

        await firstRow.click();
        await expect(page).toHaveURL(new RegExp(`${routes.properties}/[0-9a-f-]{36}$`));
        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.properties}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.properties}$`));
        await expect(properties.heading(page)).toBeVisible();
      });
    });
  });
});
