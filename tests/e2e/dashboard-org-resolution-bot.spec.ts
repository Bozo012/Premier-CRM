/**
 * dashboard-org-resolution-bot: regression test for PR C0's root-cause bug —
 * a user with both a pending membership (in one org) and an active
 * membership (in another) must have the dashboard resolve to the ACTIVE
 * one, never the pending one and never a fabricated "Unknown org"
 * placeholder. Exercises getActiveOrgContext() (packages/db/queries/
 * org-context.ts) through the real /today page, not as a unit test, since
 * that's the surface the original bug actually showed up on.
 *
 * Uses the persistent E2E staff account (already has one real active
 * membership from prior PRs) plus a disposable second E2E_TEST_-tagged
 * organization created purely as the target for a synthetic pending row —
 * deleted in this bot's own cleanup, never touching the real org.
 */

import { test, expect } from '@playwright/test';
import { getStaffAccount, hasStaffCredentials } from './utils/auth';
import { loginAsStaff } from './context/auth';
import { createTestSession, type TestSession } from './context/session';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { buildMarker } from './utils/test-data';
import { routes } from './utils/selectors';

const canRun = () => hasStaffCredentials() && hasServiceRoleCleanupCredentials();
const SKIP_REASON = 'TEST_STAFF_* and/or service-role cleanup credentials not set in .env.test';

test.describe('dashboard org resolution bot', () => {
  test.describe.serial('pending + active membership — dashboard must pick the active one', () => {
    let session: TestSession;
    let throwawayOrgId: string | undefined;
    let marker: string;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const page = await browser.newPage();
      session = createTestSession(page);
      await loginAsStaff(session);
    });

    test.afterAll(async () => {
      if (throwawayOrgId) {
        const client = createGuardedServiceClient();
        await client.from('org_members').delete().eq('org_id', throwawayOrgId);
        await client.from('organizations').delete().eq('id', throwawayOrgId);
      }
      await session?.finish();
    });

    test('1. real active membership resolves correctly before any pending row exists', async () => {
      const { page } = session;
      await page.goto(routes.today);
      await expect(page.getByText('Unknown org', { exact: false })).toHaveCount(0);
      await expect(page.getByText(/ • employee$/i)).toBeVisible({ timeout: 10_000 });
    });

    test('2. a stale pending row in a second org does not change what the dashboard shows', async () => {
      const client = createGuardedServiceClient();
      const staff = getStaffAccount();

      let userId: string | undefined;
      for (let p = 1; p <= 20 && !userId; p += 1) {
        const { data } = await client.auth.admin.listUsers({ page: p, perPage: 200 });
        userId = data.users.find((u) => u.email?.toLowerCase() === staff.email.toLowerCase())?.id;
        if (data.users.length < 200) break;
      }
      expect(userId, 'expected the persistent staff account to exist').toBeTruthy();

      marker = buildMarker('DASHBOARD_RESOLUTION_ORG');
      const { data: throwawayOrg, error: orgError } = await client
        .from('organizations')
        .insert({ name: marker, slug: marker.toLowerCase().replace(/_/g, '-') })
        .select('id')
        .single();
      expect(orgError, orgError?.message).toBeNull();
      throwawayOrgId = throwawayOrg!.id;

      const { error: memberError } = await client.from('org_members').insert({
        org_id: throwawayOrgId,
        user_id: userId!,
        role: 'employee',
        status: 'pending',
      });
      expect(memberError, memberError?.message).toBeNull();

      const { page } = session;
      await page.goto(routes.today);

      // The dashboard must still show the REAL active org — the pending row
      // in the throwaway org must never be chosen, must never surface as a
      // conflict, and must never fall back to "Unknown org" either.
      await expect(page.getByText('Unknown org', { exact: false })).toHaveCount(0);
      await expect(page.getByText(marker, { exact: false })).toHaveCount(0);
      await expect(page.getByText(/ • employee$/i)).toBeVisible({ timeout: 10_000 });
    });

    test('3. after cleaning up the throwaway pending row, the dashboard still resolves correctly', async () => {
      const client = createGuardedServiceClient();
      await client.from('org_members').delete().eq('org_id', throwawayOrgId!);
      await client.from('organizations').delete().eq('id', throwawayOrgId!);
      throwawayOrgId = undefined;

      const { page } = session;
      await page.goto(routes.today);
      await expect(page.getByText('Unknown org', { exact: false })).toHaveCount(0);
      await expect(page.getByText(/ • employee$/i)).toBeVisible({ timeout: 10_000 });
    });
  });
});
