/**
 * portal-auth-bot: proves the vNext stabilization fixes for A1 (portal
 * signup confirmation) and A5 (portal forgot password), using the REAL
 * link shape Supabase generates rather than a synthetic one — this is
 * what the prior manual smoke test could not do, since it relied on
 * reading real email.
 *
 * `supabase.auth.admin.generateLink()` returns the exact `action_link`
 * Supabase would have emailed for a given type (signup/recovery),
 * including whatever flow shape (PKCE code / token_hash / implicit hash)
 * the project is actually configured for. Navigating to that link
 * reproduces the true callback this project has already been bitten by
 * assuming a single shape for (see lib/auth-callback.ts's doc comment).
 *
 * No UI signup step is driven here — `admin.createUser()` mirrors what
 * `createCustomerPortalAccount` does server-side, and lets this bot target
 * the confirmation/recovery callback itself without also re-proving the
 * signup FORM (a separate, already-covered concern).
 */

import { test, expect } from '@playwright/test';

import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { hasApiTestCredentials } from './utils/auth';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasApiTestCredentials() && hasServiceRoleCleanupCredentials();
const SKIP_REASON =
  'NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

function testEmail(): string {
  return `e2e.portal.auth.${uniqueSuffix()}@example.com`;
}

test.describe('portal auth bot', () => {
  test.describe.serial('A1: signup confirmation', () => {
    let email: string;
    let userId: string | undefined;

    test.beforeAll(() => {
      test.skip(!canRun(), SKIP_REASON);
      email = testEmail();
    });

    test.afterAll(async () => {
      if (!userId) return;
      const client = createGuardedServiceClient();
      await client.from('customer_accounts').delete().eq('auth_user_id', userId);
      await client.auth.admin.deleteUser(userId);
    });

    test('1. a real signup confirmation link lands the browser on an authenticated portal dashboard', async ({
      page,
    }) => {
      const client = createGuardedServiceClient();

      const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
        type: 'signup',
        email,
        password: `${E2E_TEST_PREFIX}Password_${uniqueSuffix()}`,
        options: { redirectTo: `${process.env.BASE_URL ?? 'http://localhost:3000'}/portal/confirm` },
      });

      expect(linkError).toBeFalsy();
      expect(linkData?.properties?.action_link).toBeTruthy();
      userId = linkData?.user?.id;

      await page.goto(linkData!.properties!.action_link);

      await expect(page).toHaveURL(/\/portal\/(confirm|dashboard)/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 10_000 });
      await expect(page.getByText(/dashboard/i)).toBeVisible();
    });
  });

  test.describe.serial('A5: forgot password + deterministic routing', () => {
    let email: string;
    let userId: string | undefined;
    const password = `${E2E_TEST_PREFIX}Password_${uniqueSuffix()}`;

    test.beforeAll(async () => {
      test.skip(!canRun(), SKIP_REASON);
      email = testEmail();

      const client = createGuardedServiceClient();
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(error).toBeFalsy();
      userId = data?.user?.id;
      if (!userId) throw new Error('createUser did not return a user id.');

      // Link as an active customer account so post-recovery routing has
      // something to resolve to /portal/dashboard.
      const { data: customer } = await client
        .from('customers')
        .insert({
          org_id: process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001',
          type: 'residential',
          first_name: E2E_TEST_PREFIX,
          last_name: 'PortalAuthBot',
          email,
          source: 'customer_portal',
          tags: ['customer_portal'],
        })
        .select('id')
        .single();

      await client.from('customer_accounts').insert({
        org_id: process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001',
        customer_id: customer!.id,
        auth_user_id: userId,
        email,
        status: 'active',
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      });
    });

    test.afterAll(async () => {
      if (!userId) return;
      const client = createGuardedServiceClient();
      await client.from('customer_accounts').delete().eq('auth_user_id', userId);
      await client.from('customers').delete().eq('email', email);
      await client.auth.admin.deleteUser(userId);
    });

    test('1. a real recovery link routes a customer-only account to /portal/dashboard, not /today', async ({
      page,
    }) => {
      const client = createGuardedServiceClient();

      const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${process.env.BASE_URL ?? 'http://localhost:3000'}/update-password`,
        },
      });

      expect(linkError).toBeFalsy();
      expect(linkData?.properties?.action_link).toBeTruthy();

      await page.goto(linkData!.properties!.action_link);
      await expect(page.getByLabel(/new password/i)).toBeVisible({ timeout: 10_000 });

      const newPassword = `${E2E_TEST_PREFIX}NewPassword_${uniqueSuffix()}`;
      await page.getByLabel(/new password/i).fill(newPassword);
      await page.getByLabel(/confirm password/i).fill(newPassword);
      await page.getByRole('button', { name: /save password/i }).click();

      // Deterministic routing (A5): a customer-only account (no active
      // org_members row) must land on /portal/dashboard, never /today.
      await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 10_000 });
    });
  });
});
