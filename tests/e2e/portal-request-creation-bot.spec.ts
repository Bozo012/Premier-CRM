/**
 * portal-request-creation-bot: coverage for create_portal_service_request()
 * (supabase/migrations/20260810120000_create_portal_service_request_rpc.sql)
 * — the guarded SECURITY DEFINER RPC that is now the *only* path for a
 * signed-in portal customer to create a real service_requests row, added
 * as the deliberate follow-up 20260803080000_harden_service_requests_
 * estimates_site_visits.sql explicitly called for after it revoked
 * INSERT/UPDATE/DELETE on service_requests from `authenticated` and dropped
 * customer_insert_own_portal_service_requests.
 *
 * The single most important assertion in this file is the regression proof
 * that direct authenticated `.from('service_requests').insert(...)` still
 * fails — proving this slice did not quietly reopen the hardened table.
 *
 * Uses the same self-contained service-role fixture pattern as
 * portal-completion-base44-shell-bot.spec.ts / site-visit-undo-start-
 * bot.spec.ts: a dedicated org/customer/property/portal-user created and
 * torn down per run, then a real signed-in client (never service-role)
 * calls the RPC so its own auth.uid()-based checks are exercised for real.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { createPortalServiceRequest } from '@premier/db';

import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { loginAsPortalCustomer } from './utils/auth';
import { routes } from './utils/selectors';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasServiceRoleCleanupCredentials();
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) not set in .env.test';

interface PortalRequestFixture {
  orgId: string;
  customerId: string;
  propertyId: string;
  otherCustomerId: string;
  otherPropertyId: string;
  userId: string;
  email: string;
  password: string;
  userClient: SupabaseClient<Database>;
}

async function buildFixture(admin: SupabaseClient<Database>): Promise<PortalRequestFixture> {
  const suffix = uniqueSuffix();
  // Reuses the shared demonstration org (matching portal-completion-base44-
  // shell-bot.spec.ts's own established fix for this exact issue) rather
  // than creating a fresh one: the real /portal/handoff/sign-in route's
  // ensureCustomerAccount() (apps/web/lib/customer-portal-account.ts)
  // always resolves/creates the customer_accounts row under a hardcoded
  // PREMIER_ORG_ID, regardless of what org a directly-inserted fixture row
  // used — a fresh random org here would get silently overwritten the
  // moment loginAsPortalCustomer() drives the real browser login, which is
  // exactly what happened before this fix (test 7 failed because the
  // fixture's customer_accounts row got reassigned to the demo org's own
  // customer, orphaning the requests created against the random org).
  const orgId = process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

  const { data: customer } = await admin
    .from('customers')
    .insert({
      org_id: orgId,
      type: 'residential',
      first_name: E2E_TEST_PREFIX,
      last_name: 'PortalRequestFixture',
      email: `${E2E_TEST_PREFIX.toLowerCase()}.portal.request.${suffix}@example.com`,
      source: 'customer_portal',
    })
    .select('id')
    .single();
  const customerId = customer!.id;

  const { data: property } = await admin
    .from('properties')
    .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} Portal Request Way`, city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
    .select('id')
    .single();
  const propertyId = property!.id;
  await admin.from('customer_properties').insert({ customer_id: customerId, property_id: propertyId, relationship: 'owner', is_primary: true });

  // A second, unrelated customer + property to prove ownership rejection.
  const { data: otherCustomer } = await admin
    .from('customers')
    .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'OtherPortalCustomer', source: 'manual_staff_entry' })
    .select('id')
    .single();
  const otherCustomerId = otherCustomer!.id;

  const { data: otherProperty } = await admin
    .from('properties')
    .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} Other Customer Way`, city: 'Testville', state: 'NY', zip: '10002', country: 'US' })
    .select('id')
    .single();
  const otherPropertyId = otherProperty!.id;
  await admin.from('customer_properties').insert({ customer_id: otherCustomerId, property_id: otherPropertyId, relationship: 'owner', is_primary: true });

  const email = `${E2E_TEST_PREFIX.toLowerCase()}.portal.request.${suffix}@example.com`;
  const password = `${E2E_TEST_PREFIX}Password_${suffix}`;
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created!.user!.id;
  await admin.from('customer_accounts').insert({
    org_id: orgId,
    customer_id: customerId,
    auth_user_id: userId,
    email,
    status: 'active',
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
  });

  const userClient = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { orgId, customerId, propertyId, otherCustomerId, otherPropertyId, userId, email, password, userClient };
}

async function teardownFixture(admin: SupabaseClient<Database>, fixture: PortalRequestFixture): Promise<void> {
  // orgId is the SHARED demonstration org here (see buildFixture) — every
  // delete below is scoped by this fixture's own specific customer/property
  // ids, never by org_id, so this can never touch another test's or the
  // demo org's own real data. The organization row itself is never deleted.
  await admin.from('service_requests').delete().eq('customer_id', fixture.customerId);
  await admin.from('service_requests').delete().eq('customer_id', fixture.otherCustomerId);
  await admin.from('customer_accounts').delete().eq('customer_id', fixture.customerId);
  await admin.from('customer_properties').delete().eq('customer_id', fixture.customerId);
  await admin.from('customer_properties').delete().eq('customer_id', fixture.otherCustomerId);
  if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId);
  await admin.from('properties').delete().eq('id', fixture.propertyId);
  await admin.from('properties').delete().eq('id', fixture.otherPropertyId);
  await admin.from('customers').delete().eq('id', fixture.customerId);
  await admin.from('customers').delete().eq('id', fixture.otherCustomerId);
}

test.describe('portal request creation bot (create_portal_service_request RPC)', () => {
  let admin: SupabaseClient<Database>;
  let fixture: PortalRequestFixture;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();
    fixture = await buildFixture(admin);
  });

  test.afterAll(async () => {
    if (!canRun() || !fixture) return;
    await teardownFixture(admin, fixture);
  });

  test('1. a linked customer can create a request with no property, landing in status=new with the correct org_id/customer_id', async () => {
    const title = `${E2E_TEST_PREFIX} No-property request ${uniqueSuffix()}`;
    const result = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: title,
      serviceDescription: 'Fixture request with no property attached.',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe('new');
    expect(result.data.requestNumber).toBeTruthy();

    const { data: row } = await admin
      .from('service_requests')
      .select('org_id, customer_id, property_id, source, status, priority, service_title, internal_notes')
      .eq('id', result.data.serviceRequestId)
      .single();

    expect(row?.org_id).toBe(fixture.orgId);
    expect(row?.customer_id).toBe(fixture.customerId);
    expect(row?.property_id).toBeNull();
    expect(row?.source).toBe('portal');
    expect(row?.status).toBe('new');
    expect(row?.priority).toBe('normal');
    expect(row?.service_title).toBe(title);
    expect(row?.internal_notes).toBeNull();
  });

  test('2. an owned property succeeds and its address is snapshotted onto the request', async () => {
    const result = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: `${E2E_TEST_PREFIX} Owned-property request ${uniqueSuffix()}`,
      serviceDescription: 'Fixture request tied to the customer own property.',
      propertyId: fixture.propertyId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const { data: row } = await admin
      .from('service_requests')
      .select('property_id, property_address_line_1, property_city')
      .eq('id', result.data.serviceRequestId)
      .single();

    expect(row?.property_id).toBe(fixture.propertyId);
    expect(row?.property_address_line_1).toBe(`${E2E_TEST_PREFIX} Portal Request Way`);
    expect(row?.property_city).toBe('Testville');
  });

  test("3. another customer's property_id is rejected with a clear error, not a silent success", async () => {
    const result = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: `${E2E_TEST_PREFIX} Cross-customer property attempt ${uniqueSuffix()}`,
      serviceDescription: 'Should be rejected: property belongs to a different customer.',
      propertyId: fixture.otherPropertyId,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('does not belong to your account');
  });

  test('4. missing title/description are rejected by the RPC itself (defense in depth beyond the action-layer Zod check)', async () => {
    const missingTitle = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: '',
      serviceDescription: 'Has a description but no title.',
    });
    expect(missingTitle.success).toBe(false);

    const missingDescription = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: 'Has a title but no description',
      serviceDescription: '',
    });
    expect(missingDescription.success).toBe(false);
  });

  test('5. unauthenticated RPC execution is rejected', async () => {
    const anonClient = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await createPortalServiceRequest(anonClient, {
      serviceTitle: `${E2E_TEST_PREFIX} Anonymous attempt ${uniqueSuffix()}`,
      serviceDescription: 'Should be rejected: no session at all.',
    });

    expect(result.success).toBe(false);
  });

  test('6. direct authenticated .from(service_requests).insert(...) still fails — the hardening migration is not reopened', async () => {
    const { error } = await fixture.userClient.from('service_requests').insert({
      org_id: fixture.orgId,
      customer_id: fixture.customerId,
      contact_name: 'Direct insert attempt',
      service_title: `${E2E_TEST_PREFIX} Direct insert should fail ${uniqueSuffix()}`,
      service_description: 'This row must never be created — INSERT is revoked from authenticated.',
    });

    expect(error).not.toBeNull();
  });

  test('7. the created request appears in the portal own requests list after creation (real browser render, via /portal/requests)', async ({
    page,
  }) => {
    const title = `${E2E_TEST_PREFIX} Visible-in-list request ${uniqueSuffix()}`;
    const result = await createPortalServiceRequest(fixture.userClient, {
      serviceTitle: title,
      serviceDescription: 'Fixture request that must show up in the portal requests list.',
    });
    expect(result.success).toBe(true);

    const client = createGuardedServiceClient();
    await loginAsPortalCustomer(page, client, fixture.email, fixture.password);

    await page.goto(routes.portalRequests);
    await expect(page.getByText(title)).toBeVisible();
  });
});
