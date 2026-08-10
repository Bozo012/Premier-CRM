/**
 * invoices-base44-shell-bot: coverage for the base44-exact-finance slice's
 * move of /invoices into the (forge) route group with real ForgeShell
 * chrome (rebuild/base44-exact-finance). Follows the exact structure of
 * jobs-base44-shell-bot.spec.ts / calendar-base44-shell-bot.spec.ts:
 *  - Redirect to login when unauthenticated.
 *  - No horizontal overflow at four required viewports.
 *  - Search re-queries the server (URL `?q=` actually changes).
 *  - Status filter links update the URL.
 *  - Direct URL load, refresh, and Back against an existing invoice.
 *  - Keyboard focus reaches the search input.
 *  - No console errors on list/detail.
 *
 * What this bot deliberately does NOT re-cover: line-item mutation RPC
 * authorization (already covered by invoices/actions.test.ts) or the
 * apply_payment_to_invoice() trigger's own guards (DB-level, not UI-level).
 * Manual payment recording itself is covered separately by
 * payments-flow-bot.spec.ts.
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

test.describe('invoices base44 shell bot', () => {
  test('invoices page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.invoices);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the invoices list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.invoices);
        await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param (real server re-query, not client filtering)', async ({ page }) => {
      await page.goto(routes.invoices);
      await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();

      // The invoices search box is a native GET <form action="/invoices">, not
      // a live onChange handler (unlike the Jobs list) — it only re-queries
      // the server on submit, so Enter (or a submit click) is required.
      const searchInput = page.getByPlaceholder(/search by invoice number, customer, or job/i);
      await searchInput.fill('zzz-no-such-invoice-zzz');
      await searchInput.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-invoice-zzz/, { timeout: 5_000 });
    });

    test('status filter links update the URL', async ({ page }) => {
      await page.goto(routes.invoices);
      await page.getByRole('link', { name: /^sent/i }).click();
      await expect(page).toHaveURL(/[?&]status=sent/);
    });

    test('new shell chrome (sidebar) is present on /invoices', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.invoices);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('keyboard focus reaches the invoices search input', async ({ page }) => {
      await page.goto(routes.invoices);
      const searchInput = page.getByPlaceholder(/search by invoice number, customer, or job/i);
      await searchInput.focus();
      await expect(searchInput).toBeFocused();
    });

    test.describe('direct URL load, refresh, and Back against an existing invoice', () => {
      test('opens the first available invoice, shows summary + line items, then refreshes and goes Back', async ({ page }) => {
        await page.goto(routes.invoices);
        await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();

        // The <tr> itself has no onClick — only the nested invoice-number
        // <Link> (desktop table) or the card <Link> (mobile) actually
        // navigates, so the locator must target the link, not the row.
        const firstLink = page.locator('a[href^="/invoices/"]').filter({ hasNotText: 'Back' }).first();
        const hasInvoices = (await firstLink.count()) > 0;
        test.skip(!hasInvoices, 'Org has no invoices yet — nothing to open.');

        await firstLink.click();
        await expect(page).toHaveURL(new RegExp(`${routes.invoices}/[0-9a-f-]{36}$`));

        await expect(page.getByRole('heading', { name: 'Line items' })).toBeVisible();

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.invoices}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.invoices}$`));
        await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
      });
    });
  });
});
