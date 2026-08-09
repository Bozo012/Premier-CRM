/**
 * calendar-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /calendar (rebuild/base44-exact-jobs-calendar) — the ForgeShell chrome
 * around the new real listJobsScheduledInRange/getTodaySiteVisits-backed
 * Week/Month calendar.
 *
 * Follows the pattern of requests-base44-shell-bot.spec.ts /
 * jobs-base44-shell-bot.spec.ts:
 *  - New shell renders on /calendar.
 *  - No horizontal overflow at four required viewports.
 *  - Week/Month view toggle updates the URL.
 *  - Prev/Next/Today period navigation updates the URL.
 *  - "Schedule work" reaches the real /jobs/new flow (reused, not
 *    duplicated — see forge-calendar-view-model.ts's doc comment).
 *  - Direct URL load and refresh.
 *  - No console errors.
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

test.describe('calendar base44 shell bot', () => {
  test('calendar page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.calendar);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the calendar with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.calendar);
        await expect(page.getByRole('heading', { name: 'Service Calendar' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('new shell chrome (sidebar) is present on /calendar', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.calendar);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('Week/Month view toggle updates the URL', async ({ page }) => {
      await page.goto(routes.calendar);
      await page.getByRole('button', { name: 'Month' }).click();
      await expect(page).toHaveURL(/[?&]view=month/);

      await page.getByRole('button', { name: 'Week' }).click();
      await expect(page).toHaveURL(/[?&]view=week/);
    });

    test('period navigation (prev/next/today) updates the URL', async ({ page }) => {
      await page.goto(routes.calendar);
      await page.getByRole('button', { name: 'Next period' }).click();
      await expect(page).toHaveURL(/[?&]start=\d{4}-\d{2}-\d{2}/);

      await page.getByRole('button', { name: 'Today' }).click();
      await expect(page).toHaveURL(/[?&]start=\d{4}-\d{2}-\d{2}/);
    });

    test('"Schedule work" reaches the real job creation flow', async ({ page }) => {
      await page.goto(routes.calendar);
      await page.getByRole('button', { name: /schedule work/i }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.newJob}$`));
      await expect(page.getByRole('heading', { name: 'Create job' })).toBeVisible();
    });

    test('direct URL load and refresh preserve the calendar shell', async ({ page }) => {
      await page.goto(`${routes.calendar}?view=month`);
      await expect(page.getByRole('heading', { name: 'Service Calendar' })).toBeVisible();

      const errors = collectConsoleErrors(page);
      await assertNoHorizontalOverflow(page);
      expect(errors).toEqual([]);

      await page.reload();
      await expect(page).toHaveURL(/[?&]view=month/);
      await expect(page.getByRole('heading', { name: 'Service Calendar' })).toBeVisible();
    });
  });
});
