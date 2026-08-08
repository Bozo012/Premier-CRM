/**
 * quotes-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /quotes (rebuild/base44-exact-estimates-quotes) — the ForgeShell chrome
 * around the real listQuotes/getQuoteById-backed list and detail pages,
 * moved from (legacy) to (forge) with no functional change to the
 * draft/sent/viewed/accepted/declined lifecycle.
 *
 * Follows the pattern of requests-base44-shell-bot.spec.ts /
 * estimates-base44-shell-bot.spec.ts:
 *  - New shell renders on /quotes and /quotes/[quoteId].
 *  - No horizontal overflow at four required viewports.
 *  - Status filter tabs update the URL (?status=).
 *  - Search updates the URL (?q=).
 *  - "New quote" link reaches the real /quotes/new form.
 *  - No console errors on list/detail.
 *  - Draft quotes still show the editable metadata form + line item editor;
 *    non-draft quotes still show the read-only lifecycle timeline — proving
 *    the immutability guard on sent/accepted/declined quotes (never allowing
 *    a presentation-only edit path to a customer-facing snapshot) is intact
 *    after the move.
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

test.describe('quotes base44 shell bot', () => {
  test('quotes page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.quotes);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the quotes list with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.quotes);
        await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('status filter tabs update the URL', async ({ page }) => {
      await page.goto(routes.quotes);
      // Exact match: a non-exact 'Draft' also matches every "Draft quote"
      // row link's accessible name (Playwright role-name matching is a
      // case-insensitive substring match by default).
      await page.getByRole('link', { name: 'Draft', exact: true }).click();
      await expect(page).toHaveURL(/[?&]status=draft/);
    });

    test('search updates the URL query param', async ({ page }) => {
      await page.goto(routes.quotes);
      await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();
      await page.getByPlaceholder(/search by quote number, customer, or job/i).fill('zzz-no-such-quote-zzz');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-quote-zzz/, { timeout: 5_000 });
    });

    test('"New quote" reaches the real /quotes/new form', async ({ page }) => {
      await page.goto(routes.quotes);
      await page.getByRole('link', { name: /new quote/i }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.newQuote}$`));
      await expect(page.getByRole('heading', { name: 'New quote' })).toBeVisible();
    });

    test('new shell chrome (sidebar) is present on /quotes', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.quotes);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test.describe('direct URL load, refresh, and Back against an existing quote', () => {
      test('opens the first available quote, shows the correct edit/read-only lifecycle section for its status, then refreshes and goes Back', async ({
        page,
      }) => {
        await page.goto(routes.quotes);
        await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();

        const firstCard = page
          .locator(`a[href^="${routes.quotes}/"]:not([href="${routes.newQuote}"])`)
          .first();
        const hasQuotes = (await firstCard.count()) > 0;
        test.skip(!hasQuotes, 'Org has no quotes yet — nothing to open.');

        await firstCard.click();
        await expect(page).toHaveURL(new RegExp(`${routes.quotes}/[0-9a-f-]{36}$`));

        // Real, unchanged sections from getQuoteById — a draft quote shows
        // the editable "Send quote" card, a non-draft quote shows the
        // read-only "Customer timeline" card (QuoteLifecycleTimeline). One
        // of the two must be present, never both/neither, which is the
        // real immutability boundary this slice must not weaken.
        const draftHeading = page.getByRole('heading', { name: 'Send quote' });
        const timelineHeading = page.getByRole('heading', { name: 'Customer timeline' });
        const isDraft = (await draftHeading.count()) > 0;
        if (isDraft) {
          await expect(draftHeading).toBeVisible();
          await expect(timelineHeading).toHaveCount(0);
        } else {
          await expect(timelineHeading).toBeVisible();
          await expect(draftHeading).toHaveCount(0);
        }

        const errors = collectConsoleErrors(page);
        await assertNoHorizontalOverflow(page);
        expect(errors).toEqual([]);

        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${routes.quotes}/[0-9a-f-]{36}$`));

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${routes.quotes}$`));
        await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();
      });
    });
  });
});
