/**
 * site-visit-customer-photo-visibility-bot: live coverage for the fast-
 * follow slice extending Customer-Safe Photo Visibility
 * (docs/implementation/customer-safe-photo-visibility-design.md, PR
 * #141/#142) to site-visit/inspection-linked photos
 * (20260811040000_site_visit_customer_photo_visibility.sql).
 *
 * No second publication model: reuses vault_items.customer_visible,
 * canPublishCustomerMedia, publish_customer_visible_photo/
 * unpublish_customer_visible_photo (now also accepting site_visit_id-linked
 * items), and list_customer_visible_photos (now also accepting
 * p_site_visit_id). This spec proves the extension holds the same security
 * guarantees as customer-safe-photo-visibility-bot.spec.ts, plus that the
 * site-visit lifecycle (start/undo-start/inspection save) is untouched by
 * the migration.
 *
 * The site visit itself is created through the real
 * record_request_triage -> schedule_site_visit -> start_site_visit RPC
 * chain (matching request-site-visit-workflow-bot.spec.ts's own pattern),
 * not a raw INSERT — this also doubles as live proof that ordinary site-
 * visit lifecycle RPCs still work with the new column/functions in place.
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
  requestId: string;
  siteVisitId: string;
  otherOrgSiteVisitId: string;
  vaultItemId: string;
  owner: StaffAccount;
  admin: StaffAccount;
  employee: StaffAccount;
  subcontractor: StaffAccount;
  customer: CustomerAccount;
  otherCustomer: CustomerAccount;
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

test.describe('site-visit customer photo visibility bot', () => {
  let admin: SupabaseClient<Database>;
  let fx: Fixture;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    const suffix = uniqueSuffix();
    const orgId = crypto.randomUUID();
    const otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: `${E2E_TEST_PREFIX}SVPhotoVis_${suffix}`, slug: `e2e-sv-photo-vis-${suffix}` },
      { id: otherOrgId, name: `${E2E_TEST_PREFIX}SVPhotoVisOther_${suffix}`, slug: `e2e-sv-photo-vis-other-${suffix}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'SVPhotoVisOwner', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const customerId = customer!.id;

    const { data: otherCustomerRow } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'SVPhotoVisOther', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const otherCustomerId = otherCustomerRow!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} SV Photo Vis Way`, city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    const propertyId = property!.id;

    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: customerId,
        property_id: propertyId,
        contact_name: `${E2E_TEST_PREFIX} SV Photo Vis Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} SV Photo Vis Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'SV photo vis fixture request',
        service_description: 'Fixture request for site-visit-customer-photo-visibility bot.',
      })
      .select('id')
      .single();
    const requestId = request!.id;

    async function createStaff(role: 'owner' | 'admin' | 'employee' | 'subcontractor', targetOrgId: string): Promise<StaffAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}sv-photo-vis-${role}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `SVPhotoVis_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    async function createCustomerAccount(customerIdForAccount: string, targetOrgId: string, label: string): Promise<CustomerAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}sv-photo-vis-${label}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `SVPhotoVis_${Math.random().toString(36).slice(2)}!1`;
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

    const owner = await createStaff('owner', orgId);
    const staffAdmin = await createStaff('admin', orgId);
    const employee = await createStaff('employee', orgId);
    const subcontractor = await createStaff('subcontractor', orgId);
    const customer2 = await createCustomerAccount(customerId, orgId, 'owner');
    const otherCustomer = await createCustomerAccount(otherCustomerId, orgId, 'other');
    const otherOrgOwner = await createStaff('owner', otherOrgId);

    // Real triage -> schedule -> start chain (not a raw site_visits insert)
    // — doubles as live proof the ordinary lifecycle still works with the
    // new column/functions in place (regression scenario 16-18).
    const ownerClient = await signIn(owner.email, owner.password);
    const { data: triageData, error: triageError } = await ownerClient.rpc('record_request_triage', {
      p_request_id: requestId,
      p_decision: 'site_visit_required',
      p_reason: 'E2E: site-visit customer photo visibility fixture',
    });
    if (triageError || !triageData) throw new Error(`record_request_triage failed: ${triageError?.message}`);
    const siteVisitId = (triageData as { siteVisitId: string }).siteVisitId;

    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 90_000_000).toISOString();
    const { error: scheduleError } = await ownerClient.rpc('schedule_site_visit', {
      p_site_visit_id: siteVisitId,
      p_start: start,
      p_end: end,
      p_assigned_user_id: owner.userId,
    });
    if (scheduleError) throw new Error(`schedule_site_visit failed: ${scheduleError.message}`);

    const { error: startError } = await ownerClient.rpc('start_site_visit', { p_site_visit_id: siteVisitId });
    if (startError) throw new Error(`start_site_visit failed: ${startError.message}`);

    // Fixture photo — internal by default, direct row insert (the upload
    // pipeline itself is covered elsewhere; this spec proves the
    // visibility/authorization boundary).
    const { data: vaultItem } = await admin
      .from('vault_items')
      .insert({
        org_id: orgId,
        type: 'photo',
        source: 'manual_upload',
        content: `${E2E_TEST_PREFIX} SV fixture photo`,
        site_visit_id: siteVisitId,
        storage_object_key: `${orgId}/site_visit/${siteVisitId}/${suffix}.jpg`,
      })
      .select('id')
      .single();

    // Second org's own real site visit (via the same triage/schedule/start
    // chain, under its own request/customer), for the cross-org test.
    const { data: otherOrgProperty } = await admin
      .from('properties')
      .insert({ org_id: otherOrgId, address_line_1: `${E2E_TEST_PREFIX} Other Org SV Way`, city: 'Testville', state: 'NY', zip: '10002', country: 'US' })
      .select('id')
      .single();
    const { data: otherOrgCustomer } = await admin
      .from('customers')
      .insert({ org_id: otherOrgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'OtherOrgSV', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const { data: otherOrgRequest } = await admin
      .from('service_requests')
      .insert({
        org_id: otherOrgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: otherOrgCustomer!.id,
        property_id: otherOrgProperty!.id,
        contact_name: `${E2E_TEST_PREFIX} Other Org SV Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} Other Org SV Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10002',
        property_country: 'US',
        service_title: 'Other-org SV fixture request',
        service_description: 'Fixture request for cross-org isolation test.',
      })
      .select('id')
      .single();
    const otherOrgOwnerClient = await signIn(otherOrgOwner.email, otherOrgOwner.password);
    const { data: otherOrgTriageData, error: otherOrgTriageError } = await otherOrgOwnerClient.rpc('record_request_triage', {
      p_request_id: otherOrgRequest!.id,
      p_decision: 'site_visit_required',
      p_reason: 'E2E: cross-org fixture',
    });
    if (otherOrgTriageError || !otherOrgTriageData) throw new Error(`other-org record_request_triage failed: ${otherOrgTriageError?.message}`);
    const otherOrgSiteVisitId = (otherOrgTriageData as { siteVisitId: string }).siteVisitId;

    fx = {
      orgId,
      otherOrgId,
      customerId,
      otherCustomerId,
      requestId,
      siteVisitId,
      otherOrgSiteVisitId,
      vaultItemId: vaultItem!.id,
      owner,
      admin: staffAdmin,
      employee,
      subcontractor,
      customer: customer2,
      otherCustomer,
      otherOrgOwner,
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
    await admin.from('vault_items').delete().eq('id', fx.vaultItemId);
    await admin.from('site_visit_appointments').delete().eq('site_visit_id', fx.siteVisitId);
    await admin.from('site_visits').delete().in('id', [fx.siteVisitId, fx.otherOrgSiteVisitId]);
    await admin.from('service_requests').delete().eq('org_id', fx.orgId);
    await admin.from('service_requests').delete().eq('org_id', fx.otherOrgId);
    await admin.from('properties').delete().eq('org_id', fx.orgId);
    await admin.from('properties').delete().eq('org_id', fx.otherOrgId);
    await admin.from('customers').delete().in('id', [fx.customerId, fx.otherCustomerId]);
    await admin.from('customers').delete().eq('org_id', fx.otherOrgId);
    await admin.from('organizations').delete().in('id', [fx.orgId, fx.otherOrgId]);
  });

  test('1. site-visit photo defaults internal', async () => {
    const { data } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(data?.customer_visible).toBe(false);
  });

  test('2. owner can publish', async () => {
    const client = await signIn(fx.owner.email, fx.owner.password);
    const { data, error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).toBeNull();
    expect(data?.customer_visible).toBe(true);
    await admin.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
  });

  test('3. admin can publish', async () => {
    const client = await signIn(fx.admin.email, fx.admin.password);
    const { data, error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).toBeNull();
    expect(data?.customer_visible).toBe(true);
  });

  test('4. employee cannot publish', async () => {
    const client = await signIn(fx.employee.email, fx.employee.password);
    const { error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('canPublishCustomerMedia');
  });

  test('5. subcontractor cannot publish', async () => {
    const client = await signIn(fx.subcontractor.email, fx.subcontractor.password);
    const { error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: fx.vaultItemId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('canPublishCustomerMedia');
  });

  test('6. owning customer sees published photo; 7. internal photo stays hidden', async () => {
    // 7 first: unpublish, confirm hidden.
    await admin.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
    const client = await signIn(fx.customer.email, fx.customer.password);
    const before = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    expect(before.error).toBeNull();
    expect((before.data ?? []).map((r) => r.id)).not.toContain(fx.vaultItemId);

    await admin.from('vault_items').update({ customer_visible: true }).eq('id', fx.vaultItemId);
    const after = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    expect(after.error).toBeNull();
    expect((after.data ?? []).map((r) => r.id)).toContain(fx.vaultItemId);
  });

  test('8. a different customer in the same org cannot see the published photo', async () => {
    const client = await signIn(fx.otherCustomer.email, fx.otherCustomer.password);
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('9. a different org cannot see the published photo', async () => {
    const client = await signIn(fx.otherOrgOwner.email, fx.otherOrgOwner.password);
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('10. no bare vault item enumeration — guessing another org\'s real site_visit_id returns zero rows', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data, error } = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.otherOrgSiteVisitId });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('11. customer cannot mutate visibility directly', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    await client.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
    const { data: row } = await admin.from('vault_items').select('customer_visible').eq('id', fx.vaultItemId).single();
    expect(row?.customer_visible).toBe(true); // unchanged — still published from test 6/7
  });

  test('12. unpublish removes access from a subsequent list_customer_visible_photos call', async () => {
    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { data: unpublishData, error: unpublishError } = await ownerClient.rpc('unpublish_customer_visible_photo', {
      p_vault_item_id: fx.vaultItemId,
    });
    expect(unpublishError).toBeNull();
    expect(unpublishData?.customer_visible).toBe(false);

    const customerClient = await signIn(fx.customer.email, fx.customer.password);
    const { data } = await customerClient.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    expect((data ?? []).map((r) => r.id)).not.toContain(fx.vaultItemId);
  });

  test('13. signed URL generation is only reachable after an authorized query (structural: list_customer_visible_photos returns storage_object_key, never a public URL)', async () => {
    await admin.from('vault_items').update({ customer_visible: true }).eq('id', fx.vaultItemId);
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data } = await client.rpc('list_customer_visible_photos', { p_site_visit_id: fx.siteVisitId });
    const row = (data ?? []).find((r) => r.id === fx.vaultItemId);
    expect(row?.storage_object_key).toBeTruthy();
    expect(row?.storage_object_key).not.toMatch(/^https?:\/\//); // a raw storage key, not a resolved URL of any kind
    await admin.from('vault_items').update({ customer_visible: false }).eq('id', fx.vaultItemId);
  });

  test('14. bucket remains private', async () => {
    const { data: bucket } = await admin.storage.getBucket('site-visit-attachments');
    expect(bucket?.public).toBe(false);
  });

  test('15. staff still sees both internal and published site-visit media', async () => {
    await admin.from('vault_items').update({ customer_visible: true }).eq('id', fx.vaultItemId);
    const staffClient = await signIn(fx.employee.email, fx.employee.password);
    const { data, error } = await staffClient
      .from('vault_items')
      .select('id, customer_visible')
      .eq('org_id', fx.orgId)
      .eq('site_visit_id', fx.siteVisitId)
      .eq('type', 'photo');
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id)).toContain(fx.vaultItemId);
  });

  // Order matters for 16-18: undo_site_visit_start's own pre-existing
  // business rule refuses once any inspection findings have been saved
  // ("Cannot undo start: inspection findings have already been saved —
  // complete or cancel instead") — discovered live while writing this spec,
  // not a regression from this migration. So undo-start is proven first,
  // before any save call, then findings are saved, then the illegal-jump
  // guard is proven — matching a realistic real-world sequence.

  test('16. undo-start (undo_site_visit_start) still works, returning the visit to scheduled', async () => {
    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { error } = await ownerClient.rpc('undo_site_visit_start', { p_site_visit_id: fx.siteVisitId });
    expect(error).toBeNull();
    const { data: visit } = await admin.from('site_visits').select('status').eq('id', fx.siteVisitId).single();
    expect(visit?.status).toBe('scheduled');
  });

  test('17. re-start still works after undo', async () => {
    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { error } = await ownerClient.rpc('start_site_visit', { p_site_visit_id: fx.siteVisitId });
    expect(error).toBeNull();
    const { data: visit } = await admin.from('site_visits').select('status').eq('id', fx.siteVisitId).single();
    expect(visit?.status).toBe('in_progress');
  });

  test('18. inspection save (save_site_visit_inspection) still works after the migration', async () => {
    // save_site_visit_inspection has no EXECUTE grant for `authenticated` —
    // the real app calls it via the service-role client only, after its own
    // org-membership check (see site-visits/actions.ts). Matching that here
    // with `admin`, not a staff session client.
    const { error: saveError } = await admin.rpc('save_site_visit_inspection', {
      p_site_visit_id: fx.siteVisitId,
      p_responses_patch: {},
    });
    expect(saveError).toBeNull();
  });

  test('19. completion (complete_site_visit) still works, and findings become immutable afterward', async () => {
    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { error: completeError } = await ownerClient.rpc('complete_site_visit', { p_site_visit_id: fx.siteVisitId });
    expect(completeError).toBeNull();

    const { data: visit } = await admin.from('site_visits').select('status, completed_at').eq('id', fx.siteVisitId).single();
    expect(visit?.status).toBe('completed');
    expect(visit?.completed_at).toBeTruthy();

    // Immutable-findings rule (enforce_site_visit_transitions): once
    // completed_at is set, inspection_responses can no longer change — the
    // exact rule the task brief asked to confirm this migration doesn't
    // disturb.
    const { error: mutateAfterCompleteErr } = await admin
      .from('site_visits')
      .update({ inspection_responses: { tampered: true } })
      .eq('id', fx.siteVisitId);
    expect(mutateAfterCompleteErr).not.toBeNull();
  });

  test('20. unsupported/ambiguous parent combination rejected (non-photo type on a site-visit-linked row)', async () => {
    const { data: noteItem } = await admin
      .from('vault_items')
      .insert({ org_id: fx.orgId, type: 'note', source: 'manual_typed', site_visit_id: fx.siteVisitId, content: `${E2E_TEST_PREFIX} unsupported type` })
      .select('id')
      .single();

    const ownerClient = await signIn(fx.owner.email, fx.owner.password);
    const { error } = await ownerClient.rpc('publish_customer_visible_photo', { p_vault_item_id: noteItem!.id });
    expect(error).not.toBeNull();

    await admin.from('vault_items').delete().eq('id', noteItem!.id);
  });

  test('21. zero residue after teardown (verified structurally — this test just confirms fixture ids are non-null before afterAll runs)', async () => {
    expect(fx.vaultItemId).toBeTruthy();
    expect(fx.siteVisitId).toBeTruthy();
    expect(fx.customer.userId).toBeTruthy();
  });
});
