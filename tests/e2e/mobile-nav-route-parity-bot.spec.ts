/**
 * mobile-nav-route-parity-bot: regression coverage for the mobile
 * navigation defect discovered during PR #150 live verification.
 *
 * Root cause: /today (and every other (legacy) route — /activity-logs,
 * /site-photos, /settings) rendered app-bottom-nav.tsx, a hardcoded 6-item
 * bottom bar (Today/Jobs/Quotes/Invoices/Customers/Requests) with no "More"
 * control — every other route in the app was unreachable through normal
 * mobile navigation starting from Today, the default post-login landing
 * page. Fixed by swapping the (legacy) AppShell to the same
 * MobileBottomNav + buildMobileNavConfig() (navigation-links.ts) every
 * (forge) route's own shell already used — one shared source, not a third
 * hardcoded list. /messages and /messages/[threadId] previously had no
 * shell at all (not even the old 6-item bar) — also fixed here.
 *
 * This spec covers what navigation-links.test.ts's unit coverage cannot:
 * live rendering (More sheet open/close, active-route state, no horizontal
 * overflow, safe-area, unauthenticated redirect). Route-set correctness
 * itself (every route present exactly once, no fallback icons) is proven
 * by navigation-links.test.ts against the real buildMobileNavConfig()
 * output, not re-asserted here.
 */

import { test, expect, type Page } from '@playwright/test';
import { isRedirectedToLogin, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

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

async function openMoreSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
}

test.describe('mobile nav route parity bot', () => {
  test('Today redirects to login when not authenticated (unrelated behavior unchanged)', async ({ page }) => {
    await page.goto(routes.today);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
      await page.setViewportSize(MOBILE_VIEWPORT);
    });

    test('Today shows a visible More control (the actual reported defect)', async ({ page }) => {
      await page.goto(routes.today);
      await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
    });

    const previouslyUnreachable: Array<{ label: string; path: string; heading: string | RegExp }> = [
      { label: 'Properties', path: routes.properties, heading: 'Properties' },
      { label: 'Site Visits', path: routes.siteVisits, heading: /Site Visits/i },
      { label: 'Estimates', path: routes.estimates, heading: 'Estimates' },
      { label: 'Service Catalog', path: routes.services, heading: /Service/i },
      { label: 'Calendar', path: routes.calendar, heading: /Calendar/i },
      { label: 'Route Planning', path: routes.routePlanning, heading: 'Route Planning' },
      { label: 'Messages', path: '/messages', heading: 'Messages' },
      { label: 'Expenses', path: '/expenses', heading: /Expenses/i },
    ];

    for (const destination of previouslyUnreachable) {
      test(`${destination.label} is reachable from Today via the More sheet`, async ({ page }) => {
        await page.goto(routes.today);
        await openMoreSheet(page);
        await page.getByRole('link', { name: destination.label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(destination.path.replace('/', '\\/')));
        await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible();
      });
    }

    test('Team is reachable via More (view is open to all active org members, matching existing desktop behavior)', async ({ page }) => {
      await page.goto(routes.today);
      await openMoreSheet(page);
      await page.getByRole('link', { name: 'Team', exact: true }).click();
      await expect(page).toHaveURL(/\/team/);
      // Not asserting on canManageTeam-gated controls here — that authorization
      // is enforced server-side (role check on the page + RPC-level checks on
      // the mutating actions themselves) and is unchanged by this nav fix;
      // this test only proves the route is reachable, matching what desktop
      // nav already allowed for every active member regardless of role.
    });

    test('Settings is reachable via More', async ({ page }) => {
      await page.goto(routes.today);
      await openMoreSheet(page);
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await expect(page).toHaveURL(/\/settings/);
    });

    test('active route is highlighted inside the More sheet', async ({ page }) => {
      await page.goto(routes.properties);
      await openMoreSheet(page);
      await expect(page.getByRole('link', { name: 'Properties', exact: true })).toHaveAttribute('aria-current', 'page');
    });

    test('More sheet closes after navigating to a destination', async ({ page }) => {
      await page.goto(routes.today);
      await openMoreSheet(page);
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await expect(page).toHaveURL(/\/settings/);
      await expect(page.getByRole('heading', { name: 'More' })).not.toBeVisible();
    });

    test('no horizontal overflow on Today at 390x844 with the new nav', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(routes.today);
      await assertNoHorizontalOverflow(page);
      expect(errors, 'no console errors').toEqual([]);
    });

    test('bottom nav respects the safe-area inset', async ({ page }) => {
      await page.goto(routes.today);
      const nav = page.getByRole('navigation', { name: 'Mobile primary' });
      await expect(nav).toBeVisible();
      const paddingBottom = await nav.evaluate((el) => getComputedStyle(el).paddingBottom);
      // env(safe-area-inset-bottom) resolves to 0px in a non-notched test
      // viewport, but the max(0.5rem, ...) floor must still apply — proves
      // the CSS function is present and evaluating, not silently dropped.
      expect(paddingBottom).not.toBe('0px');
    });

    test('desktop navigation is unaffected by this change', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.today);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Route Planning', exact: true })).toBeVisible();
      // The mobile bottom nav must not render at desktop width.
      await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeHidden();
    });
  });
});
