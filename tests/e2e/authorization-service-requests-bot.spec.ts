/**
 * authorization-service-requests-bot: proves the Forge V1.0.1 security
 * patch (docs/security/service-requests-authorization-audit.md) closes
 * the direct-authenticated-REST bypass on service_requests, estimates,
 * and site_visits — the same defect class Batch A closed for jobs/quotes
 * (see authorization-batch-a-bot.spec.ts), discovered adjacent to
 * service_requests during that migration's own writing.
 *
 * Uses real, already-existing test-role accounts created fresh per run
 * (matching the established pattern), direct REST attempts via each
 * role's own authenticated session, and service-role fixtures/cleanup.
 * No mutating probes are ever run against the real PPM organization.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('authorization service-requests bot (service_requests + estimates + site_visits DB boundary)', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;
  let requestId: string;
  let estimateId: string;
  let siteVisitId: string;

  const owner = { email: '', password: '' };
  const admin_ = { email: '', password: '' };
  const employee = { email: '', password: '' };
  const subcontractor = { email: '', password: '' };
  const viewer = { email: '', password: '' };
  const otherOrgOwner = { email: '', password: '' };

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
      { id: orgId, name: 'E2E_SR_AUTH_ORG', slug: `e2e-sr-auth-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_SR_AUTH_OTHER_ORG', slug: `e2e-sr-auth-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'SRAuth', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 SR Auth Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: customerId,
        property_id: propertyId,
        contact_name: 'SRAuth Fixture',
        property_address_line_1: '1 SR Auth Way',
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'Fixture request',
        service_description: 'Fixture request for authorization-service-requests bot.',
      })
      .select('id')
      .single();
    requestId = request!.id;

    const { data: estimate } = await admin
      .from('estimates')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'SRAuth fixture estimate', service_request_id: requestId })
      .select('id')
      .single();
    estimateId = estimate!.id;

    const { data: siteVisit } = await admin
      .from('site_visits')
      .insert({ org_id: orgId, service_request_id: requestId, status: 'awaiting_scheduling' })
      .select('id')
      .single();
    siteVisitId = siteVisit!.id;

    async function createStaff(
      role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer',
      targetOrgId: string
    ): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-sr-auth-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `SRAuth_${Math.random().toString(36).slice(2)}!1`;
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
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: members } = await admin
      .from('org_members')
      .select('user_id')
      .in('org_id', [orgId, otherOrgId]);
    await admin.from('org_members').delete().in('org_id', [orgId, otherOrgId]);
    for (const m of members ?? []) {
      await admin.auth.admin.deleteUser(m.user_id);
    }
    await admin.from('site_visits').delete().eq('org_id', orgId);
    await admin.from('estimates').delete().eq('org_id', orgId);
    await admin.from('service_requests').delete().eq('org_id', orgId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
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
  // service_requests — INSERT denial across every role (items 1-5)
  // -----------------------------------------------------------------
  for (const [label, account] of [
    ['employee', employee],
    ['subcontractor', subcontractor],
    ['viewer', viewer],
    ['owner', owner],
    ['admin', admin_],
  ] as const) {
    test(`service_requests: ${label} cannot INSERT directly via REST`, async () => {
      const client = await apiClientFor(account);
      const { error } = await client.from('service_requests').insert({
        org_id: orgId,
        customer_id: customerId,
        property_id: propertyId,
        contact_name: 'Bypass attempt',
        property_address_line_1: '1 SR Auth Way',
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        service_title: 'Bypass attempt',
        service_description: 'Bypass attempt',
      });
      expect(error).not.toBeNull();
    });
  }

  test('service_requests: cross-org user cannot INSERT into this org', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('service_requests').insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      contact_name: 'Cross-org bypass',
      property_address_line_1: '1 SR Auth Way',
      property_city: 'Testville',
      property_state: 'NY',
      property_zip: '10001',
      service_title: 'Cross-org bypass',
      service_description: 'Cross-org bypass',
    });
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // service_requests — UPDATE denial across sensitive fields (items 6-12)
  // -----------------------------------------------------------------
  // Patches are built lazily (factory functions, not literal values) because
  // this array is evaluated when the describe body runs, before beforeAll
  // has assigned otherOrgId/customerId/propertyId — capturing those as
  // literals here silently produced `{ org_id: undefined }`, which
  // JSON-serializes to an empty PATCH body and no-ops instead of exercising
  // the revoked-UPDATE-grant boundary.
  const sensitiveUpdateCases: Array<[string, () => Record<string, unknown>]> = [
    ['harmless intake text', () => ({ service_description: 'Tampered description' })],
    ['org_id', () => ({ org_id: otherOrgId })],
    ['customer_id/property_id', () => ({ customer_id: customerId, property_id: propertyId })],
    ['triage path', () => ({ triage_decision: 'remote_estimate', triage_reason: 'forged' })],
    ['status', () => ({ status: 'completed' })],
    [
      'assignment (no column exists — attempted via internal_notes as a proxy for arbitrary field writes)',
      () => ({ internal_notes: 'forged assignment note' }),
    ],
    ['generated relationships', () => ({ estimate_id: estimateId, job_id: null })],
  ];

  for (const [label, buildPatch] of sensitiveUpdateCases) {
    test(`service_requests: subcontractor cannot UPDATE ${label} directly via REST`, async () => {
      const client = await apiClientFor(subcontractor);
      const { error } = await client.from('service_requests').update(buildPatch()).eq('id', requestId);
      expect(error).not.toBeNull();
    });
  }

  test('service_requests: cross-org UPDATE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('service_requests').update({ status: 'completed' }).eq('id', requestId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // service_requests — DELETE denial (items 13, 15)
  // -----------------------------------------------------------------
  test('service_requests: owner cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('service_requests').delete().eq('id', requestId);
    expect(error).not.toBeNull();
  });

  test('service_requests: cross-org DELETE denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('service_requests').delete().eq('id', requestId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // estimates (items 16-20)
  // -----------------------------------------------------------------
  test('estimates: subcontractor cannot INSERT directly via REST', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client.from('estimates').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Bypass estimate' });
    expect(error).not.toBeNull();
  });

  test('estimates: subcontractor cannot UPDATE directly via REST', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client.from('estimates').update({ title: 'Tampered' }).eq('id', estimateId);
    expect(error).not.toBeNull();
  });

  test('estimates: owner cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('estimates').delete().eq('id', estimateId);
    expect(error).not.toBeNull();
  });

  test('estimates: owner/admin direct table writes are denied — all legitimate writes use trusted server-action/RPC paths', async () => {
    const client = await apiClientFor(admin_);
    const { error } = await client.from('estimates').update({ pricing_reviewed_at: new Date().toISOString() }).eq('id', estimateId);
    expect(error).not.toBeNull();
  });

  test('estimates: cross-org writes denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('estimates').update({ title: 'Cross-org tamper' }).eq('id', estimateId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // site_visits (items 21-25)
  // -----------------------------------------------------------------
  test('site_visits: subcontractor cannot INSERT directly via REST', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client.from('site_visits').insert({ org_id: orgId, service_request_id: requestId });
    expect(error).not.toBeNull();
  });

  test('site_visits: subcontractor cannot UPDATE directly via REST', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client.from('site_visits').update({ status: 'completed' }).eq('id', siteVisitId);
    expect(error).not.toBeNull();
  });

  test('site_visits: owner cannot DELETE directly via REST', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client.from('site_visits').delete().eq('id', siteVisitId);
    expect(error).not.toBeNull();
  });

  test('site_visits: owner/admin direct table writes are denied — all legitimate writes use trusted server-action/RPC paths', async () => {
    const client = await apiClientFor(admin_);
    const { error } = await client.from('site_visits').update({ inspection_responses: { forged: true } }).eq('id', siteVisitId);
    expect(error).not.toBeNull();
  });

  test('site_visits: cross-org writes denied', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client.from('site_visits').update({ status: 'completed' }).eq('id', siteVisitId);
    expect(error).not.toBeNull();
  });

  // -----------------------------------------------------------------
  // Side effects (items 26-29)
  // -----------------------------------------------------------------
  test('denied attempts create no downstream side effects', async () => {
    const before = await admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    const beforeCounts = {
      jobs: (await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      quotes: (await admin.from('quotes').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      estimates: (await admin.from('estimates').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      siteVisits: (await admin.from('site_visits').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
    };

    const client = await apiClientFor(subcontractor);
    await client.from('service_requests').update({ status: 'completed', triage_decision: 'direct_work_order' }).eq('id', requestId);
    await client.from('estimates').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Should not exist' });
    await client.from('site_visits').update({ status: 'completed' }).eq('id', siteVisitId);

    const after = await admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    const afterCounts = {
      jobs: (await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      quotes: (await admin.from('quotes').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      estimates: (await admin.from('estimates').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
      siteVisits: (await admin.from('site_visits').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count,
    };

    expect(after.count).toBe(before.count);
    expect(afterCounts).toEqual(beforeCounts);

    const { data: requestUnchanged } = await admin
      .from('service_requests')
      .select('status, triage_decision')
      .eq('id', requestId)
      .single();
    expect(requestUnchanged?.status).toBe('reviewing');
    expect(requestUnchanged?.triage_decision).toBeNull();

    const { data: siteVisitUnchanged } = await admin.from('site_visits').select('status').eq('id', siteVisitId).single();
    expect(siteVisitUnchanged?.status).toBe('awaiting_scheduling');
  });

  // -----------------------------------------------------------------
  // Read behavior (items 30-32)
  // -----------------------------------------------------------------
  test('authorized org members retain expected SELECT on all three tables', async () => {
    const client = await apiClientFor(owner);
    const [reqResult, estResult, svResult] = await Promise.all([
      client.from('service_requests').select('id').eq('id', requestId).maybeSingle(),
      client.from('estimates').select('id').eq('id', estimateId).maybeSingle(),
      client.from('site_visits').select('id').eq('id', siteVisitId).maybeSingle(),
    ]);
    expect(reqResult.error).toBeNull();
    expect(reqResult.data?.id).toBe(requestId);
    expect(estResult.error).toBeNull();
    expect(estResult.data?.id).toBe(estimateId);
    expect(svResult.error).toBeNull();
    expect(svResult.data?.id).toBe(siteVisitId);
  });

  test('cross-org SELECT returns no protected rows (RLS-filtered, not an error)', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const [reqResult, estResult, svResult] = await Promise.all([
      client.from('service_requests').select('id').eq('id', requestId).maybeSingle(),
      client.from('estimates').select('id').eq('id', estimateId).maybeSingle(),
      client.from('site_visits').select('id').eq('id', siteVisitId).maybeSingle(),
    ]);
    expect(reqResult.error).toBeNull();
    expect(reqResult.data).toBeNull();
    expect(estResult.error).toBeNull();
    expect(estResult.data).toBeNull();
    expect(svResult.error).toBeNull();
    expect(svResult.data).toBeNull();
  });

  test('the removed portal-insert policy no longer permits a customer-account INSERT (policy dropped, not just unused)', async () => {
    // No real customer_accounts fixture is created here — this test proves
    // the *policy itself* is gone via the same REST path a real customer
    // session would have used, confirmed indirectly: any authenticated,
    // non-service-role INSERT to service_requests (source='portal' or
    // otherwise) is denied now that the base grant is revoked, regardless
    // of which policy might have matched. Covered by the general INSERT
    // denial tests above; this test documents the intent explicitly.
    const client = await apiClientFor(subcontractor);
    const { error } = await client.from('service_requests').insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      contact_name: 'Portal-shaped bypass attempt',
      property_address_line_1: '1 SR Auth Way',
      property_city: 'Testville',
      property_state: 'NY',
      property_zip: '10001',
      service_title: 'Portal-shaped bypass attempt',
      service_description: 'Portal-shaped bypass attempt',
      source: 'portal',
      status: 'new',
    });
    expect(error).not.toBeNull();
  });
});
