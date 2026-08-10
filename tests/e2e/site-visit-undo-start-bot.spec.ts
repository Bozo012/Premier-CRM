/**
 * site-visit-undo-start-bot: proves the fix for a real defect —
 * undo_site_visit_start() (migration 20260802020200_site_visit_lifecycle_rpcs.sql)
 * always correctly guarded and cleared started_at/started_by when reverting
 * an accidental start, but its own UPDATE ... SET status = 'scheduled' was
 * unconditionally rejected by enforce_site_visit_transitions()
 * (20260802010200_site_visit_status_and_table.sql), which never allowed
 * in_progress -> scheduled. Migration 20260810115335_allow_site_visit_undo_start_transition
 * adds exactly that one transition to the trigger's allow-list.
 *
 * Uses the same self-contained service-role + real-authenticated-session
 * fixture pattern as invoice-totals-recalc-bot.spec.ts (a dedicated org/
 * customer/property/user created and torn down per run, then a real signed-
 * in client — not service-role — calls the RPCs so enforce_site_visit_
 * transitions()'s SECURITY DEFINER auth.uid() checks and schedule_site_visit/
 * start_site_visit/undo_site_visit_start's own role checks are exercised for
 * real, not bypassed).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { scheduleSiteVisit, startSiteVisit, undoSiteVisitStart } from '@premier/db';

const canRun = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('site visit undo-start lifecycle bot', () => {
  let admin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let orgId: string;
  let customerId: string;
  let propertyId: string;
  let userId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_SITE_VISIT_UNDO_START_ORG', slug: `e2e-sv-undo-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'SVUndo', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 SV Undo Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const email = `e2e-sv-undo-${Date.now()}@example.com`;
    const password = `SVUndo_${Math.random().toString(36).slice(2)}!1`;
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = created!.user!.id;
    await admin.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner', status: 'active' });

    userClient = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  test.afterAll(async () => {
    if (!admin) return;
    // site_visit_appointments has no ON DELETE CASCADE from site_visits —
    // must be deleted first or the site_visits delete silently fails
    // (the JS client's .delete() doesn't throw on a returned FK error).
    await admin.from('site_visit_appointments').delete().eq('org_id', orgId);
    await admin.from('site_visits').delete().eq('org_id', orgId);
    await admin.from('service_requests').delete().eq('org_id', orgId);
    await admin.from('org_members').delete().eq('org_id', orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function createAwaitingSchedulingVisit(): Promise<string> {
    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        customer_id: customerId,
        property_id: propertyId,
        contact_name: 'SV Undo Fixture',
        service_title: 'Undo-start fixture request',
        service_description: 'Fixture request for undo-start lifecycle test.',
      })
      .select('id')
      .single();
    const { data: visit } = await admin
      .from('site_visits')
      .insert({ org_id: orgId, service_request_id: request!.id, status: 'awaiting_scheduling' })
      .select('id')
      .single();
    return visit!.id;
  }

  test('1-4. schedule -> start -> undo start: real transition succeeds, started_at/started_by cleared, findings-immutability guard preserved', async () => {
    const visitId = await createAwaitingSchedulingVisit();

    const scheduled = await scheduleSiteVisit(userClient, {
      siteVisitId: visitId,
      start: new Date(Date.now() + 3600_000).toISOString(),
      end: new Date(Date.now() + 7200_000).toISOString(),
    });
    expect(scheduled.success).toBe(true);

    const started = await startSiteVisit(userClient, visitId);
    expect(started.success).toBe(true);

    const midState = await admin.from('site_visits').select('status, started_at, started_by').eq('id', visitId).single();
    expect(midState.data?.status).toBe('in_progress');
    expect(midState.data?.started_at).not.toBeNull();
    expect(midState.data?.started_by).toBe(userId);

    // The real fix under test: this call previously always failed with
    // "Illegal site_visits status transition: in_progress -> scheduled"
    // even though undo_site_visit_start()'s own guards were correct.
    const undone = await undoSiteVisitStart(userClient, visitId);
    expect(undone.success).toBe(true);

    const finalState = await admin.from('site_visits').select('status, started_at, started_by').eq('id', visitId).single();
    expect(finalState.data?.status).toBe('scheduled');
    expect(finalState.data?.started_at).toBeNull();
    expect(finalState.data?.started_by).toBeNull();
  });

  test('5. undo start is idempotent when already scheduled', async () => {
    const visitId = await createAwaitingSchedulingVisit();
    await scheduleSiteVisit(userClient, {
      siteVisitId: visitId,
      start: new Date(Date.now() + 3600_000).toISOString(),
      end: new Date(Date.now() + 7200_000).toISOString(),
    });

    const result = await undoSiteVisitStart(userClient, visitId);
    expect(result.success).toBe(true);

    const state = await admin.from('site_visits').select('status').eq('id', visitId).single();
    expect(state.data?.status).toBe('scheduled');
  });

  test('6. undo start is rejected once inspection findings have been saved', async () => {
    const visitId = await createAwaitingSchedulingVisit();
    await scheduleSiteVisit(userClient, {
      siteVisitId: visitId,
      start: new Date(Date.now() + 3600_000).toISOString(),
      end: new Date(Date.now() + 7200_000).toISOString(),
    });
    await startSiteVisit(userClient, visitId);
    await admin.from('site_visits').update({ inspection_responses: { note: 'findings saved' } }).eq('id', visitId);

    const result = await undoSiteVisitStart(userClient, visitId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot undo start');
    }
  });

  test('7. the trigger still rejects an actually-illegal transition (in_progress -> awaiting_scheduling), proving the fix is additive, not a loosened guard', async () => {
    const visitId = await createAwaitingSchedulingVisit();
    await scheduleSiteVisit(userClient, {
      siteVisitId: visitId,
      start: new Date(Date.now() + 3600_000).toISOString(),
      end: new Date(Date.now() + 7200_000).toISOString(),
    });
    await startSiteVisit(userClient, visitId);

    const { error } = await admin.from('site_visits').update({ status: 'awaiting_scheduling' }).eq('id', visitId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('Illegal site_visits status transition');

    const state = await admin.from('site_visits').select('status').eq('id', visitId).single();
    expect(state.data?.status).toBe('in_progress');
  });
});
