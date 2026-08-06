/**
 * site-visits-base44-shell-bot: coverage for the Base44-exact shell rebuild
 * of /site-visits (rebuild/base44-exact-requests-visits) — the ForgeShell
 * chrome around the real listSiteVisits/getSiteVisitById-backed list and
 * detail pages, plus the ported 5-step inspection wizard shell.
 *
 * Follows the pattern of customers-base44-shell-bot.spec.ts /
 * properties-base44-shell-bot.spec.ts / team-base44-shell-bot.spec.ts.
 *
 * What this bot deliberately does NOT re-cover:
 *  - tests/e2e/request-site-visit-workflow-bot.spec.ts already proves the
 *    full RPC-level lifecycle (schedule → start → save → complete,
 *    including the save_site_visit_inspection authenticated-vs-service-role
 *    boundary) and capability parity — not duplicated here.
 *  - tests/e2e/site-visits-inspection-redesign-bot.spec.ts already proves
 *    the 5-step wizard's step navigation, autosave, completion, and
 *    persisted-summary-survives-refresh behavior against a real fixture
 *    visit — not duplicated here.
 * This bot only proves: the ported shell/list/detail chrome renders
 * correctly, status filters work, and direct-URL/refresh/Back behave, using
 * whatever site visits already exist in the admin account's org (it does
 * not create fixtures of its own).
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

test.describe('site visits base44 shell bot', () => {
  test('site visits page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.siteVisits);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the site visits list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.siteVisits);
        await expect(page.getByRole('heading', { name: 'Site Visits' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.siteVisits);
      await expect(page.getByRole('heading', { name: 'Site Visits' })).toBeVisible();

      await page.getByPlaceholder(/search by visit, customer, address, or service/i).fill('zzz-no-such-visit-zzz');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-visit-zzz/, { timeout: 5_000 });
    });

    test('status filter tabs update the URL', async ({ page }) => {
      await page.goto(routes.siteVisits);
      await page.getByRole('link', { name: /^Completed/ }).click();
      await expect(page).toHaveURL(/[?&]status=completed/);
    });

    test('new shell chrome (sidebar) is present on /site-visits', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.siteVisits);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test.describe('direct URL load, refresh, and Back against an existing site visit', () => {
      test('opens the first available visit from the list, then refreshes and goes Back', async ({ page }) => {
        await page.goto(routes.siteVisits);
        await expect(page.getByRole('heading', { name: 'Site Visits' })).toBeVisible();

        const firstCard = page.locator(`a[href^="${routes.siteVisits}/"]`).first();
        const hasVisits = (await firstCard.count()) > 0;
        test.skip(!hasVisits, 'Org has no site visits yet — nothing to open (site visits are created from request triage).');

        await firstCard.click();
        await expect(page).toHaveURL(new RegExp(`${routes.siteVisits}/[0-9a-f-]{36}$`));

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.siteVisits}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.siteVisits}$`));
        await expect(page.getByRole('heading', { name: 'Site Visits' })).toBeVisible();
      });
    });
  });
});
