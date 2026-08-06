/**
 * requests-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /requests (rebuild/base44-exact-requests-visits) — the ForgeShell chrome
 * around the real listRequests/getRequestById-backed list and detail pages.
 *
 * Follows the pattern of customers-base44-shell-bot.spec.ts /
 * properties-base44-shell-bot.spec.ts / team-base44-shell-bot.spec.ts:
 *  - New shell renders on /requests and /requests/[taskId].
 *  - No horizontal overflow at four required viewports.
 *  - Search re-queries the server (URL `?q=` actually changes).
 *  - Show filter tabs (Open/Reviewed/All) update the URL.
 *  - "New request" link reaches the real /requests/new form.
 *  - No console errors on list/detail.
 *
 * What this bot deliberately does NOT re-cover (see
 * tests/e2e/request-conversion-bot.spec.ts, which already drives the real
 * TriagePanel end-to-end for both remote_estimate and direct_work_order
 * decisions at the RPC level): triage decision correctness, RPC-level
 * authorization, or downstream estimate/job/site-visit creation. This bot
 * only proves the ported shell/list/detail chrome renders correctly and
 * that TriagePanel is present as the sole visible triage trigger (no
 * re-wired legacy create-estimate/create-job buttons).
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

test.describe('requests base44 shell bot', () => {
  test('requests page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.requests);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the requests list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.requests);
        await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.requests);
      await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();

      await page.getByPlaceholder(/search by number, customer, service, or concern/i).fill('zzz-no-such-request-zzz');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-request-zzz/, { timeout: 5_000 });
    });

    test('show filter tabs update the URL', async ({ page }) => {
      await page.goto(routes.requests);
      await page.getByRole('link', { name: 'Reviewed' }).click();
      await expect(page).toHaveURL(/[?&]show=done/);
    });

    test('"New request" reaches the real /requests/new form', async ({ page }) => {
      await page.goto(routes.requests);
      await page.getByRole('link', { name: /new request/i }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.newRequest}$`));
      await expect(page.getByRole('heading', { name: 'Create request' })).toBeVisible();
    });

    test('new shell chrome (sidebar) is present on /requests', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.requests);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test.describe('direct URL load, refresh, and Back against an existing request', () => {
      test('opens the first available request from the list, shows TriagePanel (not the dead legacy buttons), then refreshes and goes Back', async ({
        page,
      }) => {
        await page.goto(routes.requests);
        await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();

        // Excludes /requests/new explicitly — a plain prefix match
        // (`a[href^="/requests/"]`) also matches the "New request" link,
        // which renders before the list and would win `.first()` instead
        // of a real row.
        const firstCard = page
          .locator(`a[href^="${routes.requests}/"]:not([href="${routes.newRequest}"])`)
          .first();
        const hasRequests = (await firstCard.count()) > 0;
        test.skip(!hasRequests, 'Org has no requests yet — nothing to open.');

        await firstCard.click();
        await expect(page).toHaveURL(new RegExp(`${routes.requests}/[0-9a-f-]{36}$`));

        // TriagePanel is the sole triage trigger — the dead legacy
        // create-estimate/create-job buttons must never appear.
        await expect(page.getByText('Triage', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /^create estimate$/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^create job$/i })).toHaveCount(0);

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.requests}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.requests}$`));
        await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
      });
    });
  });
});
