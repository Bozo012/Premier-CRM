/**
 * today-kanban-board-semantics-bot: regression coverage for a real
 * production defect (fix/today-kanban-board-semantics) — a persisted site
 * visit ("Kitchen remodel", inspection in progress) disappeared from
 * Today's Kanban entirely because (1) the board reused
 * getTodaySiteVisits()'s strict today-only date filter, and (2) every
 * site-visit card was hard-coded to stage: 'scheduled' regardless of its
 * real lifecycle status.
 *
 * Uses direct RPC calls with real signed-in sessions (never service-role
 * for the actions under test) to put fixtures into precise, real lifecycle
 * states, then asserts on /today?view=board — the actual page a user sees.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials, loginAsAdmin } from './utils/auth';

/**
 * The board's outer wrapper is also a <section>, and it contains every
 * column heading as a (non-immediate) descendant — a plain
 * `page.locator('section', { has: heading })` matches BOTH the outer
 * wrapper and the real column section, so a card query scoped to that
 * locator sees cards from every column. This walks up from the specific
 * <h2> to its closest ancestor <section> instead, which is unambiguous.
 */
function boardColumn(page: Page, title: string) {
  return page.getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::section[1]');
}

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

const ORG1 = 'a0000000-0000-0000-0000-000000000001';
const MARKER = 'E2E_TEST_KANBAN';

test.describe('today kanban board semantics bot', () => {
  test.describe.serial('board reflects real lifecycle state, not a today-only date filter or a hard-coded stage', () => {
    let admin: SupabaseClient<Database>;
    let owner: SupabaseClient<Database>;
    let customerId: string;
    let propertyId: string;
    const requestIds: string[] = [];
    const visitIds: string[] = [];
    const jobIds: string[] = [];

    function futureDate(daysFromNow: number, hour = 18, minute = 35): Date {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      d.setHours(hour, minute, 0, 0);
      return d;
    }

    async function createSiteVisit(serviceTitle: string): Promise<string> {
      const { data: request, error } = await admin
        .from('service_requests')
        .insert({
          org_id: ORG1,
          customer_id: customerId,
          property_id: propertyId,
          service_title: serviceTitle,
          service_description: `${MARKER} fixture`,
          contact_name: `${MARKER} Fixture`,
          property_address_line_1: '1 E2E Kanban Test Way',
          property_city: 'Florence',
          status: 'reviewing',
        })
        .select('id')
        .single();
      if (error || !request) throw new Error(`Failed to create request: ${error?.message}`);
      requestIds.push(request.id);

      const { data: visit, error: visitErr } = await admin
        .from('site_visits')
        .insert({ org_id: ORG1, service_request_id: request.id, status: 'awaiting_scheduling' })
        .select('id')
        .single();
      if (visitErr || !visit) throw new Error(`Failed to create site visit: ${visitErr?.message}`);
      visitIds.push(visit.id);
      return visit.id;
    }

    async function scheduleVisit(visitId: string, start: Date): Promise<void> {
      const end = new Date(start.getTime() + 3600_000);
      const { error } = await (owner as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }).rpc(
        'schedule_site_visit',
        { p_site_visit_id: visitId, p_start: start.toISOString(), p_end: end.toISOString(), p_assigned_user_id: null }
      );
      if (error) throw new Error(`Failed to schedule visit: ${error.message}`);
    }

    async function startVisit(visitId: string): Promise<void> {
      const { error } = await owner.rpc('start_site_visit', { p_site_visit_id: visitId });
      if (error) throw new Error(`Failed to start visit: ${error.message}`);
    }

    async function completeVisit(visitId: string): Promise<void> {
      const { error } = await owner.rpc('complete_site_visit', { p_site_visit_id: visitId });
      if (error) throw new Error(`Failed to complete visit: ${error.message}`);
    }

    async function cancelVisit(visitId: string): Promise<void> {
      const { error } = await owner.rpc('cancel_site_visit', { p_site_visit_id: visitId, p_reason: `${MARKER} cancel` });
      if (error) throw new Error(`Failed to cancel visit: ${error.message}`);
    }

    async function createJob(title: string, status: 'in_progress' | 'on_hold', scheduledStart: string | null): Promise<string> {
      const { data: job, error } = await admin
        .from('jobs')
        .insert({ org_id: ORG1, customer_id: customerId, property_id: propertyId, title, status, scheduled_start: scheduledStart })
        .select('id')
        .single();
      if (error || !job) throw new Error(`Failed to create job: ${error?.message}`);
      jobIds.push(job.id);
      return job.id;
    }

    test.beforeAll(async () => {
      test.skip(!canRun(), SKIP_REASON);

      admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      owner = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await owner.auth.signInWithPassword({
        email: process.env.TEST_ADMIN_EMAIL!,
        password: process.env.TEST_ADMIN_PASSWORD!,
      });
      if (signInErr) throw new Error(`Sign-in failed: ${signInErr.message}`);

      const { data: customer, error: custErr } = await admin
        .from('customers')
        .insert({ org_id: ORG1, type: 'residential', first_name: MARKER, last_name: 'Fixture', source: 'manual_staff_entry' })
        .select('id')
        .single();
      if (custErr || !customer) throw new Error(`Failed to create fixture customer: ${custErr?.message}`);
      customerId = customer.id;

      const { data: property, error: propErr } = await admin
        .from('properties')
        .insert({ org_id: ORG1, address_line_1: '1 E2E Kanban Test Way', city: 'Florence', state: 'KY', zip: '41042' })
        .select('id')
        .single();
      if (propErr || !property) throw new Error(`Failed to create fixture property: ${propErr?.message}`);
      propertyId = property.id;
    });

    test.afterAll(async () => {
      if (!canRun()) return;
      for (const jobId of jobIds) await admin.from('jobs').delete().eq('id', jobId);
      for (const visitId of visitIds) {
        await admin.from('site_visit_appointments').delete().eq('site_visit_id', visitId);
        await admin.from('site_visits').delete().eq('id', visitId);
      }
      for (const requestId of requestIds) await admin.from('service_requests').delete().eq('id', requestId);
      await admin.from('properties').delete().eq('id', propertyId);
      await admin.from('customers').delete().eq('id', customerId);
    });

    // Acceptance test: a persisted site visit showing "Inspection in
    // progress" must not disappear from the Kanban merely because its
    // appointment is not today, and must render under In Progress.
    test('1+2. an in-progress site visit with a future appointment appears under In Progress, not Scheduled, with its real title', async ({ page }) => {
      const visitId = await createSiteVisit('Kitchen remodel');
      await scheduleVisit(visitId, futureDate(2));
      await startVisit(visitId);

      await loginAsAdmin(page);
      await page.goto('/today?view=board');
      await page.waitForLoadState('networkidle');

      const inProgressColumn = boardColumn(page, 'In Progress');
      await expect(inProgressColumn.getByRole('link', { name: /Kitchen remodel/ })).toBeVisible();

      const scheduledColumn = boardColumn(page, 'Scheduled');
      await expect(scheduledColumn.getByRole('link', { name: /Kitchen remodel/ })).toHaveCount(0);
    });

    test('3. a same-day scheduled site visit appears under Scheduled', async ({ page }) => {
      const visitId = await createSiteVisit('Same-day gutter cleaning');
      await scheduleVisit(visitId, futureDate(0));

      await loginAsAdmin(page);
      await page.goto('/today?view=board');
      await page.waitForLoadState('networkidle');

      const scheduledColumn = boardColumn(page, 'Scheduled');
      await expect(scheduledColumn.getByRole('link', { name: /Same-day gutter cleaning/ })).toBeVisible();
    });

    test('5+6. a completed site visit lands in Completed; a cancelled visit does not appear anywhere', async ({ page }) => {
      const completedVisitId = await createSiteVisit('Completed fence repair');
      await scheduleVisit(completedVisitId, futureDate(0));
      await startVisit(completedVisitId);
      await completeVisit(completedVisitId);

      const cancelledVisitId = await createSiteVisit('Cancelled deck repair');
      await scheduleVisit(cancelledVisitId, futureDate(1));
      await cancelVisit(cancelledVisitId);

      await loginAsAdmin(page);
      await page.goto('/today?view=board');
      await page.waitForLoadState('networkidle');

      const completedColumn = boardColumn(page, 'Completed');
      await expect(completedColumn.getByRole('link', { name: /Completed fence repair/ })).toBeVisible();

      await expect(page.getByRole('link', { name: /Cancelled deck repair/ })).toHaveCount(0);
    });

    test('8+9. an in-progress job started days ago and an on-hold job with no scheduled_start today both remain visible', async ({ page }) => {
      const inProgressJobId = await createJob(`${MARKER} In-progress roof repair`, 'in_progress', futureDate(-5).toISOString());
      const onHoldJobId = await createJob(`${MARKER} On-hold siding job`, 'on_hold', null);
      void inProgressJobId;
      void onHoldJobId;

      await loginAsAdmin(page);
      await page.goto('/today?view=board');
      await page.waitForLoadState('networkidle');

      const inProgressColumn = boardColumn(page, 'In Progress');
      await expect(inProgressColumn.getByRole('link', { name: new RegExp(`${MARKER} In-progress roof repair`) })).toBeVisible();

      const onHoldColumn = boardColumn(page, 'On Hold');
      await expect(onHoldColumn.getByRole('link', { name: new RegExp(`${MARKER} On-hold siding job`) })).toBeVisible();
    });

    test('10. the Today schedule (not the board) remains strictly today-only — a visit scheduled 2 days out never appears there', async ({ page }) => {
      const visitId = await createSiteVisit('Future-only skylight install');
      await scheduleVisit(visitId, futureDate(2));

      await loginAsAdmin(page);
      await page.goto('/today');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/Future-only skylight install/)).toHaveCount(0);
    });
  });
});
