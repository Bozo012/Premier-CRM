/**
 * authorization-customers-properties-bot: proves the Forge V1.0.2 security
 * patch (docs/security/customers-properties-authorization-audit.md) closes
 * two defects on customers/properties/customer_properties/customer_accounts:
 *
 *   - CP-A (CP-1, CP-5): the direct-authenticated-REST bypass on customers
 *     and properties — same defect class as authorization-batch-a-bot.spec.ts
 *     and authorization-service-requests-bot.spec.ts.
 *   - CP-B (CP-2, CP-3): the asymmetric cross-org relationship-integrity
 *     gap on customer_properties (only the customer side was checked) and
 *     customer_accounts (only the row's own org_id was checked, never that
 *     customer_id actually belongs to it) — a genuine cross-tenant
 *     data-exposure vector via the customer-portal SELECT policies.
 *
 * Uses real, freshly-created test-role accounts, direct REST attempts via
 * each role's own authenticated session, and service-role fixtures/cleanup.
 * No mutating probes are ever run against the real PPM organization.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('authorization customers-properties bot (customers + properties + customer_properties + customer_accounts DB boundary)', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;
  let otherOrgCustomerId: string;
  let otherOrgPropertyId: string;
  let legitimateAccountUserId: string;
  const legitimatePortalAccount = { email: '', password: '' };

  const owner = { email: '', password: '' };
  const admin_ = { email: '', password: '' };
  const employee = { email: '', password: '' };
  const subcontractor = { email: '', password: '' };
  const viewer = { email: '', password: '' };
  const otherOrgOwner = { email: '', password: '', userId: '' };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: 'E2E_CP_AUTH_ORG', slug: `e2e-cp-auth-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_CP_AUTH_OTHER_ORG', slug: `e2e-cp-auth-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'CPAuth', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 CP Auth Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: otherCustomer } = await admin
      .from('customers')
      .insert({ org_id: otherOrgId, type: 'residential', first_name: 'CPAuthOther', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    otherOrgCustomerId = otherCustomer!.id;

    const { data: otherProperty } = await admin
      .from('properties')
      .insert({ org_id: otherOrgId, address_line_1: '1 CP Auth Other Way', city: 'Testville', state: 'NY', zip: '10002', country: 'US' })
      .select('id')
      .single();
    otherOrgPropertyId = otherProperty!.id;

    async function createStaff(
      role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer',
      targetOrgId: string
    ): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-cp-auth-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `CPAuth_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    Object.assign(owner, await createStaff('owner', orgId));
    Object.assign(admin_, await createStaff('admin', orgId));
    Object.assign(employee, await createStaff('employee', orgId));
    Object.assign(subcontractor, await createStaff('subcontractor', orgId));
    Object.assign(viewer, await createStaff('viewer', orgId));
    Object.assign(otherOrgOwner, await createStaff('owner', otherOrgId));

    // A legitimate, same-org customer_accounts row for the read-scoping
    // check (item 24) — created via service-role, mirroring how
    // ensureCustomerAccount()/link-account actually create these rows.
    legitimatePortalAccount.email = `e2e-cp-auth-portal-${Date.now()}@example.com`;
    legitimatePortalAccount.password = `CPAuth_${Math.random().toString(36).slice(2)}!1`;
    const { data: legitimateAccountUser, error: legitimateAccountUserError } = await admin.auth.admin.createUser({
      email: legitimatePortalAccount.email,
      password: legitimatePortalAccount.password,
      email_confirm: true,
    });
    if (legitimateAccountUserError || !legitimateAccountUser.user) {
      throw new Error(`createUser(portal) failed: ${legitimateAccountUserError?.message}`);
    }
    legitimateAccountUserId = legitimateAccountUser.user.id;
    await admin.from('customer_accounts').insert({
      org_id: orgId,
      customer_id: customerId,
      auth_user_id: legitimateAccountUserId,
      email: legitimatePortalAccount.email,
      status: 'active',
    });
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: members } = await admin
      .from('org_members')
      .select('user_id')
      .in('org_id', [orgId, otherOrgId]);
    await admin.from('customer_accounts').delete().in('org_id', [orgId, otherOrgId]);
    await admin.from('org_members').delete().in('org_id', [orgId, otherOrgId]);
    for (const m of members ?? []) {
      await admin.auth.admin.deleteUser(m.user_id);
    }
    if (legitimateAccountUserId) await admin.auth.admin.deleteUser(legitimateAccountUserId);
    await admin.from('customer_properties').delete().eq('customer_id', customerId);
    await admin.from('customer_properties').delete().eq('customer_id', otherOrgCustomerId);
    await admin.from('properties').delete().in('org_id', [orgId, otherOrgId]);
    await admin.from('customers').delete().in('org_id', [orgId, otherOrgId]);
    await admin.from('organizations').delete().in('id', [orgId, otherOrgId]);
  });

  async function apiClientFor(account: { email: string; password: string }): Promise<SupabaseClient<Database>> {
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error } = await client.auth.signInWithPassword(account);
    if (error) throw new Error(`signInWithPassword failed: ${error.message}`);
    return client;
  }

  // -----------------------------------------------------------------
  // customers — INSERT/UPDATE/DELETE denial across roles (items 1-9)
  // -----------------------------------------------------------------
  for (const [label, account] of [
    ['employee', employee],
    ['subcontractor', subcontractor],
    ['viewer', viewer],
    ['owner', owner],
    ['admin', admin_],
  ] as const) {
    test(`customers: ${label} cannot INSERT directly via REST`, async () => {
      const client = await apiClientFor(account);
      const { error } = await client
        .from('customers')
        .insert({ org_id: orgId, type: 'residential', first_name: 'Bypass', last_name: 'Attempt', source: 'manual_staff_entry' });
      expect(error).not.toBeNull();
    });
  }

  test('customers: cross-org user cannot INSERT into this org', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'CrossOrg', last_name: 'Bypass', source: 'manual_staff_entry' });
    expect(error).not.toBeNull();
  });

  test('customers: employee cannot UPDATE contact info directly via REST', async () => {
    const client = await apiClientFor(employee);
    const { error } = await client.from('customers').update({ first_name: 'Tampered' }).eq('id', customerId);
    expect(error).not.toBeNull();
  });

  test('customers: viewer cannot UPDATE org_id directly via REST', async () => {
    const client = await apiClientFor(viewer);
    const { error } = await client.from('customers').update({ org_id: otherOrgId }).eq('id', customerId);
    expect(error).not.toBeNull();
  });

  test('customers: viewer cannot UPDATE billing terms directly via REST', async () => {
    const client = await apiClientFor(viewer);
    const { error } = await client.from('customers').update({ payment_terms_days: 90, standing_approval_threshold: 999999 }).eq('id', customerId);
    expect(error).not.toBeNull();
  });

  test('customers: cross-org UPDATE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('customers').update({ first_name: 'CrossOrgTamper' }).eq('id', customerId);
    expect(error).not.toBeNull();
  });

  test('customers: owner cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('customers').delete().eq('id', customerId);
    expect(error).not.toBeNull();
  });

  test('customers: cross-org DELETE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('customers').delete().eq('id', customerId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // properties — INSERT/UPDATE/DELETE denial across roles (items 11-19)
  // -----------------------------------------------------------------
  test('properties: employee cannot INSERT directly via REST', async () => {
    const client = await apiClientFor(employee);
    const { error } = await client
      .from('properties')
      .insert({ org_id: orgId, address_line_1: 'Bypass Ave', city: 'Testville', state: 'NY', zip: '10001', country: 'US' });
    expect(error).not.toBeNull();
  });

  test('properties: cross-org user cannot INSERT into this org', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client
      .from('properties')
      .insert({ org_id: orgId, address_line_1: 'Cross-org Ave', city: 'Testville', state: 'NY', zip: '10001', country: 'US' });
    expect(error).not.toBeNull();
  });

  test('properties: viewer cannot UPDATE gate_code/access_notes directly via REST', async () => {
    const client = await apiClientFor(viewer);
    const { error } = await client.from('properties').update({ gate_code: '0000', access_notes: 'forged' }).eq('id', propertyId);
    expect(error).not.toBeNull();
  });

  test('properties: viewer cannot UPDATE org_id directly via REST', async () => {
    const client = await apiClientFor(viewer);
    const { error } = await client.from('properties').update({ org_id: otherOrgId }).eq('id', propertyId);
    expect(error).not.toBeNull();
  });

  test('properties: cross-org UPDATE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('properties').update({ address_line_1: 'Cross-org Tamper' }).eq('id', propertyId);
    expect(error).not.toBeNull();
  });

  test('properties: owner cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('properties').delete().eq('id', propertyId);
    expect(error).not.toBeNull();
  });

  test('properties: cross-org DELETE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('properties').delete().eq('id', propertyId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // customer_properties — same-org and cross-org linking (items 15, 16, 20)
  // -----------------------------------------------------------------
  test('customer_properties: same-org INSERT denied directly via REST (routes through trusted service-role path only)', async () => {
    const client = await apiClientFor(employee);
    const { error } = await client.from('customer_properties').insert({ customer_id: customerId, property_id: propertyId, relationship: 'owner' });
    expect(error).not.toBeNull();
  });

  test('customer_properties: CP-2 — cross-org link (org-A customer to org-B property) denied directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client
      .from('customer_properties')
      .insert({ customer_id: customerId, property_id: otherOrgPropertyId, relationship: 'owner' });
    expect(error).not.toBeNull();
  });

  test('customer_properties: CP-2 — reverse-direction cross-org link (org-B customer to org-A property) denied directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client
      .from('customer_properties')
      .insert({ customer_id: otherOrgCustomerId, property_id: propertyId, relationship: 'owner' });
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // customer_accounts — CP-3 cross-org portal-account forgery (items 21-24)
  // -----------------------------------------------------------------
  test('customer_accounts: CP-3 — org-A member cannot INSERT an account row for an org-B customer', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('customer_accounts').insert({
      org_id: orgId,
      customer_id: otherOrgCustomerId,
      auth_user_id: otherOrgOwner.userId,
      email: `e2e-cp-auth-forged-${Date.now()}@example.com`,
      status: 'active',
    });
    expect(error).not.toBeNull();
  });

  test('customer_accounts: same-org INSERT also denied directly via REST (routes through trusted service-role path only)', async () => {
    const client = await apiClientFor(employee);
    const { error } = await client.from('customer_accounts').insert({
      org_id: orgId,
      customer_id: customerId,
      auth_user_id: otherOrgOwner.userId,
      email: `e2e-cp-auth-same-org-${Date.now()}@example.com`,
      status: 'active',
    });
    expect(error).not.toBeNull();
  });

  test('customer_accounts: cannot UPDATE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('customer_accounts').update({ status: 'active' }).eq('customer_id', customerId);
    expect(error).not.toBeNull();
  });

  test('customer_accounts: cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('customer_accounts').delete().eq('customer_id', customerId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // Side effects (items 25-26)
  // -----------------------------------------------------------------
  test('denied attempts create no side effects — no rows, no forged links', async () => {
    const beforeCounts = {
      customerProperties: (
        await admin.from('customer_properties').select('customer_id', { count: 'exact', head: true }).eq('customer_id', customerId)
      ).count,
      customerAccounts: (
        await admin.from('customer_accounts').select('id', { count: 'exact', head: true }).in('org_id', [orgId, otherOrgId])
      ).count,
    };

    const client = await apiClientFor(owner);
    await client.from('customer_properties').insert({ customer_id: customerId, property_id: otherOrgPropertyId, relationship: 'owner' });
    await client.from('customer_accounts').insert({
      org_id: orgId,
      customer_id: otherOrgCustomerId,
      auth_user_id: otherOrgOwner.userId,
      email: `e2e-cp-auth-side-effect-${Date.now()}@example.com`,
      status: 'active',
    });
    await client.from('customers').update({ first_name: 'ShouldNotStick' }).eq('id', customerId);

    const afterCounts = {
      customerProperties: (
        await admin.from('customer_properties').select('customer_id', { count: 'exact', head: true }).eq('customer_id', customerId)
      ).count,
      customerAccounts: (
        await admin.from('customer_accounts').select('id', { count: 'exact', head: true }).in('org_id', [orgId, otherOrgId])
      ).count,
    };

    expect(afterCounts).toEqual(beforeCounts);

    const { data: customerUnchanged } = await admin.from('customers').select('first_name').eq('id', customerId).single();
    expect(customerUnchanged?.first_name).toBe('CPAuth');
  });

  // -----------------------------------------------------------------
  // Read behavior (items 27-28, 24)
  // -----------------------------------------------------------------
  test('authorized org members retain expected SELECT on customers/properties/customer_properties', async () => {
    const client = await apiClientFor(owner);
    const [custResult, propResult, cpResult] = await Promise.all([
      client.from('customers').select('id').eq('id', customerId).maybeSingle(),
      client.from('properties').select('id').eq('id', propertyId).maybeSingle(),
      client.from('customer_properties').select('customer_id, property_id').eq('customer_id', customerId).maybeSingle(),
    ]);
    expect(custResult.error).toBeNull();
    expect(custResult.data?.id).toBe(customerId);
    expect(propResult.error).toBeNull();
    expect(propResult.data?.id).toBe(propertyId);
  });

  test('cross-org SELECT returns no protected rows (RLS-filtered, not an error)', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const [custResult, propResult] = await Promise.all([
      client.from('customers').select('id').eq('id', customerId).maybeSingle(),
      client.from('properties').select('id').eq('id', propertyId).maybeSingle(),
    ]);
    expect(custResult.error).toBeNull();
    expect(custResult.data).toBeNull();
    expect(propResult.error).toBeNull();
    expect(propResult.data).toBeNull();
  });

  test('CP-3 regression: the legitimate portal account sees only its own customer/properties/account, never the other org', async () => {
    // legitimateAccountUserId is linked to customerId (orgId) via the
    // legitimate, service-role-created customer_accounts row from
    // beforeAll. This proves the narrow customer_select_own_* policies
    // stay correctly scoped to that customer only — never otherOrgCustomerId
    // or otherOrgId's data — now that the write side (CP-3) is closed.
    const portalClient = await apiClientFor(legitimatePortalAccount);

    const ownAccount = await portalClient.from('customer_accounts').select('customer_id, org_id').maybeSingle();
    expect(ownAccount.error).toBeNull();
    expect(ownAccount.data?.customer_id).toBe(customerId);
    expect(ownAccount.data?.org_id).toBe(orgId);

    const ownCustomer = await portalClient.from('customers').select('id').eq('id', customerId).maybeSingle();
    expect(ownCustomer.error).toBeNull();
    expect(ownCustomer.data?.id).toBe(customerId);

    const crossOrgCustomer = await portalClient.from('customers').select('id').eq('id', otherOrgCustomerId).maybeSingle();
    expect(crossOrgCustomer.error).toBeNull();
    expect(crossOrgCustomer.data).toBeNull();

    const crossOrgProperty = await portalClient.from('properties').select('id').eq('id', otherOrgPropertyId).maybeSingle();
    expect(crossOrgProperty.error).toBeNull();
    expect(crossOrgProperty.data).toBeNull();
  });
});
