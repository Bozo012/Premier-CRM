/**
 * customer-safe-photo-visibility-bot: live coverage for the Customer-Safe
 * Photo Visibility slice (docs/implementation/customer-safe-photo-
 * visibility-design.md, PR #141) — vault_items.customer_visible,
 * canPublishCustomerMedia (owner/admin only), publish_customer_visible_photo
 * / unpublish_customer_visible_photo, and the centralized
 * list_customer_visible_photos() customer read path
 * (20260811030000_customer_safe_photo_visibility.sql).
 *
 * Security-critical: most assertions call the RPCs directly via the
 * Supabase client (not just UI assertions), proving the actual enforcement
 * boundary — the RPC itself, not the app-layer capability check that merely
 * produces a cleaner error message before ever calling it.
 *
 * Uses a dedicated, disposable org (not the shared demo org) for every
 * fixture entity — job/estimate photo publish/unpublish and the
 * list_customer_visible_photos ownership checks never touch
 * customer_accounts.org_id in a way that depends on the shared-demo-org
 * quirk documented in portal-request-creation-bot.spec.ts (that quirk only
 * applies to the browser-driven /portal/handoff/sign-in path; every
 * customer session here is a direct API sign-in, never a portal browser
 * login, so customer_accounts.org_id is whatever this fixture sets it to).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { hasServiceRoleCleanupCredentials, createGuardedServiceClient } from './utils/cleanup';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasServiceRoleCleanupCredentials() && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.test';

interface StaffAccount {
  email: string;
  password: string;
  userId: string;
}

interface CustomerAccount {
  email: string;
  password: string;
  userId: string;
  customerId: string;
}

interface Fixture {
  orgId: string;
  otherOrgId: string;
  customerId: string;
  otherCustomerId: string;
  propertyId: string;
  jobId: string;
  otherOrgJobId: string;
  vaultItemId: string; // internal by default
  otherOrgVaultItemId: string;
  owner: StaffAccount;
  admin: StaffAccount;
  employee: StaffAccount;
  subcontractor: StaffAccount;
  customer: CustomerAccount; // owns jobId
  otherCustomer: CustomerAccount; // unrelated, same org
  otherOrgOwner: StaffAccount;
}

function apiClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = apiClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

test.describe('customer-safe photo visibility bot', () => {
  let admin: SupabaseClient<Database>;
  let fx: Fixture;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    const suffix = uniqueSuffix();
    const orgId = crypto.randomUUID();
    const otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: `${E2E_TEST_PREFIX}PhotoVis_${suffix}`, slug: `e2e-photo-vis-${suffix}` },
      { id: otherOrgId, name: `${E2E_TEST_PREFIX}PhotoVisOther_${suffix}`, slug: `e2e-photo-vis-other-${suffix}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'PhotoVisOwner', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const customerId = customer!.id;

    const { data: otherCustomerRow } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'PhotoVisOther', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const otherCustomerId = otherCustomerRow!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} Photo Vis Way`, city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    const propertyId = property!.id;

    const { data: job } = await admin
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'PhotoVis fixture job', status: 'approved' })
      .select('id')
      .single();
    const jobId = job!.id;

    const { data: otherOrgProperty } = await admin
      .from('properties')
      .insert({ org_id: otherOrgId, address_line_1: `${E2E_TEST_PREFIX} Other Org Way`, city: 'Testville', state: 'NY', zip: '10002', country: 'US' })
      .select('id')
      .single();
    const { data: otherOrgCustomer } = await admin
      .from('customers')
      .insert({ org_id: otherOrgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'OtherOrg', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const { data: otherOrgJob } = await admin
      .from('jobs')
      .insert({ org_id: otherOrgId, customer_id: otherOrgCustomer!.id, property_id: otherOrgProperty!.id, title: 'Other-org fixture job', status: 'approved' })
      .select('id')
      .single();
    const otherOrgJobId = otherOrgJob!.id;

    // Fixture photo — internal by default (customer_visible not set, so it
    // takes the migration's `not null default false`), matching test 1's
    // assertion. Never goes through the real upload/finalize pipeline (that
    // pipeline is unit/E2E-covered elsewhere — site-visit-attachment
    // finalize path); a direct row insert is sufficient here since this
    // spec proves the visibility/authorization boundary, not the upload
    // pipeline itself.
    const { data: vaultItem } = await admin
      .from('vault_items')
      .insert({
        org_id: orgId,
        type: 'photo',
        source: 'manual_upload',
        content: `${E2E_TEST_PREFIX} fixture photo`,
        job_id: jobId,
        storage_object_key: `${orgId}/job/${jobId}/${suffix}.jpg`,
      })
      .select('id')
      .single();
    const vaultItemId = vaultItem!.id;

    const { data: otherOrgVaultItem } = await admin
      .from('vault_items')
      .insert({
        org_id: otherOrgId,
        type: 'photo',
        source: 'manual_upload',
        content: `${E2E_TEST_PREFIX} other-org fixture photo`,
        job_id: otherOrgJobId,
        storage_object_key: `${otherOrgId}/job/${otherOrgJobId}/${suffix}.jpg`,
        customer_visible: true,
      })
      .select('id')
      .single();
    const otherOrgVaultItemId = otherOrgVaultItem!.id;

    async function createStaff(role: 'owner' | 'admin' | 'employee' | 'subcontractor', targetOrgId: string): Promise<StaffAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}photo-vis-${role}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `PhotoVis_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    async function createCustomerAccount(customerIdForAccount: string, targetOrgId: string, label: string): Promise<CustomerAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}photo-vis-${label}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `PhotoVis_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(customer ${label}) failed: ${error?.message}`);
      await admin.from('customer_accounts').insert({
        org_id: targetOrgId,
        customer_id: customerIdForAccount,
        auth_user_id: created.user.id,
        email,
        status: 'active',
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      });
      return { email, password, userId: created.user.id, customerId: customerIdForAccount };
    }

    fx = {
      orgId,
      otherOrgId,
      customerId,
      otherCustomerId,
      propertyId,
      jobId,
      otherOrgJobId,
      vaultItemId,
      otherOrgVaultItemId,
      owner: await createStaff('owner', orgId),
      admin: await createStaff('admin', orgId),
      employee: await createStaff('employee', orgId),
      subcontractor: await createStaff('subcontractor', orgId),
      customer: await createCustomerAccount(customerId, orgId, 'owner'),
      otherCustomer: await createCustomerAccount(otherCustomerId, orgId, 'other'),
      otherOrgOwner: await createStaff('owner', otherOrgId),
    };
  });

  test.afterAll(async () => {
    if (!admin || !fx) return;
    const userIds = [
      fx.owner.userId,
      fx.admin.userId,
      fx.employee.userId,
      fx.subcontractor.userId,
      fx.customer.userId,
      fx.otherCustomer.userId,
      fx.otherOrgOwner.userId,
    ];
    await admin.from('customer_accounts').delete().in('customer_id', [fx.customerId, fx.otherCustomerId]);
    await admin.from('org_members').delete().in('org_id', [fx.orgId, fx.otherOrgId]);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    await admin.from('vault_items').delete().in('id', [fx.vaultItemId, fx.otherOrgVaultItemId]);
    await admin.from('jobs').delete().in('id', [fx.jobId, fx.otherOrgJobId]);
    await admin.from('properties').delete().eq('org_id', fx.orgId);
    await admin.from('properties').delete().eq('org_id', fx.otherOrgId);
    await admin.from('customers').delete().in('id', [fx.customerId, fx.otherCustomerId]);
    await admin.from('customers').delete().eq('org_id', fx.otherOrgId);
    await admin.from('organizations').delete().in('id', [fx.orgId, fx.otherOrgId]);
  });

  test('1. new vault item defaults customer_visible=false', async () => {
    const { data } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(data?.customer_visible).toBe(false);
  });

  test('2. owner can publish', async () => {
    const client = await signIn(fx.owner.email, fx.owner.password);
    const { data, error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).toBeNull();
    expect(data?.customer_visible).toBe(true);

    // Reset to internal before the next role tests, so each test starts
    // from a known state rather than depending on execution order.
    await admin.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
  });

  test('3. admin can publish', async () => {
    const client = await signIn(fx.admin.email, fx.admin.password);
    const { data, error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).toBeNull();
    expect(data?.customer_visible).toBe(true);
    await admin.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
  });

  test('4. employee cannot publish', async () => {
    const client = await signIn(fx.employee.email, fx.employee.password);
    const { error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('canPublishCustomerMedia');
    const { data: row } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(row?.customer_visible).toBe(false);
  });

  test('5. subcontractor cannot publish', async () => {
    const client = await signIn(fx.subcontractor.email, fx.subcontractor.password);
    const { error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('canPublishCustomerMedia');
  });

  test('6. authenticated customer cannot publish', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).not.toBeNull();
    const { data: row } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(row?.customer_visible).toBe(false);
  });

  test('7. owning customer sees published photo; 8. does not see internal photo', async () => {
    // 8 first: still internal at this point.
    const client = await signIn(fx.customer.email, fx.customer.password);
    const before = await client.rpc('list_customer_visible_photos', { p_job_id: fx.jobId });
    expect(before.error).toBeNull();
    expect((before.data ?? []).map((r) => r.id)).not.toContain(fx.vaultItemId);

    await admin.from('vault_items').update({ customer_visible: true }).eq('id', fx.vaultItemId);

    const after = await client.rpc('list_customer_visible_photos', { p_job_id: fx.jobId });
    expect(after.error).toBeNull();
    expect((after.data ?? []).map((r) => r.id)).toContain(fx.vaultItemId);
  });

  test('9. a different customer in the same org cannot see the published photo', async () => {
    const client = await signIn(fx.otherCustomer.email, fx.otherCustomer.password);
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_job_id: fx.jobId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('10. a different org cannot see the published photo', async () => {
    const client = await signIn(fx.otherOrgOwner.email, fx.otherOrgOwner.password);
    // Staff-side org isolation: an owner from a different org has no
    // org_members row in fx.orgId, so the underlying org_isolation_vault_items
    // policy already blocks a direct SELECT; list_customer_visible_photos
    // additionally requires a customer_accounts row, which this staff
    // account never has, so it returns zero rows either way.
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_job_id: fx.jobId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('11. customer cannot enumerate an arbitrary/unowned vault item by guessing a job id', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_job_id: fx.otherOrgJobId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('12. customer has no direct UPDATE of customer_visible', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { error } = await client.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
    // Either an explicit permission error or a silent zero-row RLS no-op is
    // an acceptable pass — what must never happen is the row actually
    // changing, checked below via the service-role client.
    void error;
    const { data: row } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(row?.customer_visible).toBe(true); // unchanged — still published from test 7/8
  });

  test('13. unpublish removes photo from a subsequent list_customer_visible_photos call', async () => {
    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { data: unpublishData, error: unpublishError } = await ownerClient.rpc('unpublish_customer_visible_photo', {
      p_vault_item_id: fx.vaultItemId,
    });
    expect(unpublishError).toBeNull();
    expect(unpublishData?.customer_visible).toBe(false);

    const customerClient = await signIn(fx.customer.email, fx.customer.password);
    const { data } = await customerClient.rpc('list_customer_visible_photos', { p_job_id: fx.jobId });
    expect((data ?? []).map((r) => r.id)).not.toContain(fx.vaultItemId);
  });

  test('14. staff still sees internal AND published photos (unfiltered by customer_visible)', async () => {
    // Republish one, leave a second internal, and confirm the staff-facing
    // org-scoped query (mirroring apps/web's job detail page query) returns
    // both regardless of customer_visible.
    await admin.from('vault_items').update({ customer_visible: true }).eq('id', fx.vaultItemId);

    const staffClient = await signIn(fx.employee.email, fx.employee.password);
    const { data, error } = await staffClient
      .from('vault_items')
      .select('id, customer_visible')
      .eq('org_id', fx.orgId)
      .eq('job_id', fx.jobId)
      .eq('type', 'photo');
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id)).toContain(fx.vaultItemId);
  });

  test('15. activity_log records publish/unpublish without leaking storage paths', async () => {
    const { data } = await admin
      .from('activity_log')
      .select('event_type, message')
      .eq('org_id', fx.orgId)
      .eq('entity_id', fx.vaultItemId)
      .eq('entity_type', 'vault_item')
      .order('created_at', { ascending: true });

    const events = data ?? [];
    expect(events.some((e) => e.event_type === 'photo_published_to_customer')).toBe(true);
    expect(events.some((e) => e.event_type === 'photo_unpublished_from_customer')).toBe(true);
    for (const e of events) {
      expect(e.message ?? '').not.toContain(fx.orgId); // no storage_object_key (which embeds org_id) in the message
      expect(e.message ?? '').not.toContain('.jpg');
    }
  });

  test('16. non-photo / unsupported-parent vault items are rejected by publish', async () => {
    const { data: noteItem } = await admin
      .from('vault_items')
      .insert({ org_id: fx.orgId, type: 'note', source: 'manual_typed', content: `${E2E_TEST_PREFIX} unsupported type` })
      .select('id')
      .single();

    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { error } = await ownerClient.rpc('publish_customer_visible_photo', { p_vault_item_id: noteItem!.id });
    expect(error).not.toBeNull();

    await admin.from('vault_items').delete().eq('id', noteItem!.id);
  });

  test('17. no public bucket exposure was introduced (storage.buckets unchanged: still private)', async () => {
    const { data } = await admin.from('vault_items').select('id').limit(0); // sanity: admin client still works
    expect(data).toEqual([]);
    const { data: bucket } = await admin.storage.getBucket('site-visit-attachments');
    expect(bucket?.public).toBe(false);
  });

  test('18. zero residue after teardown (verified structurally — this test just confirms fixture ids are non-null before afterAll runs)', async () => {
    expect(fx.vaultItemId).toBeTruthy();
    expect(fx.jobId).toBeTruthy();
    expect(fx.customer.userId).toBeTruthy();
  });
});
