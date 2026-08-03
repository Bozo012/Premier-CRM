/**
 * today-action-queue-bot: proves the role-aware "Needs your attention"
 * action queue added to the Today page after Kevin's Demo UI observation.
 * Each task type is capability-gated (not just role-name-gated) and
 * disappears the instant it's no longer actionable — no separate
 * dismissal state to fall out of sync with reality.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { getTodayActionItems } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('today action queue bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;
  let reviewerUserId: string;

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
      { id: orgId, name: 'E2E_ACTION_QUEUE_ORG', slug: `e2e-action-queue-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_ACTION_QUEUE_OTHER_ORG', slug: `e2e-action-queue-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin.from('customers').insert({ org_id: orgId, type: 'residential', first_name: 'Queue', last_name: 'Fixture', source: 'manual_staff_entry' }).select('id').single();
    customerId = customer!.id;
    const { data: property } = await admin.from('properties').insert({ org_id: orgId, address_line_1: '1 Queue Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' }).select('id').single();
    propertyId = property!.id;

    const { data: reviewer } = await admin.auth.admin.createUser({ email: `e2e-action-queue-reviewer-${Date.now()}@example.com`, password: `Reviewer_${Math.random().toString(36).slice(2)}!1`, email_confirm: true });
    reviewerUserId = reviewer!.user!.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    for (const id of [orgId, otherOrgId]) await admin.from('organizations').delete().eq('id', id);
    if (reviewerUserId) await admin.auth.admin.deleteUser(reviewerUserId);
  });

  async function createEstimate(): Promise<string> {
    const { data: estimate } = await admin.from('estimates').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Queue fixture estimate' }).select('id').single();
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimate!.id, description: 'Line', quantity: 1, unit_price: 100 });
    return estimate!.id;
  }

  test('1. owner sees a pending pricing-review task; employee does not', async () => {
    const estimateId = await createEstimate();
    await admin.from('estimates').update({ pricing_review_status: 'pending_review', pricing_review_requested_at: new Date().toISOString() }).eq('id', estimateId);

    const ownerResult = await getTodayActionItems(admin, { orgId, role: 'owner' });
    expect(ownerResult.success).toBe(true);
    if (ownerResult.success) {
      const task = ownerResult.data.find((i) => i.kind === 'pricing_review_requested' && i.estimateId === estimateId);
      expect(task).toBeTruthy();
    }

    const employeeResult = await getTodayActionItems(admin, { orgId, role: 'employee' });
    expect(employeeResult.success).toBe(true);
    if (employeeResult.success) {
      const task = employeeResult.data.find((i) => i.kind === 'pricing_review_requested');
      expect(task).toBeUndefined();
    }
  });

  test('2. approving pricing removes the owner review task', async () => {
    const estimateId = await createEstimate();
    await admin.from('estimates').update({ pricing_review_status: 'pending_review', pricing_review_requested_at: new Date().toISOString() }).eq('id', estimateId);

    let ownerResult = await getTodayActionItems(admin, { orgId, role: 'owner' });
    expect(ownerResult.success && ownerResult.data.some((i) => i.kind === 'pricing_review_requested' && i.estimateId === estimateId)).toBe(true);

    await admin.from('estimates').update({ pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: reviewerUserId, pricing_review_status: null }).eq('id', estimateId);

    ownerResult = await getTodayActionItems(admin, { orgId, role: 'owner' });
    expect(ownerResult.success).toBe(true);
    if (ownerResult.success) {
      expect(ownerResult.data.some((i) => i.kind === 'pricing_review_requested' && i.estimateId === estimateId)).toBe(false);
    }
  });

  test('3. returning for changes removes the owner review task', async () => {
    const estimateId = await createEstimate();
    await admin.from('estimates').update({ pricing_review_status: 'pending_review', pricing_review_requested_at: new Date().toISOString() }).eq('id', estimateId);
    await admin.from('estimates').update({ pricing_review_status: 'changes_requested', pricing_review_changes_requested_note: 'Fix it' }).eq('id', estimateId);

    const ownerResult = await getTodayActionItems(admin, { orgId, role: 'owner' });
    expect(ownerResult.success).toBe(true);
    if (ownerResult.success) {
      expect(ownerResult.data.some((i) => i.kind === 'pricing_review_requested' && i.estimateId === estimateId)).toBe(false);
    }
  });

  test('4. an approved estimate (no quote yet) creates a Create-quote task for employee/owner', async () => {
    const { data: request } = await admin
      .from('service_requests')
      .insert({ org_id: orgId, source: 'website', status: 'reviewing', priority: 'normal', customer_id: customerId, property_id: propertyId, contact_name: 'Fixture', property_address_line_1: '1 Queue Way', property_city: 'Testville', property_state: 'NY', property_zip: '10001', property_country: 'US', service_title: 'Fixture', service_description: 'Fixture.', triage_decision: 'remote_estimate' })
      .select('id')
      .single();
    const { data: estimate } = await admin.from('estimates').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Approved fixture', service_request_id: request!.id, pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: reviewerUserId }).select('id').single();
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimate!.id, description: 'Line', quantity: 1, unit_price: 50 });

    const employeeResult = await getTodayActionItems(admin, { orgId, role: 'employee' });
    expect(employeeResult.success).toBe(true);
    if (employeeResult.success) {
      expect(employeeResult.data.some((i) => i.kind === 'create_quote' && i.estimateId === estimate!.id)).toBe(true);
    }

    const subcontractorResult = await getTodayActionItems(admin, { orgId, role: 'subcontractor' });
    expect(subcontractorResult.success).toBe(true);
    if (subcontractorResult.success) {
      expect(subcontractorResult.data.some((i) => i.kind === 'create_quote')).toBe(false);
    }
  });

  test('5. once a quote exists for the estimate, the Create-quote task disappears; a draft quote creates a Send-quote task', async () => {
    const { data: request } = await admin
      .from('service_requests')
      .insert({ org_id: orgId, source: 'website', status: 'reviewing', priority: 'normal', customer_id: customerId, property_id: propertyId, contact_name: 'Fixture', property_address_line_1: '1 Queue Way', property_city: 'Testville', property_state: 'NY', property_zip: '10001', property_country: 'US', service_title: 'Fixture', service_description: 'Fixture.', triage_decision: 'remote_estimate' })
      .select('id')
      .single();
    const { data: estimate } = await admin.from('estimates').insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Quoted fixture', service_request_id: request!.id, pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: reviewerUserId }).select('id').single();
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimate!.id, description: 'Line', quantity: 1, unit_price: 75 });

    let result = await getTodayActionItems(admin, { orgId, role: 'employee' });
    expect(result.success && result.data.some((i) => i.kind === 'create_quote' && i.estimateId === estimate!.id)).toBe(true);

    const { data: quote } = await admin.from('quotes').insert({ org_id: orgId, estimate_id: estimate!.id, status: 'draft' }).select('id').single();

    result = await getTodayActionItems(admin, { orgId, role: 'employee' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.some((i) => i.kind === 'create_quote' && i.estimateId === estimate!.id)).toBe(false);
      expect(result.data.some((i) => i.kind === 'send_quote' && i.quoteId === quote!.id)).toBe(true);
    }

    await admin.from('quotes').update({ status: 'sent' }).eq('id', quote!.id);
    result = await getTodayActionItems(admin, { orgId, role: 'employee' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.some((i) => i.kind === 'send_quote' && i.quoteId === quote!.id)).toBe(false);
    }
  });

  test('6. cross-org isolation — tasks in another org never appear', async () => {
    const estimateId = await createEstimate();
    await admin.from('estimates').update({ pricing_review_status: 'pending_review', pricing_review_requested_at: new Date().toISOString() }).eq('id', estimateId);

    const otherOrgResult = await getTodayActionItems(admin, { orgId: otherOrgId, role: 'owner' });
    expect(otherOrgResult.success).toBe(true);
    if (otherOrgResult.success) {
      expect(otherOrgResult.data.some((i) => i.kind === 'pricing_review_requested' && i.estimateId === estimateId)).toBe(false);
    }
  });

  test('7. viewer role sees no actionable tasks at all', async () => {
    const estimateId = await createEstimate();
    await admin.from('estimates').update({ pricing_review_status: 'pending_review', pricing_review_requested_at: new Date().toISOString(), pricing_reviewed_at: null }).eq('id', estimateId);

    const result = await getTodayActionItems(admin, { orgId, role: 'viewer' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});
