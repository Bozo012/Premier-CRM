/**
 * authorization-batch-a-bot: proves the Forge V1 readiness audit's Batch A
 * fixes (docs/releases/forge-v1-readiness-audit.md, Findings F1 and F3) —
 * the direct-work-order and draft-quote-from-job authorization boundaries —
 * hold at three independent layers: the action layer (vitest, see
 * apps/web/app/(app)/{requests,jobs,quotes}/actions.test.ts), the UI
 * presentation layer (tests 1-6 below), and the database layer (tests 7+
 * below, added after the original action-layer-only fix was found
 * insufficient — a signed-in org member's own authenticated Supabase
 * session could still bypass the action entirely via a direct REST
 * INSERT into `jobs`/`quotes`, closed by migration
 * 20260803070000_harden_jobs_and_quote_creation_boundary.sql).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials, loginAs } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('authorization batch A bot (direct work order + draft quote from job)', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let customerId: string;
  let propertyId: string;
  let requestId: string;
  let jobId: string;
  let ownerUserId: string;
  let otherOrgId: string;
  const owner = { email: '', password: '' };
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
      { id: orgId, name: 'E2E_BATCH_A_ORG', slug: `e2e-batch-a-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_BATCH_A_OTHER_ORG', slug: `e2e-batch-a-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'BatchA', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Batch A Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
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
        contact_name: 'BatchA Fixture',
        property_address_line_1: '1 Batch A Way',
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'Fixture request',
        service_description: 'Fixture request for authorization-batch-a bot.',
      })
      .select('id')
      .single();
    requestId = request!.id;

    const { data: job } = await admin
      .from('jobs')
      .insert({
        org_id: orgId,
        customer_id: customerId,
        property_id: propertyId,
        title: 'BatchA fixture job',
        status: 'approved',
      })
      .select('id')
      .single();
    jobId = job!.id;

    async function createStaff(
      role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer',
      targetOrgId: string
    ): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-batch-a-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `BatchA_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    const ownerAccount = await createStaff('owner', orgId);
    Object.assign(owner, ownerAccount);
    ownerUserId = ownerAccount.userId;
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
    await admin.from('jobs').delete().eq('org_id', orgId);
    await admin.from('quotes').delete().eq('org_id', orgId);
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

  test('1. owner sees the "Create work order" control on an untriaged request', async ({ page }) => {
    await loginAs(page, owner);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByRole('button', { name: /create work order/i })).toBeVisible();
  });

  test('2. employee does NOT see the "Create work order" control', async ({ page }) => {
    await loginAs(page, employee);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByRole('button', { name: /create work order/i })).toHaveCount(0);
  });

  test('3. subcontractor does NOT see the "Create work order" control', async ({ page }) => {
    await loginAs(page, subcontractor);
    await page.goto(`/requests/${requestId}`);
    await expect(page.getByRole('button', { name: /create work order/i })).toHaveCount(0);
  });

  test('4. end-to-end: owner clicking "Create work order" actually creates exactly one approved job', async ({ page }) => {
    await loginAs(page, owner);
    await page.goto(`/requests/${requestId}`);
    await page.getByRole('button', { name: /create work order/i }).click();
    // Wait for the action's actual completion signal (the success toast
    // fired from CreateJobButton's useEffect once the server action
    // resolves) rather than the button's transient "Creating work order…"
    // pending-state label (which stops matching the original accessible
    // name immediately on click, before the mutation has committed) or the
    // client-side router.push to /jobs/{id} (which can race with the
    // server action's revalidatePath() re-rendering this same page — a
    // pre-existing timing quirk unrelated to the authorization fix itself).
    await expect(page.getByText(/work order created/i)).toBeVisible({ timeout: 10_000 });

    const { data: requestAfter } = await admin
      .from('service_requests')
      .select('job_id, status')
      .eq('id', requestId)
      .single();
    expect(requestAfter?.job_id).not.toBeNull();
    expect(requestAfter?.status).toBe('approved');

    const { count } = await admin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('created_by', ownerUserId);
    expect(count).toBe(1);
  });

  test('5a. owner sees the "Create draft quote" control on a job with no quotes', async ({ page }) => {
    await loginAs(page, owner);
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole('button', { name: /create draft quote/i })).toBeVisible();
  });

  test('5b. employee sees the "Create draft quote" control on a job with no quotes', async ({ page }) => {
    await loginAs(page, employee);
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole('button', { name: /create draft quote/i })).toBeVisible();
  });

  test('6. subcontractor does NOT see the "Create draft quote" control', async ({ page }) => {
    await loginAs(page, subcontractor);
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole('button', { name: /create draft quote/i })).toHaveCount(0);
  });

  // ---------------------------------------------------------------------
  // Database-boundary regression coverage — added after the action-layer
  // fix above was found insufficient: a signed-in org member's own
  // authenticated Supabase session could still bypass createJobFromRequestAction/
  // createDraftQuoteAction entirely via a direct REST INSERT into
  // `jobs`/`quotes`, since RLS on both tables was org-membership-only with
  // no role restriction (org_isolation_jobs/org_isolation_quotes, both
  // `FOR ALL`). Closed by migration
  // 20260803070000_harden_jobs_and_quote_creation_boundary.sql: REVOKE
  // INSERT/UPDATE/DELETE from `authenticated` on both tables, plus
  // replacing the FOR ALL policy with a SELECT-only one (defense in depth
  // — a future accidental re-GRANT alone would still hit a table with no
  // permissive write policy).
  // ---------------------------------------------------------------------

  test('7. subcontractor cannot INSERT directly into jobs via REST — zero rows created', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Direct REST bypass attempt', status: 'approved' });
    expect(error).not.toBeNull();

    const { count } = await admin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('title', 'Direct REST bypass attempt');
    expect(count).toBe(0);
  });

  test('8. viewer cannot INSERT directly into jobs via REST', async () => {
    const client = await apiClientFor(viewer);
    const { error } = await client
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Viewer bypass attempt', status: 'approved' });
    expect(error).not.toBeNull();
  });

  test('9. employee cannot INSERT directly into jobs via REST (a direct-work-order job requires owner/admin, not just org membership)', async () => {
    const client = await apiClientFor(employee);
    const { error } = await client
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Employee bypass attempt', status: 'approved' });
    expect(error).not.toBeNull();
  });

  test('10. even owner\'s own authenticated session cannot INSERT directly into jobs — the product path is server-action/service-role only, not a direct-write capability for any role', async () => {
    const client = await apiClientFor(owner);
    const { error } = await client
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Owner direct-write attempt', status: 'approved' });
    expect(error).not.toBeNull();
  });

  test('11. cross-org: a member of a different org cannot INSERT a job into this org via REST', async () => {
    const client = await apiClientFor(otherOrgOwner);
    const { error } = await client
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Cross-org bypass attempt', status: 'approved' });
    expect(error).not.toBeNull();
  });

  test('12. subcontractor cannot INSERT directly into quotes via REST', async () => {
    const client = await apiClientFor(subcontractor);
    const { error } = await client
      .from('quotes')
      .insert({ org_id: orgId, job_id: jobId, status: 'draft', title: 'Direct REST quote bypass attempt' });
    expect(error).not.toBeNull();

    const { count } = await admin
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('title', 'Direct REST quote bypass attempt');
    expect(count).toBe(0);
  });

  test('13. denied direct-write attempts leave no job, quote, request mutation, or activity_log row behind', async () => {
    const before = await admin.from('activity_log').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const client = await apiClientFor(subcontractor);
    await client.from('jobs').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Should leave no trace', status: 'approved' });
    await client.from('quotes').insert({ org_id: orgId, job_id: jobId, status: 'draft', title: 'Should leave no trace' });
    const after = await admin.from('activity_log').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    expect(after.count).toBe(before.count);

    const { data: requestUnchanged } = await admin.from('service_requests').select('job_id').eq('id', requestId).single();
    // requestId was already converted by test 4 — assert it wasn't touched again.
    expect(requestUnchanged?.job_id).not.toBeNull();
  });

  test('14. subcontractor cannot UPDATE or DELETE an existing job directly via REST either', async () => {
    // Covers the other two write verbs the same GRANT/RLS pair protects —
    // INSERT is the operation Findings F1/F3 are actually about, but the
    // same org-membership-only policy previously permitted UPDATE/DELETE
    // too, and the migration revokes all three. A future migration that
    // silently re-adds any one of them back for `authenticated` would fail
    // this test (and 7-11 for INSERT specifically), independent of exactly
    // how the grant was restored — this exercises the real write path
    // rather than inspecting catalog metadata, which PostgREST does not
    // expose by default.
    const client = await apiClientFor(subcontractor);
    const { error: updateError } = await client.from('jobs').update({ title: 'Tampered' }).eq('id', jobId);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await client.from('jobs').delete().eq('id', jobId);
    expect(deleteError).not.toBeNull();

    const { data: jobUnchanged } = await admin.from('jobs').select('title').eq('id', jobId).single();
    expect(jobUnchanged?.title).toBe('BatchA fixture job');
  });
});
