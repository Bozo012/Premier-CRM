/**
 * estimate-pricing-review-handoff-bot: proves the employee -> owner/admin
 * pricing-review handoff added after Kevin's Demo UI observation —
 * employees previously had no way to signal an estimate was ready for
 * owner review. State model: pricing_reviewed_at/by remain the sole
 * authority for "approved"; a new pricing_review_status column covers only
 * the pre-approval sub-states (pending_review / changes_requested), never
 * duplicating "approved" (see migration 20260803050000's header comment).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials, loginAs } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('estimate pricing-review handoff bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  const owner = { email: '', password: '', client: undefined as unknown as SupabaseClient<Database> };
  const employee = { email: '', password: '', client: undefined as unknown as SupabaseClient<Database> };
  const subcontractor = { email: '', password: '', client: undefined as unknown as SupabaseClient<Database> };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_PRICING_HANDOFF_ORG', slug: `e2e-pricing-handoff-${Date.now()}` });

    const { data: customer } = await admin.from('customers').insert({ org_id: orgId, type: 'residential', first_name: 'Handoff', last_name: 'Fixture', source: 'manual_staff_entry' }).select('id').single();
    const { data: property } = await admin.from('properties').insert({ org_id: orgId, address_line_1: '1 Handoff Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' }).select('id').single();

    async function createStaff(role: 'owner' | 'employee' | 'subcontractor') {
      const email = `e2e-pricing-handoff-${role}-${Date.now()}@example.com`;
      const password = `Handoff_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      await client.auth.signInWithPassword({ email, password });
      return { email, password, client };
    }

    Object.assign(owner, await createStaff('owner'));
    Object.assign(employee, await createStaff('employee'));
    Object.assign(subcontractor, await createStaff('subcontractor'));
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: members } = await admin.from('org_members').select('user_id').eq('org_id', orgId);
    await admin.from('org_members').delete().eq('org_id', orgId);
    for (const m of members ?? []) await admin.auth.admin.deleteUser(m.user_id);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function createGatedEstimate(): Promise<string> {
    const { data: customer } = await admin.from('customers').select('id').eq('org_id', orgId).limit(1).single();
    const { data: property } = await admin.from('properties').select('id').eq('org_id', orgId).limit(1).single();
    const { data: request } = await admin
      .from('service_requests')
      .insert({ org_id: orgId, source: 'website', status: 'reviewing', priority: 'normal', customer_id: customer!.id, property_id: property!.id, contact_name: 'Fixture', property_address_line_1: '1 Handoff Way', property_city: 'Testville', property_state: 'NY', property_zip: '10001', property_country: 'US', service_title: 'Fixture', service_description: 'Fixture request.', triage_decision: 'site_visit_required' })
      .select('id')
      .single();
    const { data: visit } = await admin.from('site_visits').insert({ org_id: orgId, service_request_id: request!.id, status: 'completed' }).select('id').single();
    const { data: estimate } = await admin
      .from('estimates')
      .insert({ org_id: orgId, customer_id: customer!.id, property_id: property!.id, title: 'Handoff fixture estimate', service_request_id: request!.id, source_site_visit_id: visit!.id })
      .select('id')
      .single();
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimate!.id, description: 'Fixture line', quantity: 1, unit_price: 200 });
    return estimate!.id;
  }

  test('1. employee submits a valid estimate for pricing review; duplicate submission is rejected', async () => {
    const estimateId = await createGatedEstimate();

    const { error } = await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
    expect(error).toBeNull();

    const { data: estimate } = await admin.from('estimates').select('pricing_review_status, pricing_review_requested_at, pricing_review_requested_by').eq('id', estimateId).single();
    expect(estimate?.pricing_review_status).toBe('pending_review');
    expect(estimate?.pricing_review_requested_at).toBeTruthy();

    const { data: log } = await admin.from('activity_log').select('id').eq('entity_id', estimateId).eq('event_type', 'estimate_pricing_review_requested').maybeSingle();
    expect(log).not.toBeNull();

    const { error: duplicateErr } = await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
    expect(duplicateErr).not.toBeNull();
  });

  test('2. line items are locked while pending review, even for admin/service-role writes', async () => {
    const estimateId = await createGatedEstimate();
    await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });

    const { data: line } = await admin.from('estimate_line_items').select('id').eq('estimate_id', estimateId).limit(1).maybeSingle();
    const { error } = await admin.from('estimate_line_items').update({ unit_price: 999 }).eq('id', line!.id);
    expect(error).not.toBeNull();
  });

  test('3. owner cannot return for changes without a note; can with one', async () => {
    const estimateId = await createGatedEstimate();
    await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });

    const { error: emptyNoteErr } = await owner.client.rpc('return_estimate_pricing_for_changes', { p_estimate_id: estimateId, p_note: '' });
    expect(emptyNoteErr).not.toBeNull();

    const { error } = await owner.client.rpc('return_estimate_pricing_for_changes', { p_estimate_id: estimateId, p_note: 'Please double-check labor hours.' });
    expect(error).toBeNull();

    const { data: estimate } = await admin.from('estimates').select('pricing_review_status, pricing_review_changes_requested_note').eq('id', estimateId).single();
    expect(estimate?.pricing_review_status).toBe('changes_requested');
    expect(estimate?.pricing_review_changes_requested_note).toBe('Please double-check labor hours.');

    const { data: log } = await admin.from('activity_log').select('id, message').eq('entity_id', estimateId).eq('event_type', 'estimate_pricing_changes_requested').maybeSingle();
    expect(log?.message).toBe('Please double-check labor hours.');
  });

  test('4. employee can edit line items again once changes are requested, then resubmit', async () => {
    const estimateId = await createGatedEstimate();
    await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
    await owner.client.rpc('return_estimate_pricing_for_changes', { p_estimate_id: estimateId, p_note: 'Fix this.' });

    const { data: line } = await admin.from('estimate_line_items').select('id').eq('estimate_id', estimateId).limit(1).maybeSingle();
    const { error: editErr } = await admin.from('estimate_line_items').update({ unit_price: 250 }).eq('id', line!.id);
    expect(editErr).toBeNull();

    const { error: resubmitErr } = await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
    expect(resubmitErr).toBeNull();

    const { data: estimate } = await admin.from('estimates').select('pricing_review_status, pricing_review_changes_requested_note').eq('id', estimateId).single();
    expect(estimate?.pricing_review_status).toBe('pending_review');
    expect(estimate?.pricing_review_changes_requested_note).toBeNull();
  });

  test('5. owner approves pricing — review status clears, approval is the sole "approved" signal, quote can be created', async () => {
    const estimateId = await createGatedEstimate();
    await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });

    const { error } = await owner.client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
    expect(error).toBeNull();

    const { data: estimate } = await admin.from('estimates').select('pricing_reviewed_at, pricing_review_status').eq('id', estimateId).single();
    expect(estimate?.pricing_reviewed_at).toBeTruthy();
    expect(estimate?.pricing_review_status).toBeNull();

    const { data: quoteId, error: quoteErr } = await employee.client.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
    expect(quoteErr).toBeNull();
    expect(quoteId).toBeTruthy();
  });

  test('6. owner can approve directly without any review ever being requested (existing owner workflow preserved)', async () => {
    const estimateId = await createGatedEstimate();
    const { error } = await owner.client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
    expect(error).toBeNull();
  });

  test('7. subcontractor can submit for review (holds canEditEstimate) but cannot approve or return for changes', async () => {
    const estimateId = await createGatedEstimate();

    const { error: submitErr } = await subcontractor.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
    expect(submitErr).toBeNull();

    const { error: approveErr } = await subcontractor.client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
    expect(approveErr).not.toBeNull();

    const { error: returnErr } = await subcontractor.client.rpc('return_estimate_pricing_for_changes', { p_estimate_id: estimateId, p_note: 'x' });
    expect(returnErr).not.toBeNull();
  });

  test('8. UI: employee sees "Submit for pricing review" on a draft estimate; clicking it updates the page state', async ({ page }) => {
    const estimateId = await createGatedEstimate();
    await loginAs(page, employee);
    await page.goto(`/estimates/${estimateId}`);

    await expect(page.getByRole('button', { name: /submit for pricing review/i })).toBeVisible();
    await page.getByRole('button', { name: /submit for pricing review/i }).click();

    await expect(page.getByText(/waiting for an owner or administrator to review pricing/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /submit for pricing review/i })).toHaveCount(0);
    await expect(page.getByText('canEditEstimate')).toHaveCount(0);
  });

  test('9. UI: owner sees the pending-review submission and can return it for changes with a required note', async ({ page }) => {
    const estimateId = await createGatedEstimate();
    await employee.client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });

    await loginAs(page, owner);
    await page.goto(`/estimates/${estimateId}`);

    await expect(page.getByRole('button', { name: /return for changes/i })).toBeVisible();
    await page.getByRole('button', { name: /return for changes/i }).click();
    await expect(page.getByRole('button', { name: /send back for changes/i })).toBeDisabled();
    await page.getByPlaceholder(/labor hours/i).fill('Please recheck the material quantity.');
    await expect(page.getByRole('button', { name: /send back for changes/i })).toBeEnabled();
    await page.getByRole('button', { name: /send back for changes/i }).click();

    await expect(page.getByText(/changes requested/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Please recheck the material quantity.')).toBeVisible();
  });
});
