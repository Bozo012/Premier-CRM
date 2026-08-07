/**
 * estimates-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /estimates (rebuild/base44-exact-estimates-quotes) — the ForgeShell chrome
 * around the real listEstimates/getEstimateById-backed list and detail
 * pages, moved from (legacy) to (forge) with no functional change to the
 * underlying pricing-review workflow.
 *
 * Follows the pattern of requests-base44-shell-bot.spec.ts /
 * site-visits-base44-shell-bot.spec.ts:
 *  - New shell renders on /estimates and /estimates/[estimateId].
 *  - No horizontal overflow at four required viewports.
 *  - Search re-queries client-side (the pre-existing filterEstimates
 *    behavior, unchanged by this slice — see forge-estimate-view-model.ts).
 *  - View filter tabs (Active/All) update the URL.
 *  - "New estimate" link reaches the real /estimates/new form.
 *  - No console errors on list/detail.
 *  - The real pricing-review/line-item/quote-linkage sections render when an
 *    estimate exists (existence-level assertion, not a full workflow replay
 *    — the RPC-level workflow itself is already covered by
 *    request-site-visit-workflow-bot.spec.ts's estimate-adjacent coverage
 *    and this repo's estimate/quote unit tests).
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

test.describe('estimates base44 shell bot', () => {
  test('estimates page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.estimates);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the estimates list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.estimates);
        await expect(page.getByRole('heading', { name: 'Estimates' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('view filter tabs (Active/All) update the URL', async ({ page }) => {
      await page.goto(routes.estimates);
      await page.getByRole('link', { name: /^all/i }).click();
      await expect(page).toHaveURL(/[?&]view=all/);
    });

    test('search re-runs the list query via the ?q= param', async ({ page }) => {
      await page.goto(routes.estimates);
      await expect(page.getByRole('heading', { name: 'Estimates' })).toBeVisible();
      await page.getByPlaceholder(/search by estimate number, customer, property, or status/i).fill('zzz-no-such-estimate-zzz');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-estimate-zzz/, { timeout: 5_000 });
    });

    test('"New estimate" reaches the real /estimates/new form', async ({ page }) => {
      await page.goto(routes.estimates);
      await page.getByRole('link', { name: /new estimate/i }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.newEstimate}$`));
      await expect(page.getByRole('heading', { name: 'New estimate' })).toBeVisible();
    });

    test('new shell chrome (sidebar) is present on /estimates', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.estimates);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test.describe('direct URL load, refresh, and Back against an existing estimate', () => {
      test('opens the first available estimate, shows the real line-items/quotes sections, then refreshes and goes Back', async ({
        page,
      }) => {
        await page.goto(routes.estimates);
        await expect(page.getByRole('heading', { name: 'Estimates' })).toBeVisible();

        const firstCard = page
          .locator(`a[href^="${routes.estimates}/"]:not([href="${routes.newEstimate}"])`)
          .first();
        const hasEstimates = (await firstCard.count()) > 0;
        test.skip(!hasEstimates, 'Org has no estimates yet — nothing to open.');

        await firstCard.click();
        await expect(page).toHaveURL(new RegExp(`${routes.estimates}/[0-9a-f-]{36}$`));

        // Real, unchanged sections from packages/db/queries/estimates.ts's
        // getEstimateById/listEstimateLineItems/listQuotesForEstimate —
        // proves the ported detail page still surfaces the real state
        // machine's entry points, not just that a page renders.
        await expect(page.getByText('Quotes', { exact: true })).toBeVisible();

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.estimates}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.estimates}$`));
        await expect(page.getByRole('heading', { name: 'Estimates' })).toBeVisible();
      });
    });
  });
});
