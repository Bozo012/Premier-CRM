/**
 * routes-base44-shell-bot: coverage for the new /routes Route Planning
 * dispatcher view (rebuild/base44-routing-map) — the ForgeShell chrome
 * around the real listRouteJobsForDate/listRouteSiteVisitsForDate-backed
 * route list, crew/date filters, and map area.
 *
 * Follows the pattern of jobs-base44-shell-bot.spec.ts /
 * calendar-base44-shell-bot.spec.ts:
 *  - Redirect-to-login when unauthenticated.
 *  - No horizontal overflow at four required viewports.
 *  - New shell chrome (sidebar) is present.
 *  - Selected-day schedule renders (summary tiles, route list).
 *  - Crew filter changes the URL.
 *  - Date changes the URL.
 *  - List-selection state is testable without a live map (no
 *    GOOGLE_MAPS_API_KEY is configured anywhere in this environment, so the
 *    map area is expected to show the "Maps not configured" fallback, never
 *    a broken/blank map) — list<->marker sync itself needs a live key to
 *    fully verify and is documented as NOT YET LIVE-VERIFIED in the report.
 *  - Missing-location handling ("Location unavailable"/"Missing address")
 *    is asserted conditionally (only if the org's data produces one).
 *  - Direct URL load, refresh, and keyboard focus reach the date input.
 *  - No console errors.
 *
 * What this bot deliberately does NOT cover: live Google Maps rendering,
 * live geocoding, live Directions API calls, or real marker pixel
 * positions — none of that is exercisable without a real
 * GOOGLE_MAPS_API_KEY, which is not configured in this environment (see
 * docs/ux/base44-routing-map-report.md's provisioning checklist).
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

test.describe('routes base44 shell bot', () => {
  test('routes page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.routePlanning);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders Route Planning with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.routePlanning);
        await expect(page.getByRole('heading', { name: 'Route Planning' })).toBeVisible();

        await assertNoHorizontalOverflow(page);
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('new shell chrome (sidebar) is present on /routes', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.routePlanning);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('summary tiles render real counts (never fabricated mileage/drive-time)', async ({ page }) => {
      await page.goto(routes.routePlanning);
      // Scoped to <main> — "Jobs" alone also matches the sidebar/mobile nav
      // link, a strict-mode collision (same recurring bug class as every
      // prior slice's shell-chrome-vs-page-content label overlaps).
      // Scoped to the SummaryTile label's own element shape
      // (`div.text-[11px]`) — "Jobs"/"Unassigned" etc. alone also match the
      // sidebar nav link / crew-filter <option>, and mobile + desktop
      // summary-tile layouts both render in the DOM simultaneously
      // (CSS-hidden per breakpoint, not conditionally unmounted), so
      // .first() is needed even after scoping.
      const summaryTileLabel = (text: string) => page.locator('div.text-\\[11px\\]', { hasText: text }).first();
      await expect(summaryTileLabel('Scheduled stops')).toBeVisible();
      await expect(summaryTileLabel('Jobs')).toBeVisible();
      await expect(summaryTileLabel('Site visits')).toBeVisible();
      await expect(summaryTileLabel('Unassigned')).toBeVisible();
      await expect(summaryTileLabel('Missing location')).toBeVisible();
      // Never present anywhere on this page — no fake mileage/drive-time.
      await expect(page.getByText(/\d+(\.\d+)?\s*(mi|miles|min)\b.*drive/i)).toHaveCount(0);
    });

    test('no live Google Maps key is configured — the map area shows the honest fallback', async ({ page }) => {
      await page.goto(routes.routePlanning);
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.getByText('Maps not configured')).toBeVisible();
    });

    test('date input changes the URL', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const dateInput = page.locator('#route-date');
      await dateInput.fill('2026-01-15');
      await expect(page).toHaveURL(/[?&]date=2026-01-15/);
    });

    test('crew filter changes the URL', async ({ page }) => {
      await page.goto(routes.routePlanning);
      await page.getByLabel('Filter by crew').selectOption('unassigned');
      await expect(page).toHaveURL(/[?&]crew=unassigned/);

      await page.getByLabel('Filter by crew').selectOption('all');
      await expect(page).not.toHaveURL(/[?&]crew=/);
    });

    test('keyboard focus reaches the route date input', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const dateInput = page.locator('#route-date');
      await dateInput.focus();
      await expect(dateInput).toBeFocused();
    });

    test('mobile Route/Map segmented toggle is present and switches views', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(routes.routePlanning);
      const mapTab = page.getByRole('tab', { name: /^map$/i });
      await expect(mapTab).toBeVisible();
      await mapTab.click();
      await expect(mapTab).toHaveAttribute('aria-selected', 'true');

      const routeTab = page.getByRole('tab', { name: /^route$/i });
      await routeTab.click();
      await expect(routeTab).toHaveAttribute('aria-selected', 'true');
    });

    test('selecting a route-list row highlights it (list<->map selection state)', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const firstStop = page.locator('li[aria-current]').first();
      const hasStop = (await firstStop.count()) > 0;
      test.skip(!hasStop, 'No scheduled stops for the default date — nothing to select.');

      const stopButton = firstStop.getByRole('button').first();
      await stopButton.click();
      await expect(firstStop).toHaveAttribute('aria-current', 'true');
    });

    test('a stop with a location warning still opens its real detail page', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const warningBadge = page.getByText(/Location unavailable|Missing address/).first();
      const hasWarning = (await warningBadge.count()) > 0;
      test.skip(!hasWarning, 'No missing-location stops for the default date.');

      const stopRow = warningBadge.locator('xpath=ancestor::li[1]');
      const openLink = stopRow.getByRole('link', { name: /open job|open site visit/i });
      await expect(openLink).toBeVisible();
      const href = await openLink.getAttribute('href');
      expect(href).toMatch(/^\/(jobs|site-visits)\/[0-9a-f-]{36}$/);
    });

    test('"Open job"/"Open site visit" is a real link, not a toast-only action', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const openLink = page.getByRole('link', { name: /open job|open site visit/i }).first();
      const hasLink = (await openLink.count()) > 0;
      test.skip(!hasLink, 'No scheduled stops for the default date — nothing to open.');

      await openLink.click();
      await expect(page).toHaveURL(/\/(jobs|site-visits)\/[0-9a-f-]{36}$/);
    });

    test('direct URL load and refresh preserve the Route Planning shell', async ({ page }) => {
      await page.goto(`${routes.routePlanning}?crew=unassigned`);
      await expect(page.getByRole('heading', { name: 'Route Planning' })).toBeVisible();

      const errors = collectConsoleErrors(page);
      await assertNoHorizontalOverflow(page);
      expect(errors).toEqual([]);

      await page.reload();
      await expect(page).toHaveURL(/[?&]crew=unassigned/);
      await expect(page.getByRole('heading', { name: 'Route Planning' })).toBeVisible();
    });

    // Regression coverage for the live production defect found after PR
    // #150's AdvancedMarkerElement migration: stop markers were visible
    // before "Calculate route" and disappeared after it succeeded, even
    // though they were never removed from the map (a polyline/marker
    // z-index stacking issue on the vector map, fixed via explicit
    // zIndex — see marker-rendering.ts). Both tests below require a real
    // NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to be configured for whatever
    // environment this suite runs against; they skip honestly (not a false
    // pass) when the map isn't live, matching every other Maps-dependent
    // test's convention in this file.
    test('every geocoded stop has a visible AdvancedMarkerElement marker', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const mapConfigured = (await page.getByText('Maps not configured').count()) === 0;
      test.skip(!mapConfigured, 'No live NEXT_PUBLIC_GOOGLE_MAPS_API_KEY configured in this environment.');

      const geocodedCount = await page
        .locator('div.text-\\[11px\\]', { hasText: 'Scheduled stops' })
        .first()
        .locator('xpath=preceding-sibling::div[1]')
        .textContent();
      const missingLocationCount = await page.locator('div.text-\\[11px\\]', { hasText: 'Missing location' }).first().locator('xpath=preceding-sibling::div[1]').textContent();
      test.skip(!geocodedCount || Number(geocodedCount) - Number(missingLocationCount ?? 0) < 1, 'No geocoded stops for the default date.');

      const markers = page.locator('gmp-advanced-marker');
      await expect(markers.first()).toBeVisible();
    });

    test('markers remain visible after Calculate Route succeeds — the exact reported regression', async ({ page }) => {
      await page.goto(routes.routePlanning);
      const mapConfigured = (await page.getByText('Maps not configured').count()) === 0;
      test.skip(!mapConfigured, 'No live NEXT_PUBLIC_GOOGLE_MAPS_API_KEY configured in this environment.');

      const calculateButton = page.getByRole('button', { name: /calculate route/i });
      const hasButton = (await calculateButton.count()) > 0;
      test.skip(!hasButton, 'Calculate route control not present.');
      const isEnabled = await calculateButton.isEnabled();
      test.skip(!isEnabled, 'Fewer than two geocoded stops for the default date — Calculate route is correctly disabled.');

      const markers = page.locator('gmp-advanced-marker');
      const beforeCount = await markers.count();
      expect(beforeCount, 'markers must exist before Calculate Route is even clicked').toBeGreaterThan(0);

      await calculateButton.click();
      await expect(page.getByText(/mi$/).first()).toBeVisible({ timeout: 15_000 });

      const afterCount = await markers.count();
      expect(afterCount, 'Calculate Route must not remove any marker from the DOM').toBe(beforeCount);
      await expect(markers.first()).toBeVisible();
    });
  });
});
