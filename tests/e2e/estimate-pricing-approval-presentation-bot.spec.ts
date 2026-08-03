/**
 * estimate-pricing-approval-presentation-bot: proves the fix for a real UX
 * defect found during Kevin's Demo UI observation — the estimate detail
 * page rendered an active "Approve pricing" button to roles lacking
 * canApproveEstimatePricing, and clicking it surfaced the raw internal RPC
 * error text ("Role does not have canApproveEstimatePricing"). The backend
 * boundary was never wrong (already proven by
 * request-site-visit-workflow-bot.spec.ts test 6); this is a presentation
 * fix, proven here via real page navigation as real signed-in accounts.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials, loginAs } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('estimate pricing-approval presentation bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let estimateId: string;
  let siteVisitId: string;
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
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_PRICING_PRESENTATION_ORG', slug: `e2e-pricing-presentation-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'Presentation', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Presentation Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();

    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: customer!.id,
        property_id: property!.id,
        contact_name: 'Presentation Fixture',
        property_address_line_1: '1 Presentation Way',
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'Fixture request',
        service_description: 'Fixture request for pricing-approval presentation bot.',
        triage_decision: 'site_visit_required',
      })
      .select('id')
      .single();

    const { data: visit } = await admin
      .from('site_visits')
      .insert({ org_id: orgId, service_request_id: request!.id, status: 'completed' })
      .select('id')
      .single();
    siteVisitId = visit!.id;

    const { data: estimate } = await admin
      .from('estimates')
      .insert({ org_id: orgId, customer_id: customer!.id, property_id: property!.id, title: 'Presentation fixture estimate', service_request_id: request!.id, source_site_visit_id: siteVisitId })
      .select('id')
      .single();
    estimateId = estimate!.id;
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimateId, description: 'Fixture line', quantity: 1, unit_price: 100 });

    async function createStaff(role: 'owner' | 'employee' | 'subcontractor'): Promise<{ email: string; password: string }> {
      const email = `e2e-pricing-presentation-${role}-${Date.now()}@example.com`;
      const password = `Presentation_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      return { email, password };
    }

    Object.assign(owner, await createStaff('owner'));
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
    await admin.from('organizations').delete().eq('id', orgId);
  });

  test('1. owner sees an actionable "Approve pricing" control', async ({ page }) => {
    await loginAs(page, owner);
    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByRole('button', { name: /approve pricing/i })).toBeVisible();
  });

  test('2. employee does NOT see an actionable approval control, sees plain-language waiting status instead', async ({ page }) => {
    await loginAs(page, employee);
    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByRole('button', { name: /approve pricing/i })).toHaveCount(0);
    await expect(page.getByText(/waiting for owner approval/i)).toBeVisible();
    await expect(page.getByText(/must be approved by an owner or administrator/i)).toBeVisible();
    // Never leak the internal capability identifier into the page.
    await expect(page.getByText('canApproveEstimatePricing')).toHaveCount(0);
  });

  test('3. subcontractor does NOT see an actionable approval control either', async ({ page }) => {
    await loginAs(page, subcontractor);
    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByRole('button', { name: /approve pricing/i })).toHaveCount(0);
    await expect(page.getByText(/waiting for owner approval/i)).toBeVisible();
  });

  test('4. direct RPC invocation is still rejected for employee/subcontractor regardless of UI presentation', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const employeeClient = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await employeeClient.auth.signInWithPassword({ email: employee.email, password: employee.password });
    const { error } = await employeeClient.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
    expect(error).not.toBeNull();

    const { data: estimateAfter } = await admin.from('estimates').select('pricing_reviewed_at').eq('id', estimateId).single();
    expect(estimateAfter?.pricing_reviewed_at).toBeNull();
  });

  test('5. a site-visit-generated estimate shows a source-visit summary instead of the legacy "Schedule site visit" control', async ({ page }) => {
    await loginAs(page, owner);
    await page.goto(`/estimates/${estimateId}`);
    await expect(page.getByRole('button', { name: /schedule site visit/i })).toHaveCount(0);
    await expect(page.getByText(/generated from completed site visit/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /view site visit/i })).toHaveAttribute('href', `/site-visits/${siteVisitId}`);
  });
});
