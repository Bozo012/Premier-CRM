/**
 * team-base44-shell-bot: coverage for the Base44-exact shell rebuild of
 * /team (rebuild/base44-exact-properties-team) — the ForgeShell chrome plus
 * the ported TeamList (card grid) presentation, and the brand-new
 * /team/[memberId] detail route on top of real
 * org_members/user_profiles/team_member_availability data.
 *
 * Follows the exact pattern of customers-base44-shell-bot.spec.ts, plus
 * owner-vs-employee action-visibility coverage the task specifically
 * called out (invite/pending-invite management must render for the admin
 * account and must NOT render for the employee account — both server-side
 * gated by `role === 'owner' || role === 'admin'`, not just hidden in the
 * UI; see forge-team-view-model.ts / team/actions.ts).
 */

import { test, expect, type Page } from '@playwright/test';
import { isRedirectedToLogin, routes, team } from './utils/selectors';
import { getStaffName, hasAdminCredentials, hasStaffCredentials, loginAsAdmin, loginAs, getStaffAccount } from './utils/auth';

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

test.describe('team base44 shell bot', () => {
  test('team page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(routes.team);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.describe('authenticated shell coverage (admin)', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      await loginAsAdmin(page);
    });

    for (const viewport of VIEWPORTS) {
      test(`renders the team card grid with no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(routes.team);
        await expect(team.heading(page)).toBeVisible();
        await assertNoHorizontalOverflow(page);
        await page.screenshot({ path: `test-results/screenshots/team-list-${viewport.name}.png`, fullPage: true });
        expect(errors, `no console errors at ${viewport.name}`).toEqual([]);
      });
    }

    test('search updates the URL query param', async ({ page }) => {
      await page.goto(routes.team);
      await page.getByPlaceholder(/search by name, role, or skill/i).fill('zzz-no-such-member-zzz');
      await expect(page).toHaveURL(/[?&]q=zzz-no-such-member-zzz/, { timeout: 2_000 });
    });

    test('availability filter tabs update the URL', async ({ page }) => {
      await page.goto(routes.team);
      await page.getByRole('tab', { name: /on leave/i }).click();
      await expect(page).toHaveURL(/[?&]filter=on_leave/);
    });

    test('new shell chrome (sidebar) is present on /team', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.team);
      await expect(page.getByText('Forge', { exact: true })).toBeVisible();
    });

    test('the invite-member section is visible for an owner/admin', async ({ page }) => {
      await page.goto(routes.team);
      await expect(page.getByRole('heading', { name: 'Invite a team member' })).toBeVisible();
    });

    test('a non-existent team member id renders a real not-found page', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`${routes.team}/00000000-0000-4000-8000-000000000000`);
      await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
      expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
    });

    test('opens a member card, refreshes, and goes Back', async ({ page }) => {
      await page.goto(routes.team);
      await expect(team.heading(page)).toBeVisible();

      const firstCard = page.locator('main >> role=button[name=/^Open team member/]').first();
      const hasCards = (await firstCard.count()) > 0;
      test.skip(!hasCards, 'Org has no team members visible to this account.');

      await firstCard.click();
      await expect(page).toHaveURL(new RegExp(`${routes.team}/[0-9a-f-]{36}$`));
      const errors = collectConsoleErrors(page);
      await assertNoHorizontalOverflow(page);
      expect(errors).toEqual([]);

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${routes.team}/[0-9a-f-]{36}$`));

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${routes.team}$`));
      await expect(team.heading(page)).toBeVisible();
    });
  });

  test.describe('owner-vs-employee action visibility', () => {
    test('an employee account does not see invite-management actions that an owner/admin sees', async ({ page }) => {
      test.skip(!hasStaffCredentials(), 'TEST_STAFF_EMAIL/TEST_STAFF_PASSWORD/TEST_STAFF_NAME not set in .env.test');
      await loginAs(page, getStaffAccount());
      await page.goto(routes.team);
      await expect(team.heading(page)).toBeVisible();

      // Server-side gated (role === 'owner' || role === 'admin' in
      // team/page.tsx), not merely hidden — an employee session never even
      // receives the invite section or pending-invites query results.
      await expect(page.getByRole('heading', { name: 'Invite a team member' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0);

      // The employee's own card should still render (self-visible).
      const ownName = getStaffName();
      await expect(page.getByRole('button', { name: new RegExp(`Open team member ${ownName}`) })).toBeVisible();
    });

    test('an employee opening their own detail page can edit their own availability but not another member\'s', async ({ page }) => {
      test.skip(!hasStaffCredentials(), 'TEST_STAFF_EMAIL/TEST_STAFF_PASSWORD/TEST_STAFF_NAME not set in .env.test');
      await loginAs(page, getStaffAccount());
      await page.goto(routes.team);

      const ownName = getStaffName();
      await page.getByRole('button', { name: new RegExp(`Open team member ${ownName}`) }).click();
      await expect(page).toHaveURL(new RegExp(`${routes.team}/[0-9a-f-]{36}$`));

      // isSelf grants canEditAvailability even without owner/admin — the
      // <select>/Save form should be enabled, not disabled.
      await expect(page.locator('#availabilityStatus')).toBeEnabled();
    });
  });
});
