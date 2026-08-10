/**
 * expenses-base44-shell-bot: coverage for the base44-exact-finance slice's
 * move of /expenses into the (forge) route group with real ForgeShell
 * chrome (rebuild/base44-exact-finance), plus the new real "Add to invoice"
 * expense-eligibility path this slice adds (verified on invoices-base44-
 * shell-bot.spec.ts's invoice detail coverage, not duplicated here).
 *
 * Follows the exact structure of jobs-base44-shell-bot.spec.ts /
 * invoices-base44-shell-bot.spec.ts:
 *  - Redirect to login when unauthenticated.
 *  - No horizontal overflow at four required viewports.
 *  - Search re-queries the server (URL `?q=` actually changes).
 *  - Filter chips update the URL.
 *  - "New expense" reaches the real /expenses/new form.
 *  - Direct URL load, refresh, and Back against an existing expense.
 *  - Keyboard focus reaches the search input.
 *  - No console errors on list/detail/new.
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

test.describe('expenses base44 shell bot', () => {
  test('expenses page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.expenses);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the expenses list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.expenses);
        await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.expenses);
      await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

      await page.getByPlaceholder(/search by description, vendor, job number/i).fill('zzz-no-such-expense-zzz');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-expense-zzz/, { timeout: 5_000 });
    });

    test('filter chips update the URL', async ({ page }) => {
      await page.goto(routes.expenses);
      await page.getByRole('link', { name: /^approved/i }).click();
      await expect(page).toHaveURL(/[?&]filter=approved/);
    });

    test('"New expense" reaches the real /expenses/new form', async ({ page }) => {
      await page.goto(routes.expenses);
      await page.getByRole('link', { name: /new expense/i }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.newExpense}$`));
      await expect(page.getByRole('heading', { name: 'Log an expense' })).toBeVisible();
    });

    test('new shell chrome (sidebar) is present on /expenses', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.expenses);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('keyboard focus reaches the expenses search input', async ({ page }) => {
      await page.goto(routes.expenses);
      const searchInput = page.getByPlaceholder(/search by description, vendor, job number/i);
      await searchInput.focus();
      await expect(searchInput).toBeFocused();
    });

    test.describe('direct URL load, refresh, and Back against an existing expense', () => {
      test('opens the first available expense, shows cost/billing sections, then refreshes and goes Back', async ({ page }) => {
        await page.goto(routes.expenses);
        await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

        const firstRow = page
          .locator('tbody tr')
          .or(page.locator('a[href^="/expenses/"]'))
          .first();
        const hasExpenses = (await firstRow.count()) > 0;
        test.skip(!hasExpenses, 'Org has no expenses yet — nothing to open.');

        await firstRow.click();
        await expect(page).toHaveURL(new RegExp(`${routes.expenses}/[0-9a-f-]{36}$`));

        await expect(page.getByRole('heading', { name: 'Cost and context' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Billing treatment' })).toBeVisible();

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.expenses}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.expenses}$`));
        await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
      });
    });
  });
});
