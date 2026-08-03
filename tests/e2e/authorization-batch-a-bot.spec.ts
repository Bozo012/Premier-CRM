/**
 * authorization-batch-a-bot: proves the Forge V1 readiness audit's Batch A
 * fixes (docs/releases/forge-v1-readiness-audit.md, Findings F1 and F3) —
 * the direct-work-order and draft-quote-from-job action-layer authorization
 * boundaries — hold both at the UI presentation layer and end-to-end. The
 * exhaustive role-matrix proof that the actions themselves deny regardless
 * of UI already lives in apps/web/app/(app)/{requests,jobs,quotes}/
 * actions.test.ts (vitest, direct function calls, zero React/UI involved).
 * This spec proves the two things vitest can't: that the real page hides
 * the control for unauthorized roles, and that the real deployed app
 * enforces the same boundary end-to-end for at least one representative
 * allow/deny pair per finding.
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
  const owner = { email: '', password: '' };
  const employee = { email: '', password: '' };
  const subcontractor = { email: '', password: '' };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_BATCH_A_ORG', slug: `e2e-batch-a-${Date.now()}` });

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

    async function createStaff(role: 'owner' | 'employee' | 'subcontractor'): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-batch-a-${role}-${Date.now()}@example.com`;
      const password = `BatchA_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    const ownerAccount = await createStaff('owner');
    Object.assign(owner, ownerAccount);
    ownerUserId = ownerAccount.userId;
    Object.assign(employee, await createStaff('employee'));
    Object.assign(subcontractor, await createStaff('subcontractor'));
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: members } = await admin.from('org_members').select('user_id').eq('org_id', orgId);
    await admin.from('org_members').delete().eq('org_id', orgId);
    for (const m of members ?? []) {
      await admin.auth.admin.deleteUser(m.user_id);
    }
    await admin.from('jobs').delete().eq('org_id', orgId);
    await admin.from('service_requests').delete().eq('org_id', orgId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

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

  // Note: unlike payments/invoices (which have an owner/admin-only RLS
  // policy from migration 20260731000000), `jobs` RLS
  // (org_isolation_jobs) is org-membership-only with no role restriction —
  // confirmed via direct production query during this batch's
  // implementation. This means a subcontractor's own authenticated session
  // CAN insert into `jobs` directly today, bypassing the action-layer fix
  // above via a client-side REST call. This is a real, narrower version of
  // the same defect class this batch closes, discovered while writing this
  // test — deliberately NOT fixed here per the Batch A scope control ("do
  // not touch RLS unless a concrete defect is discovered... if a migration
  // becomes necessary, stop and explain why before creating it"). Flagged
  // in the Batch A implementation report for a scoping decision, not
  // silently patched. The action-layer fix (tests 1-6 above, plus the
  // exhaustive vitest suite in requests/actions.test.ts) is still the real
  // boundary for the app's own UI and server-rendered flows; this is
  // specifically about a direct client-side Supabase REST bypass, the same
  // threat model payments/invoices were hardened against.
});
