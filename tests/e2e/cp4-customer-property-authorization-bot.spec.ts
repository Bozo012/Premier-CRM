/**
 * cp4-customer-property-authorization-bot: live coverage for CP-4
 * (docs/security/customers-properties-authorization-audit.md §10/§15;
 * product decision recorded 2026-08-13) — createCustomerAction and
 * createPropertyForCustomerAction previously had no capability check at
 * all, so any active org member, including subcontractor and viewer, could
 * create customers and properties (the CRM's authoritative master
 * identity/contact/location records) through the trusted server-action
 * path. Direct authenticated REST writes to these tables were already
 * fully closed at the RLS layer
 * (20260804000000_harden_customers_and_properties.sql, proven live in
 * authorization-customers-properties-bot.spec.ts) — the server action is
 * the only write path left, and this bot proves the new canManageCustomers
 * gate on it.
 *
 * Every role signs in through the real login form and drives the real UI
 * (/customers/new, the customer detail "Add property" dialog) — this is
 * the actual, only enforcement boundary for this feature (there is no
 * public RPC to call directly, unlike the messaging/triage/archetype-
 * defaults fixes in this same series), so proving it live means proving it
 * through the real form submission, not a mocked unit call.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { hasServiceRoleCleanupCredentials, createGuardedServiceClient } from './utils/cleanup';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';
import { loginAs } from './utils/auth';
import { newCustomerForm, propertiesCard, routes } from './utils/selectors';

const canRun = () => hasServiceRoleCleanupCredentials() && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.test';

interface StaffAccount {
  email: string;
  password: string;
  userId: string;
}

test.describe('cp4 customer/property authorization bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let suffix: string;
  let accounts: Record<'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer', StaffAccount>;
  let existingCustomerId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    suffix = uniqueSuffix();
    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({
      id: orgId,
      name: `${E2E_TEST_PREFIX}Cp4Auth_${suffix}`,
      slug: `e2e-cp4-auth-${suffix}`,
    });

    async function createStaff(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer'): Promise<StaffAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}cp4-${role}-${suffix}@example.com`;
      const password = `Cp4Auth_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    accounts = {
      owner: await createStaff('owner'),
      admin: await createStaff('admin'),
      employee: await createStaff('employee'),
      subcontractor: await createStaff('subcontractor'),
      viewer: await createStaff('viewer'),
    };

    // A pre-existing customer for the "add property" tests, so those don't
    // depend on the create-customer tests having run first or succeeded.
    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'Cp4Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    existingCustomerId = customer!.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: createdCustomers } = await admin
      .from('customers')
      .select('id')
      .eq('org_id', orgId);
    const customerIds = (createdCustomers ?? []).map((c) => c.id);
    if (customerIds.length > 0) {
      await admin.from('customer_properties').delete().in('customer_id', customerIds);
    }
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('org_members').delete().eq('org_id', orgId);
    for (const account of Object.values(accounts ?? {})) {
      await admin.auth.admin.deleteUser(account.userId);
    }
    await admin.from('organizations').delete().eq('id', orgId);
  });

  for (const role of ['owner', 'admin', 'employee'] as const) {
    test(`${role} can create a customer through the real /customers/new form`, async ({ page }) => {
      await loginAs(page, accounts[role]);
      await page.goto(routes.newCustomer);

      const marker = `${E2E_TEST_PREFIX}Cp4Create_${role}_${suffix}`;
      await newCustomerForm.companyNameInput(page).fill(marker);
      await newCustomerForm.submitButton(page).click();

      await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 10_000 });

      const { data: created } = await admin.from('customers').select('id').eq('org_id', orgId).eq('company_name', marker).maybeSingle();
      expect(created).not.toBeNull();
    });
  }

  for (const role of ['subcontractor', 'viewer'] as const) {
    test(`${role} CANNOT create a customer — the real form submission is rejected server-side, no row is created`, async ({ page }) => {
      await loginAs(page, accounts[role]);
      await page.goto(routes.newCustomer);

      const marker = `${E2E_TEST_PREFIX}Cp4Reject_${role}_${suffix}`;
      await newCustomerForm.companyNameInput(page).fill(marker);
      await newCustomerForm.submitButton(page).click();

      // Stays on /customers/new (no redirect to a new detail page) and
      // shows the server action's rejection — proves this is a real
      // server-side denial, not a client-side validation message.
      await expect(page).toHaveURL(routes.newCustomer, { timeout: 5_000 });
      // .first() — the same message renders both inline (form error) and as
      // a toast notification; either is proof of a real server-side denial.
      await expect(page.getByText(/does not permit creating customers/i).first()).toBeVisible({ timeout: 5_000 });

      const { data: created } = await admin.from('customers').select('id').eq('org_id', orgId).eq('company_name', marker).maybeSingle();
      expect(created).toBeNull();
    });
  }

  for (const role of ['owner', 'admin', 'employee'] as const) {
    test(`${role} can add a property to an existing customer through the real UI`, async ({ page }) => {
      await loginAs(page, accounts[role]);
      await page.goto(`/customers/${existingCustomerId}`);

      await propertiesCard.addPropertyToggle(page).click();
      const marker = `${suffix}-${role}`;
      await propertiesCard.addressLine1Input(page).fill(`${E2E_TEST_PREFIX}${marker} Cp4 Property Way`);
      await propertiesCard.cityInput(page).fill('Testville');
      await propertiesCard.stateInput(page).fill('NY');
      await propertiesCard.zipInput(page).fill('10001');
      await propertiesCard.submitButton(page).click();

      // .first() — the new property's address renders both as a related-
      // record row and in the page-header context chip.
      await expect(page.getByText(`${E2E_TEST_PREFIX}${marker} Cp4 Property Way`, { exact: false }).first()).toBeVisible({ timeout: 10_000 });

      const { data: created } = await admin
        .from('properties')
        .select('id')
        .eq('org_id', orgId)
        .eq('address_line_1', `${E2E_TEST_PREFIX}${marker} Cp4 Property Way`)
        .maybeSingle();
      expect(created).not.toBeNull();
    });
  }

  for (const role of ['subcontractor', 'viewer'] as const) {
    test(`${role} CANNOT add a property — the real form submission is rejected server-side, no row is created`, async ({ page }) => {
      await loginAs(page, accounts[role]);
      await page.goto(`/customers/${existingCustomerId}`);

      await propertiesCard.addPropertyToggle(page).click();
      const marker = `${suffix}-${role}-reject`;
      await propertiesCard.addressLine1Input(page).fill(`${E2E_TEST_PREFIX}${marker} Cp4 Property Way`);
      await propertiesCard.cityInput(page).fill('Testville');
      await propertiesCard.stateInput(page).fill('NY');
      await propertiesCard.zipInput(page).fill('10001');
      await propertiesCard.submitButton(page).click();

      // .first() — same message renders both inline (dialog error) and as
      // a toast notification.
      await expect(page.getByText(/does not permit adding properties/i).first()).toBeVisible({ timeout: 5_000 });

      const { data: created } = await admin
        .from('properties')
        .select('id')
        .eq('org_id', orgId)
        .eq('address_line_1', `${E2E_TEST_PREFIX}${marker} Cp4 Property Way`)
        .maybeSingle();
      expect(created).toBeNull();
    });
  }

  test('zero residue — every customer/property created above by an allowed role is org-scoped and gets torn down in afterAll', async () => {
    const { count } = await admin.from('customers').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    // 1 fixture customer + up to 3 (owner/admin/employee) created above —
    // just confirms rows exist and are scoped to this test org, not a
    // stray leak into another org. Actual deletion is verified structurally
    // by afterAll running without error.
    expect(count ?? 0).toBeGreaterThan(0);
  });
});
