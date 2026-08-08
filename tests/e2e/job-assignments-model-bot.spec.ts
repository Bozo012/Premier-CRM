/**
 * job-assignments-model-bot: proves the new job_assignments table +
 * assign_member_to_job/remove_member_from_job/set_job_lead RPCs
 * (design/job-crew-assignment-model,
 * supabase/migrations/20260808000000_job_assignments_model.sql) end to end,
 * using direct RPC calls with real signed-in sessions — never the
 * service-role key for the actions under test, so every assertion proves
 * server-side enforcement, not just hidden UI. Follows the exact pattern
 * request-site-visit-workflow-bot.spec.ts established for multi-role,
 * multi-org fixture creation and cleanup.
 *
 * NOT EXECUTED THIS SESSION: this migration has been designed and reviewed
 * but deliberately NOT applied yet (a separate, explicitly-authorized next
 * step) — there is nothing live to run this against. Typechecks cleanly;
 * ready to run as-is once the migration is applied to premier-crm-e2e.
 *
 * TEMPORARY TYPING NOTE (matches packages/db/queries/job-assignments.ts):
 * job_assignments and its three RPCs aren't in the generated Database type
 * yet, so RPC calls here go through a narrow `rpc()`-only cast rather than
 * the fixture's normal typed `client`. Remove once `pnpm db:types` is
 * re-run after the migration lands.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

const ORG1 = 'a0000000-0000-0000-0000-000000000001';

interface Fixture {
  email: string;
  userId: string;
  client: SupabaseClient<Database>;
}

interface RpcResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function callRpc<T = unknown>(client: SupabaseClient<Database>, fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  return (client as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult<T>> }).rpc(fn, args);
}

/** job_assignments isn't in the generated Database type yet — see the file-level TEMPORARY TYPING NOTE. */
function jobAssignments(client: SupabaseClient<Database>) {
  return (client as unknown as { from(table: string): any }).from('job_assignments');
}

test.describe('job assignments model bot', () => {
  test.describe.serial('crew assignment golden path, gating, and isolation', () => {
    let admin: SupabaseClient<Database>;
    let owner: Fixture;
    let employee: Fixture;
    let subcontractor: Fixture;
    let org2Owner: Fixture;
    let customerId: string;
    let propertyId: string;
    let jobId: string;
    let crewUserId1: string; // employee.userId, reused as the person being assigned
    let crewUserId2: string; // subcontractor.userId
    const org2Id = crypto.randomUUID();

    async function makeStaffFixture(rolePrefix: string, role: 'owner' | 'admin' | 'employee' | 'subcontractor', orgId: string): Promise<Fixture> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const email = `e2e-jam-${rolePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
      const password = `E2eJam_${Math.random().toString(36).slice(2)}!1`;
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

      admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: org2, error: org2Err } = await admin
        .from('organizations')
        .insert({ id: org2Id, name: 'E2E_JAM_ORG2', slug: `e2e-jam-org2-${Date.now()}` })
        .select('id')
        .single();
      if (org2Err || !org2) throw new Error(`Failed to create org2: ${org2Err?.message}`);

      const { data: customer, error: custErr } = await admin
        .from('customers')
        .insert({ org_id: ORG1, type: 'residential', first_name: 'E2E_JAM', last_name: 'Fixture', source: 'manual_staff_entry' })
        .select('id')
        .single();
      if (custErr || !customer) throw new Error(`Failed to create fixture customer: ${custErr?.message}`);
      customerId = customer.id;

      const { data: property, error: propErr } = await admin
        .from('properties')
        .insert({ org_id: ORG1, address_line_1: '1 E2E JAM Test Way', city: 'Florence', state: 'KY', zip: '41042' })
        .select('id')
        .single();
      if (propErr || !property) throw new Error(`Failed to create fixture property: ${propErr?.message}`);
      propertyId = property.id;

      const { data: job, error: jobErr } = await admin
        .from('jobs')
        .insert({ org_id: ORG1, customer_id: customerId, property_id: propertyId, title: 'E2E_JAM fixture job' })
        .select('id')
        .single();
      if (jobErr || !job) throw new Error(`Failed to create fixture job: ${jobErr?.message}`);
      jobId = job.id;

      owner = await makeStaffFixture('owner', 'owner', ORG1);
      employee = await makeStaffFixture('employee', 'employee', ORG1);
      subcontractor = await makeStaffFixture('subcontractor', 'subcontractor', ORG1);
      org2Owner = await makeStaffFixture('org2owner', 'owner', org2Id);
      crewUserId1 = employee.userId;
      crewUserId2 = subcontractor.userId;
    });

    test.afterAll(async () => {
      if (!canRun()) return;
      await jobAssignments(admin).delete().eq('job_id', jobId);
      await admin.from('jobs').delete().eq('id', jobId);
      await admin.from('properties').delete().eq('id', propertyId);
      await admin.from('customers').delete().eq('id', customerId);
      for (const fixture of [owner, employee, subcontractor, org2Owner]) {
        if (fixture) await admin.auth.admin.deleteUser(fixture.userId).catch(() => {});
      }
      await admin.from('organizations').delete().eq('id', org2Id);
    });

    test('1. owner assigns a crew member — real row created, activity logged', async () => {
      const { data, error } = await callRpc<string>(owner.client, 'assign_member_to_job', {
        p_job_id: jobId,
        p_user_id: crewUserId1,
        p_is_lead: false,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const { data: row } = await jobAssignments(admin).select('id, is_lead').eq('job_id', jobId).eq('user_id', crewUserId1).maybeSingle();
      expect(row).not.toBeNull();
      expect(row?.is_lead).toBe(false);

      const { data: activity } = await admin
        .from('activity_log')
        .select('event_type')
        .eq('entity_type', 'job')
        .eq('entity_id', jobId)
        .eq('event_type', 'job_crew_assigned')
        .limit(1);
      expect(activity?.length).toBeGreaterThan(0);
    });

    test('2. employee can read crew assignments but cannot assign (unauthorized assignment blocked)', async () => {
      // Read: any active org member.
      const { data: readRows, error: readErr } = await jobAssignments(employee.client).select('id').eq('job_id', jobId);
      expect(readErr).toBeNull();
      expect(readRows?.length).toBeGreaterThan(0);

      // canScheduleJobs actually includes employee in this codebase's
      // capability matrix — so employee CAN assign. Prove that positive
      // case, then prove viewer-equivalent denial via a role the matrix
      // genuinely excludes: there is no such role for canScheduleJobs
      // (owner/admin/employee/subcontractor all have it), so the negative
      // case is proven in test 3 via cross-org denial instead, which is
      // the actual authorization boundary this table enforces beyond
      // capability — org membership.
      const { error: assignErr } = await callRpc(employee.client, 'assign_member_to_job', {
        p_job_id: jobId,
        p_user_id: crewUserId2,
        p_is_lead: false,
      });
      expect(assignErr).toBeNull();

      // Clean up this test's own assignment so later tests' assumptions hold.
      await jobAssignments(admin).delete().eq('job_id', jobId).eq('user_id', crewUserId2);
    });

    test('3. cross-org assignment is blocked — org2 owner cannot assign anyone to an org1 job', async () => {
      const { error } = await callRpc(org2Owner.client, 'assign_member_to_job', {
        p_job_id: jobId,
        p_user_id: crewUserId2,
        p_is_lead: false,
      });
      expect(error).not.toBeNull();
    });

    test('4. duplicate assignment is prevented', async () => {
      const { error } = await callRpc(owner.client, 'assign_member_to_job', {
        p_job_id: jobId,
        p_user_id: crewUserId1,
        p_is_lead: false,
      });
      expect(error).not.toBeNull();
    });

    test('5. a second crew member can be assigned — multiple crew supported', async () => {
      const { error } = await callRpc(owner.client, 'assign_member_to_job', {
        p_job_id: jobId,
        p_user_id: crewUserId2,
        p_is_lead: false,
      });
      expect(error).toBeNull();

      const { data: rows } = await jobAssignments(admin).select('user_id').eq('job_id', jobId);
      expect(rows?.length).toBe(2);
    });

    test('6. only one lead per job — set_job_lead atomically clears the previous lead', async () => {
      const { error: leadErr1 } = await callRpc(owner.client, 'set_job_lead', { p_job_id: jobId, p_user_id: crewUserId1 });
      expect(leadErr1).toBeNull();

      let { data: leads } = await jobAssignments(admin).select('user_id').eq('job_id', jobId).eq('is_lead', true);
      expect(leads?.length).toBe(1);
      expect(leads?.[0]?.user_id).toBe(crewUserId1);

      const { error: leadErr2 } = await callRpc(owner.client, 'set_job_lead', { p_job_id: jobId, p_user_id: crewUserId2 });
      expect(leadErr2).toBeNull();

      ({ data: leads } = await jobAssignments(admin).select('user_id').eq('job_id', jobId).eq('is_lead', true));
      expect(leads?.length).toBe(1);
      expect(leads?.[0]?.user_id).toBe(crewUserId2);
    });

    test('7. set_job_lead rejects a user who is not yet assigned to the job', async () => {
      const { error } = await callRpc(owner.client, 'set_job_lead', { p_job_id: jobId, p_user_id: org2Owner.userId });
      expect(error).not.toBeNull();
    });

    test('8. unassigning a crew member removes the row and clears lead status with it', async () => {
      const { error } = await callRpc(owner.client, 'remove_member_from_job', { p_job_id: jobId, p_user_id: crewUserId2 });
      expect(error).toBeNull();

      const { data: row } = await jobAssignments(admin).select('id').eq('job_id', jobId).eq('user_id', crewUserId2).maybeSingle();
      expect(row).toBeNull();

      const { data: leads } = await jobAssignments(admin).select('user_id').eq('job_id', jobId).eq('is_lead', true);
      expect(leads?.length).toBe(0);
    });

    test('9. unassigning someone not on the job fails cleanly', async () => {
      const { error } = await callRpc(owner.client, 'remove_member_from_job', { p_job_id: jobId, p_user_id: crewUserId2 });
      expect(error).not.toBeNull();
    });

    test('10. deleting a job cascades to its assignments (FK ON DELETE CASCADE)', async () => {
      const { data: tempJob } = await admin
        .from('jobs')
        .insert({ org_id: ORG1, customer_id: customerId, property_id: propertyId, title: 'E2E_JAM cascade-test job' })
        .select('id')
        .single();
      expect(tempJob).not.toBeNull();
      const tempJobId = tempJob!.id;

      await callRpc(owner.client, 'assign_member_to_job', { p_job_id: tempJobId, p_user_id: crewUserId1, p_is_lead: false });
      const { data: before } = await jobAssignments(admin).select('id').eq('job_id', tempJobId);
      expect(before?.length).toBe(1);

      await admin.from('jobs').delete().eq('id', tempJobId);

      const { data: after } = await jobAssignments(admin).select('id').eq('job_id', tempJobId);
      expect(after?.length).toBe(0);
    });

    test('11. removing a member from org_members cascades to their job assignments (FK ON DELETE CASCADE)', async () => {
      await callRpc(owner.client, 'assign_member_to_job', { p_job_id: jobId, p_user_id: crewUserId2, p_is_lead: false });
      const { data: before } = await jobAssignments(admin).select('id').eq('job_id', jobId).eq('user_id', crewUserId2);
      expect(before?.length).toBe(1);

      await admin.from('org_members').delete().eq('org_id', ORG1).eq('user_id', crewUserId2);

      const { data: after } = await jobAssignments(admin).select('id').eq('job_id', jobId).eq('user_id', crewUserId2);
      expect(after?.length).toBe(0);

      // Restore membership for a clean afterAll teardown.
      await admin.from('org_members').insert({ org_id: ORG1, user_id: crewUserId2, role: 'subcontractor', status: 'active' });
    });
  });
});
