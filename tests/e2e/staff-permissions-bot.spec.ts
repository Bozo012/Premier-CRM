/**
 * staff-permissions-bot: proves what the persistent E2E employee account
 * (see utils/auth.ts's getStaffAccount()) can and cannot do in its own
 * account, alongside the owner in a separate browser context, sharing one
 * org (PR B, Phases 1 & 3).
 *
 * Two things this bot deliberately does NOT infer from:
 *  - Hidden UI alone. Every owner-only restriction below is also attempted
 *    as a DIRECT API write, using createUserApiClient() to sign in as the
 *    employee with the real anon key (the same client shape the browser
 *    app itself uses) — bypassing the UI entirely. A restriction only
 *    counts as proven here if the direct write is also refused.
 *  - Assumed defects. Phase 1's audit (see PR B commit history /
 *    supabase/migrations/20260727000000_org_invites_owner_admin_only.sql)
 *    found and fixed exactly one real gap: org_invites had no role check at
 *    all, so any active org member — including this employee account —
 *    could create/revoke invites directly via the REST API. That fix is
 *    what test 5 below proves is now closed. Every other boundary tested
 *    here (org_members role changes, organizations table writes, /team and
 *    /settings/website page access) was already correctly enforced and
 *    needed no change — these tests exist to keep it that way.
 *
 * CRM data tables (customers, properties, estimates, jobs, quotes,
 * invoices) intentionally have NO role restriction beyond org membership —
 * confirmed by design (any active member does real field work), not a gap.
 * See employee-estimate-workflow-bot.spec.ts for the positive workflow
 * proof; this file is about permission BOUNDARIES only.
 */

import { test, expect } from '@playwright/test';
import {
  createUserApiClient,
  getStaffAccount,
  hasAdminCredentials,
  hasApiTestCredentials,
  hasStaffCredentials,
} from './utils/auth';
import { createStaffScenario, type StaffScenario } from './context/scenario';
import { routes, team } from './utils/selectors';

const canRun = () => hasAdminCredentials() && hasStaffCredentials();
const SKIP_REASON = 'TEST_ADMIN_* and/or TEST_STAFF_* not set in .env.test';
const canRunApiChecks = () => canRun() && hasApiTestCredentials();
const API_SKIP_REASON =
  SKIP_REASON + ', and/or NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY not set';

test.describe('staff permissions bot', () => {
  test.describe.serial('employee allowed actions (Phase 2)', () => {
    let scenario: StaffScenario;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({
        ownerPage,
        employeePage,
        customer: true,
        property: true,
      });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. employee is signed in under its own persistent account', async () => {
      expect(scenario.employeeSession.isStaffLoggedIn).toBe(true);
      expect(scenario.membership.role).toBe('employee');
      expect(scenario.membership.status).toBe('active');
    });

    test('2. employee can access the dashboard', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.today);
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('3. employee can list and find the owner-created customer', async () => {
      const { page } = scenario.employeeSession;
      const customer = scenario.customer!;

      await page.goto(routes.customers);
      await expect(page.getByText(customer.marker, { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test('4. employee can open the customer and see the owner-created property', async () => {
      const { page } = scenario.employeeSession;
      const customer = scenario.customer!;
      const property = scenario.property!;

      await page.goto(`/customers/${customer.id}`);
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
      await expect(page.getByText(property.addressLine1, { exact: false })).toBeVisible();
    });

    test('5. employee can view org-wide lists (jobs, invoices, quotes, estimates)', async () => {
      const { page } = scenario.employeeSession;

      for (const route of [routes.jobs, routes.invoices, routes.quotes, routes.estimates]) {
        await page.goto(route);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.locator('main')).not.toContainText(/forbidden|not authorized/i);
      }
    });

    test('6. employee session survives logout and re-login', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.today);
      await page.getByRole('button', { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      const account = getStaffAccount();
      await page.goto(routes.login);
      await page.locator('#email').fill(account.email);
      await page.locator('#password').fill(account.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    });
  });

  test.describe.serial('owner-only restrictions (Phase 3)', () => {
    let scenario: StaffScenario;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({ ownerPage, employeePage });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. UI: employee cannot view team management', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.team);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/only owners and admins can view team access/i)).toBeVisible();
      await expect(page.locator('#invite-fullName')).toHaveCount(0);
    });

    test('2. UI: owner can still view team management from its own context', async () => {
      const { page } = scenario.ownerSession;
      await page.goto(routes.team);
      await expect(team.heading(page)).toBeVisible();
    });

    test('3. UI: employee cannot view website settings', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.settings);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/only owners and admins can manage website content/i)).toBeVisible();
    });

    test('4. direct API: employee cannot create an org invite (bypassing the UI)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { error } = await employeeApi
        .from('org_invites')
        .insert({
          org_id: scenario.membership.orgId,
          email: `e2e-blocked-invite-${Date.now()}@example.com`,
          full_name: 'Should Be Blocked',
          role: 'admin',
          invited_by: scenario.membership.userId,
        });

      expect(error, 'expected the direct insert to be refused by RLS/grants').not.toBeNull();
    });

    test('5. direct API: employee cannot promote itself to owner/admin', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { data, error } = await employeeApi
        .from('org_members')
        .update({ role: 'owner' })
        .eq('user_id', scenario.membership.userId)
        .select('role');

      // RLS silently filters (no rows matched/returned) rather than erroring
      // — either outcome is fine, as long as the role did not actually change.
      if (!error) {
        expect(data ?? []).toHaveLength(0);
      }

      const client = await createUserApiClient(getStaffAccount());
      const { data: after } = await client
        .from('org_members')
        .select('role')
        .eq('user_id', scenario.membership.userId)
        .single();
      expect(after?.role).toBe('employee');
    });

    test('5b. direct API: employee cannot insert an org_members row directly (Auth Reset architecture)', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      // org_members has no INSERT policy at all — every real membership row
      // is created exclusively by SECURITY DEFINER functions
      // (accept_org_invite(), handle_new_user()'s first-owner bootstrap),
      // never by a direct client insert, regardless of role.
      const { error } = await employeeApi.from('org_members').insert({
        org_id: scenario.membership.orgId,
        user_id: scenario.membership.userId,
        role: 'admin',
        status: 'active',
      });

      expect(error, 'expected the direct insert to be refused by RLS').not.toBeNull();
    });

    test('6. direct API: employee cannot rename or delete the organization', async () => {
      test.skip(!canRunApiChecks(), API_SKIP_REASON);
      const employeeApi = await createUserApiClient(getStaffAccount());

      const { data: updateData, error: updateError } = await employeeApi
        .from('organizations')
        .update({ name: 'Blocked Rename Attempt' })
        .eq('id', scenario.membership.orgId)
        .select('id');
      if (!updateError) {
        expect(updateData ?? []).toHaveLength(0);
      }

      const { data: deleteData, error: deleteError } = await employeeApi
        .from('organizations')
        .delete()
        .eq('id', scenario.membership.orgId)
        .select('id');
      if (!deleteError) {
        expect(deleteData ?? []).toHaveLength(0);
      }
    });

    test.skip('no UI or server action exists yet for ownership transfer or org deletion', async () => {
      // NOT IMPLEMENTED anywhere in the app (verified: no action in
      // app/(app)/team/actions.ts or app/(app)/settings beyond website
      // content management manages org.owner_id or deletes an organizations
      // row). Nothing to test here beyond test 6 above proving the DB layer
      // already refuses both operations regardless of who's asking. Add a
      // real test once such a feature and its own authorization ships.
    });
  });
});
