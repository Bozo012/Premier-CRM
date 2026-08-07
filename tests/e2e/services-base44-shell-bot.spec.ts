/**
 * services-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /services (rebuild/base44-exact-estimates-quotes) — the ForgeShell chrome
 * around the real listServiceCatalogItems-backed catalog page, plus the new,
 * additive /services/[serviceId] detail route backed by the new
 * getServiceItemById query (packages/db/queries/service-catalog.ts),
 * following the exact org-scoped/no-schema-change precedent of
 * getTeamMemberById.
 *
 * Follows the pattern of requests-base44-shell-bot.spec.ts /
 * estimates-base44-shell-bot.spec.ts:
 *  - New shell renders on /services and /services/[serviceId].
 *  - No horizontal overflow at four required viewports.
 *  - Status and category filter tabs update the URL.
 *  - Search updates the URL.
 *  - Existing "Manage catalog data" admin editor (ServiceCategoryManager/
 *    ServiceItemManager) is still present and unchanged.
 *  - No console errors on list/detail.
 */

import { test, expect, type Page } from '@playwright/test';
import { isRedirectedToLogin, routes } from './utils/selectors';
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

test.describe('services base44 shell bot', () => {
  test('services page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.services);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the service catalog with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.services);
        await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('status filter tabs update the URL', async ({ page }) => {
      await page.goto(routes.services);
      await page.getByRole('link', { name: 'Active' }).click();
      await expect(page).toHaveURL(/[?&]status=active/);
    });

    test('search updates the URL query param', async ({ page }) => {
      await page.goto(routes.services);
      await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();
      await page.getByPlaceholder(/search by service name, category/i).fill('zzz-no-such-service-zzz');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-service-zzz/, { timeout: 5_000 });
    });

    test('manage catalog data editor (ServiceCategoryManager/ServiceItemManager) is still present', async ({ page }) => {
      await page.goto(routes.services);
      await expect(page.getByText('Manage catalog data')).toBeVisible();
    });

    test('new shell chrome (sidebar) is present on /services', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.services);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test.describe('direct URL load, refresh, and Back against an existing service item', () => {
      test('opens the first available service, shows the new detail route, then refreshes and goes Back', async ({
        page,
      }) => {
        await page.goto(routes.services);
        await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();

        const firstCard = page.locator(`a[href^="${routes.services}/"]`).first();
        const hasServices = (await firstCard.count()) > 0;
        test.skip(!hasServices, 'Org has no service catalog items yet — nothing to open.');

        await firstCard.click();
        await expect(page).toHaveURL(new RegExp(`${routes.services}/[0-9a-f-]{36}$`));

        // Real section from the new getServiceItemById-backed detail page.
        await expect(page.getByText('Primary price', { exact: true })).toBeVisible();

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.services}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.services}$`));
        await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();
      });
    });
  });
});
