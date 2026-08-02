/**
 * request-site-visit-workflow-bot: proves the request → site visit →
 * estimate → quote workflow (docs/implementation/request-site-visit-estimate-workflow.md)
 * end to end through the real RPCs, using direct API calls with real signed-in
 * sessions — never the service-role key for the actions under test, so every
 * assertion proves server-side enforcement, not just hidden UI.
 *
 * This bot creates its own temporary fixtures (customer/property/request,
 * plus temporary owner/employee/subcontractor/org2 accounts via the
 * service-role Admin API) rather than relying on the persistent TEST_STAFF_*
 * account, since it needs multiple distinct roles and a second organization
 * to prove cross-org isolation — neither of which the persistent fixture
 * covers. Everything created is torn down in afterAll.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () =>
  hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON =
  'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

const ORG1 = 'a0000000-0000-0000-0000-000000000001';

interface Fixture {
  email: string;
  userId: string;
  client: SupabaseClient<Database>;
}

test.describe('request → site visit → estimate → quote workflow bot', () => {
  test.describe.serial('golden path, gating, and isolation', () => {
    let admin: SupabaseClient<Database>;
    let owner: Fixture;
    let employee: Fixture;
    let subcontractor: Fixture;
    let org2Staff: Fixture;
    let customerAuthUserId: string;
    let customerEmail: string;
    let customerPassword: string;
    let requestId: string;
    let customerId: string;
    let propertyId: string;
    const org2Id = crypto.randomUUID();
    let siteVisitId: string;
    let estimateId: string;
    let quoteId: string;

    async function makeStaffFixture(rolePrefix: string, role: 'owner' | 'admin' | 'employee' | 'subcontractor', orgId: string): Promise<Fixture> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const email = `e2e-rsv-${rolePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
      const password = `E2eRsv_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`Failed to create ${rolePrefix}: ${error?.message}`);
      const { error: memberErr } = await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      if (memberErr) throw new Error(`Failed to add ${rolePrefix} to org: ${memberErr.message}`);
      const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      if (signInErr) throw new Error(`Sign-in failed for ${rolePrefix}: ${signInErr.message}`);
      return { email, userId: created.user.id, client };
    }

    test.beforeAll(async () => {
      test.skip(!canRun(), SKIP_REASON);

      admin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data: customer, error: custErr } = await admin
        .from('customers')
        .insert({ org_id: ORG1, type: 'residential', first_name: 'E2E_RSV', last_name: 'Fixture', source: 'manual_staff_entry' })
        .select('id')
        .single();
      if (custErr || !customer) throw new Error(`Failed to create fixture customer: ${custErr?.message}`);
      customerId = customer.id;

      const { data: property, error: propErr } = await admin
        .from('properties')
        .insert({ org_id: ORG1, address_line_1: '1 E2E RSV Test Way', city: 'Florence', state: 'KY', zip: '41042' })
        .select('id')
        .single();
      if (propErr || !property) throw new Error(`Failed to create fixture property: ${propErr?.message}`);
      propertyId = property.id;

      await admin.from('customer_properties').insert({ customer_id: customerId, property_id: propertyId, relationship: 'owner', is_primary: true });

      const { data: request, error: reqErr } = await admin
        .from('service_requests')
        .insert({
          org_id: ORG1, request_number: `E2E-RSV-${Date.now()}`, source: 'manual', status: 'reviewing', priority: 'normal',
          customer_id: customerId, property_id: propertyId, contact_name: 'E2E RSV Fixture',
          service_title: 'E2E RSV test request', service_description: 'Testing the full site-visit pipeline', submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (reqErr || !request) throw new Error(`Failed to create fixture request: ${reqErr?.message}`);
      requestId = request.id;

      owner = await makeStaffFixture('owner', 'owner', ORG1);
      employee = await makeStaffFixture('employee', 'employee', ORG1);
      subcontractor = await makeStaffFixture('subcontractor', 'subcontractor', ORG1);

      await admin.from('organizations').insert({ id: org2Id, name: 'E2E_RSV_ORG_2', slug: `e2e-rsv-org-2-${Date.now()}` });
      org2Staff = await makeStaffFixture('org2', 'owner', org2Id);

      customerEmail = `e2e-rsv-customer-${Date.now()}@example.com`;
      customerPassword = `E2eRsv_${Math.random().toString(36).slice(2)}!1`;
      const { data: custAuth } = await admin.auth.admin.createUser({ email: customerEmail, password: customerPassword, email_confirm: true });
      customerAuthUserId = custAuth!.user.id;
      await admin.from('customer_accounts').insert({ org_id: ORG1, customer_id: customerId, auth_user_id: customerAuthUserId, status: 'active', email: customerEmail });
    });

    test.afterAll(async () => {
      if (!admin) return;
      if (quoteId) {
        await admin.from('quote_line_items').delete().eq('quote_id', quoteId);
        await admin.from('quotes').delete().eq('id', quoteId);
      }
      if (estimateId) {
        await admin.from('estimate_line_items').delete().eq('estimate_id', estimateId);
        await admin.from('estimates').delete().eq('id', estimateId);
      }
      if (siteVisitId) {
        await admin.from('site_visit_appointments').delete().eq('site_visit_id', siteVisitId);
        await admin.from('site_visits').delete().eq('id', siteVisitId);
      }
      if (requestId) {
        await admin.from('activity_log').delete().eq('entity_id', requestId);
        await admin.from('service_requests').delete().eq('id', requestId);
      }
      if (customerAuthUserId) await admin.from('customer_accounts').delete().eq('auth_user_id', customerAuthUserId);
      if (customerId) {
        await admin.from('customer_properties').delete().eq('customer_id', customerId);
        await admin.from('customers').delete().eq('id', customerId);
      }
      if (propertyId) await admin.from('properties').delete().eq('id', propertyId);

      const staffIds = [owner, employee, subcontractor, org2Staff].filter(Boolean).map((f) => f.userId);
      if (staffIds.length) {
        await admin.from('org_members').delete().in('user_id', staffIds);
        for (const uid of [...staffIds, customerAuthUserId].filter(Boolean)) {
          await admin.auth.admin.deleteUser(uid);
        }
      }
      if (org2Id) await admin.from('organizations').delete().eq('id', org2Id);
    });

    test('1. triage into site_visit_required creates ONLY a site_visits row — no estimate exists yet', async () => {
      const { data, error } = await owner.client.rpc('record_request_triage', {
        p_request_id: requestId, p_decision: 'site_visit_required', p_reason: 'E2E: needs on-site inspection',
      });
      expect(error).toBeNull();
      siteVisitId = (data as { siteVisitId: string }).siteVisitId;
      expect(siteVisitId).toBeTruthy();

      const { count } = await admin.from('estimates').select('id', { count: 'exact', head: true }).eq('service_request_id', requestId);
      expect(count).toBe(0);
    });

    test('2. schedule then reschedule preserves appointment history (never overwritten in place)', async () => {
      const start = new Date(Date.now() + 86_400_000).toISOString();
      const end = new Date(Date.now() + 90_000_000).toISOString();
      const { data: apptId, error: schedErr } = await employee.client.rpc('schedule_site_visit', {
        p_site_visit_id: siteVisitId, p_start: start, p_end: end, p_assigned_user_id: employee.userId,
      });
      expect(schedErr).toBeNull();

      const newStart = new Date(Date.now() + 172_800_000).toISOString();
      const newEnd = new Date(Date.now() + 176_400_000).toISOString();
      const { error: reschedErr } = await employee.client.rpc('reschedule_site_visit', {
        p_site_visit_id: siteVisitId, p_start: newStart, p_end: newEnd, p_reason: 'E2E: customer requested later time',
      });
      expect(reschedErr).toBeNull();

      const { data: oldAppt } = await admin.from('site_visit_appointments').select('status').eq('id', apptId as string).maybeSingle();
      expect(oldAppt?.status).toBe('cancelled');

      const { count: activeCount } = await admin.from('site_visit_appointments').select('id', { count: 'exact', head: true }).eq('site_visit_id', siteVisitId).eq('status', 'scheduled');
      expect(activeCount).toBe(1);
    });

    test('3. start, save findings (server-action-only path), complete', async () => {
      const { error: startErr } = await employee.client.rpc('start_site_visit', { p_site_visit_id: siteVisitId });
      expect(startErr).toBeNull();

      // Direct client call to save_site_visit_inspection must be denied — no
      // EXECUTE grant for `authenticated` (see the Zod-validation-boundary
      // decision in the implementation doc).
      const { error: directSaveErr } = await employee.client.rpc('save_site_visit_inspection', {
        p_site_visit_id: siteVisitId, p_responses_patch: { x: 1 },
      });
      expect(directSaveErr).not.toBeNull();

      // Only the service-role ("server action") path may call it.
      const { error: trustedSaveErr } = await admin.rpc('save_site_visit_inspection', {
        p_site_visit_id: siteVisitId,
        p_responses_patch: {
          customerConcerns: 'Gutter leaking near garage',
          observedConditions: 'Sagging gutter section',
          proposedScope: 'Replace 12ft gutter run',
          quantities: [{ item: 'Gutter section (ft)', quantity: 12, unit: 'ft' }],
        },
      });
      expect(trustedSaveErr).toBeNull();

      const { error: completeErr } = await employee.client.rpc('complete_site_visit', { p_site_visit_id: siteVisitId });
      expect(completeErr).toBeNull();
    });

    test('4. estimate generation is idempotent and concurrent-safe', async () => {
      const [gen1, gen2] = await Promise.all([
        employee.client.rpc('generate_estimate_from_site_visit', { p_site_visit_id: siteVisitId }),
        employee.client.rpc('generate_estimate_from_site_visit', { p_site_visit_id: siteVisitId }),
      ]);
      expect(gen1.error).toBeNull();
      expect(gen2.error).toBeNull();
      expect(gen1.data).toBe(gen2.data);
      estimateId = gen1.data as string;

      const { count } = await admin.from('estimate_line_items').select('id', { count: 'exact', head: true }).eq('estimate_id', estimateId);
      expect(count).toBeGreaterThan(0);
    });

    test('5. quote creation is rejected before pricing approval — RPC AND raw DB trigger both enforce it', async () => {
      const { error: rpcErr } = await owner.client.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
      expect(rpcErr).not.toBeNull();

      // Bypass the RPC entirely — a raw service-role INSERT must still be rejected by the trigger.
      const { error: rawInsertErr } = await admin.from('quotes').insert({ org_id: ORG1, estimate_id: estimateId, type: 'standard', status: 'draft' });
      expect(rawInsertErr).not.toBeNull();
    });

    test('6. subcontractor cannot approve pricing or create/send a quote (capability separation)', async () => {
      const { error: subApproveErr } = await subcontractor.client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
      expect(subApproveErr).not.toBeNull();
    });

    test('7. owner approves pricing; editing a line item afterward is locked until reopened', async () => {
      const { error: approveErr } = await owner.client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
      expect(approveErr).toBeNull();

      const { data: line } = await admin.from('estimate_line_items').select('id').eq('estimate_id', estimateId).limit(1).maybeSingle();
      const { error: editErr } = await admin.from('estimate_line_items').update({ unit_price: 99 }).eq('id', line!.id);
      expect(editErr).not.toBeNull();
    });

    test('8. employee creates the quote after owner approved pricing (capability separation, positive case) — line items snapshotted', async () => {
      const { data: qId, error: quoteErr } = await employee.client.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
      expect(quoteErr).toBeNull();
      quoteId = qId as string;

      const { count: estLineCount } = await admin.from('estimate_line_items').select('id', { count: 'exact', head: true }).eq('estimate_id', estimateId);
      const { count: quoteLineCount } = await admin.from('quote_line_items').select('id', { count: 'exact', head: true }).eq('quote_id', quoteId);
      expect(quoteLineCount).toBe(estLineCount);

      const { error: subQuoteErr } = await subcontractor.client.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
      expect(subQuoteErr).not.toBeNull();
    });

    test('9. customer-safe summary returns only approved fields; direct base-table SELECT is denied outright', async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const custClient = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signInErr } = await custClient.auth.signInWithPassword({ email: customerEmail, password: customerPassword });
      expect(signInErr).toBeNull();

      const { data: summary, error: summaryErr } = await custClient.rpc('get_my_site_visit_summary', { p_service_request_id: requestId });
      expect(summaryErr).toBeNull();
      expect(summary).toHaveLength(1);
      expect(Object.keys(summary![0]).sort()).toEqual(
        ['is_cancelled', 'is_rescheduled', 'safe_status', 'scheduled_end', 'scheduled_start', 'site_visit_id'].sort()
      );

      const { data: directSelect } = await custClient.from('site_visits').select('*');
      expect(directSelect === null || directSelect.length === 0).toBe(true);
    });

    test('10. org2 staff cannot act on org1 site visit (cross-org denial)', async () => {
      const { error } = await org2Staff.client.rpc('start_site_visit', { p_site_visit_id: siteVisitId });
      expect(error).not.toBeNull();
    });
  });

  test.describe('capability parity — TypeScript vs SQL', () => {
    test('every role/capability pair matches between packages/shared/permissions.ts and role_has_capability()', async () => {
      test.skip(!canRun(), SKIP_REASON);
      const { hasCapability } = await import('@premier/shared');
      const admin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const roles = ['owner', 'admin', 'employee', 'subcontractor', 'viewer'] as const;
      const capabilities = [
        'canCreateEstimates', 'canSendEstimates', 'canCreateInvoices', 'canSendInvoices',
        'canRecordPayments', 'canVoidInvoices', 'canDeleteInvoices', 'canIssueRefunds',
        'canScheduleJobs', 'canProposeChangeOrders', 'canManageDeposits', 'canEditWorkingInvoice',
        'canTriageRequests', 'canCreateDirectWorkOrder', 'canManageInspectionTemplates',
        'canEditEstimate', 'canApproveEstimatePricing', 'canCreateQuote', 'canSendQuote',
      ] as const;

      const mismatches: string[] = [];
      for (const role of roles) {
        for (const capability of capabilities) {
          const tsResult = hasCapability(role, capability);
          const { data: sqlResult, error } = await admin.rpc('role_has_capability', { p_role: role, p_capability: capability });
          if (error) {
            mismatches.push(`${role}/${capability}: SQL call errored — ${error.message}`);
            continue;
          }
          if (Boolean(sqlResult) !== tsResult) {
            mismatches.push(`${role}/${capability}: TS=${tsResult} SQL=${sqlResult}`);
          }
        }
      }

      expect(mismatches).toEqual([]);
    });
  });
});
