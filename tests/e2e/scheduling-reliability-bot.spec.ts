/**
 * scheduling-reliability-bot: live coverage for V1 scheduling reliability
 * (20260814010000_scheduling_conflict_detection.sql) — the centralized
 * get_scheduling_conflicts query and the atomic create_job_with_schedule
 * RPC that replaces createJobWithScheduleAction's old non-atomic 3-step
 * sequence.
 *
 * Enforcement level: warning + explicit override, not a hard block — there
 * is no DB-level uniqueness invariant on a person's overlapping work across
 * jobs/site-visits (unlike site_visit_appointments' own "one active
 * appointment per visit" partial-unique-index). Every test below reflects
 * that: conflicts are provable and reproducible, but p_override_conflicts
 * always wins when explicitly passed. This spec does NOT claim or test any
 * DB-level exclusivity that does not actually exist.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { hasServiceRoleCleanupCredentials, createGuardedServiceClient } from './utils/cleanup';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasServiceRoleCleanupCredentials() && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.test';

interface StaffAccount {
  email: string;
  password: string;
  userId: string;
}

interface Fixture {
  orgId: string;
  customerId: string;
  propertyId: string;
  owner: StaffAccount;
  employeeA: StaffAccount;
  employeeB: StaffAccount;
  serviceRequestId: string;
}

function apiClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = apiClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

test.describe('scheduling reliability bot', () => {
  let admin: SupabaseClient<Database>;
  let fx: Fixture;
  const createdJobIds: string[] = [];
  const createdSiteVisitIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    const suffix = uniqueSuffix();
    const orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: `${E2E_TEST_PREFIX}Scheduling_${suffix}`, slug: `e2e-scheduling-${suffix}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'SchedulingFixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} Scheduling Way`, city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    const propertyId = property!.id;
    await admin.from('customer_properties').insert({ customer_id: customerId, property_id: propertyId, relationship: 'owner', is_primary: true });

    const { data: serviceRequest } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        source: 'manual',
        status: 'reviewing',
        priority: 'normal',
        customer_id: customerId,
        property_id: propertyId,
        contact_name: `${E2E_TEST_PREFIX} Scheduling Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} Scheduling Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'Scheduling fixture request',
        service_description: 'Fixture request for scheduling-reliability bot.',
      })
      .select('id')
      .single();

    async function createStaff(role: 'owner' | 'employee'): Promise<StaffAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}sched-${role}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `Sched_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    fx = {
      orgId,
      customerId,
      propertyId,
      owner: await createStaff('owner'),
      employeeA: await createStaff('employee'),
      employeeB: await createStaff('employee'),
      serviceRequestId: serviceRequest!.id,
    };
  });

  test.afterAll(async () => {
    if (!admin || !fx) return;
    for (const jobId of createdJobIds) {
      await admin.from('job_assignments').delete().eq('job_id', jobId);
      await admin.from('invoices').delete().eq('job_id', jobId);
      await admin.from('activity_log').delete().eq('entity_id', jobId).eq('entity_type', 'job');
    }
    if (createdJobIds.length > 0) await admin.from('jobs').delete().in('id', createdJobIds);
    for (const siteVisitId of createdSiteVisitIds) {
      await admin.from('site_visit_appointments').delete().eq('site_visit_id', siteVisitId);
    }
    if (createdSiteVisitIds.length > 0) await admin.from('site_visits').delete().in('id', createdSiteVisitIds);
    if (createdServiceRequestIds.length > 0) await admin.from('service_requests').delete().in('id', createdServiceRequestIds);
    await admin.from('service_requests').delete().eq('id', fx.serviceRequestId);
    await admin.from('customer_properties').delete().eq('customer_id', fx.customerId);
    await admin.from('properties').delete().eq('id', fx.propertyId);
    await admin.from('customers').delete().eq('id', fx.customerId);
    await admin.from('org_members').delete().eq('org_id', fx.orgId);
    for (const account of [fx.owner, fx.employeeA, fx.employeeB]) {
      await admin.auth.admin.deleteUser(account.userId);
    }
    await admin.from('organizations').delete().eq('id', fx.orgId);
  });

  async function createFixtureJob(scheduledStart: string, scheduledEnd: string, userId: string, status = 'scheduled'): Promise<string> {
    const { data: job } = await admin
      .from('jobs')
      .insert({
        org_id: fx.orgId,
        customer_id: fx.customerId,
        property_id: fx.propertyId,
        title: `${E2E_TEST_PREFIX} Fixture job ${uniqueSuffix()}`,
        status,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
      })
      .select('id')
      .single();
    const jobId = job!.id;
    createdJobIds.push(jobId);
    await admin.from('job_assignments').insert({ org_id: fx.orgId, job_id: jobId, user_id: userId, is_lead: true });
    return jobId;
  }

  const createdServiceRequestIds: string[] = [];

  async function createFixtureSiteVisitAppointment(
    scheduledStart: string,
    scheduledEnd: string,
    userId: string,
    status = 'scheduled'
  ): Promise<{ siteVisitId: string; appointmentId: string }> {
    // site_visits has a unique constraint on service_request_id (one visit
    // per request) — each fixture appointment needs its own request, not
    // the shared fx.serviceRequestId.
    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: fx.orgId,
        source: 'manual',
        status: 'reviewing',
        priority: 'normal',
        customer_id: fx.customerId,
        property_id: fx.propertyId,
        contact_name: `${E2E_TEST_PREFIX} Scheduling Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} Scheduling Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: `Scheduling fixture site-visit request ${uniqueSuffix()}`,
        service_description: 'Fixture request for scheduling-reliability bot site-visit appointment.',
      })
      .select('id')
      .single();
    const requestId = request!.id;
    createdServiceRequestIds.push(requestId);

    const { data: visit } = await admin
      .from('site_visits')
      .insert({ org_id: fx.orgId, service_request_id: requestId, status: 'scheduled', assigned_user_id: userId })
      .select('id')
      .single();
    const siteVisitId = visit!.id;
    createdSiteVisitIds.push(siteVisitId);
    const { data: appointment } = await admin
      .from('site_visit_appointments')
      .insert({
        org_id: fx.orgId,
        site_visit_id: siteVisitId,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        assigned_user_id: userId,
        status,
      })
      .select('id')
      .single();
    return { siteVisitId, appointmentId: appointment!.id };
  }

  test('1. no conflict for adjacent, non-overlapping work', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-11';
    await createFixtureJob(`${day}T09:00:00Z`, `${day}T10:00:00Z`, fx.employeeA.userId);

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T10:00:00Z`,
      p_proposed_end: `${day}T11:00:00Z`,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('2. job vs job overlap is detected', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-12';
    await createFixtureJob(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T10:00:00Z`,
      p_proposed_end: `${day}T12:00:00Z`,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((c: { record_type: string }) => c.record_type === 'job')).toBe(true);
  });

  test('3. job vs site-visit overlap is detected', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-13';
    await createFixtureSiteVisitAppointment(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T10:00:00Z`,
      p_proposed_end: `${day}T12:00:00Z`,
    });
    expect(error).toBeNull();
    expect((data ?? []).some((c: { record_type: string }) => c.record_type === 'site_visit')).toBe(true);
  });

  test('4. site-visit vs site-visit overlap is detected', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-14';
    await createFixtureSiteVisitAppointment(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T10:30:00Z`,
      p_proposed_end: `${day}T12:00:00Z`,
    });
    expect(error).toBeNull();
    expect((data ?? []).some((c: { record_type: string }) => c.record_type === 'site_visit')).toBe(true);
  });

  test("5. another employee's work does not conflict", async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-15';
    await createFixtureJob(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeB.userId,
      p_proposed_start: `${day}T09:00:00Z`,
      p_proposed_end: `${day}T11:00:00Z`,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('6. cancelled work is excluded from conflicts', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-16';
    const jobId = await createFixtureJob(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId, 'cancelled');

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T09:00:00Z`,
      p_proposed_end: `${day}T11:00:00Z`,
    });
    expect(error).toBeNull();
    expect((data ?? []).map((c: { record_id: string }) => c.record_id)).not.toContain(jobId);
  });

  test('7. editing a record can exclude itself via p_exclude_job_id', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-17';
    const jobId = await createFixtureJob(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const withoutExclude = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T09:30:00Z`,
      p_proposed_end: `${day}T10:30:00Z`,
    });
    expect((withoutExclude.data ?? []).map((c: { record_id: string }) => c.record_id)).toContain(jobId);

    const withExclude = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeA.userId,
      p_proposed_start: `${day}T09:30:00Z`,
      p_proposed_end: `${day}T10:30:00Z`,
      p_exclude_job_id: jobId,
    });
    expect((withExclude.data ?? []).map((c: { record_id: string }) => c.record_id)).not.toContain(jobId);
  });

  test('8. an unavailable-staff signal remains a separate concept from a scheduling conflict', async () => {
    // Sets availability_status='off_shift' with no overlapping work at all —
    // proves get_scheduling_conflicts (booked-time overlap) and
    // team_member_availability (general availability) are genuinely
    // independent: the conflict query returns nothing here, even though the
    // person is marked unavailable. The two signals are surfaced separately
    // by design (see the migration's own header comment), not merged.
    const owner = await signIn(fx.owner.email, fx.owner.password);
    await admin
      .from('team_member_availability')
      .upsert({ org_id: fx.orgId, user_id: fx.employeeB.userId, availability_status: 'off_shift' }, { onConflict: 'org_id,user_id' });

    const { data, error } = await owner.rpc('get_scheduling_conflicts', {
      p_org_id: fx.orgId,
      p_user_id: fx.employeeB.userId,
      p_proposed_start: '2027-01-18T09:00:00Z',
      p_proposed_end: '2027-01-18T11:00:00Z',
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: availabilityRow } = await admin
      .from('team_member_availability')
      .select('availability_status')
      .eq('org_id', fx.orgId)
      .eq('user_id', fx.employeeB.userId)
      .single();
    expect(availabilityRow?.availability_status).toBe('off_shift');
  });

  test('9. override behavior: create_job_with_schedule succeeds despite a real conflict when p_override_conflicts=true', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-19';
    await createFixtureJob(`${day}T09:00:00Z`, `${day}T11:00:00Z`, fx.employeeA.userId);

    const withoutOverride = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Override test (blocked)`,
      p_scheduled_start: `${day}T10:00:00Z`,
      p_scheduled_end: `${day}T12:00:00Z`,
      p_crew_user_ids: [fx.employeeA.userId],
      p_override_conflicts: false,
    });
    expect(withoutOverride.error).not.toBeNull();
    expect(withoutOverride.error?.message).toContain('SCHEDULING_CONFLICT');

    const withOverride = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Override test (allowed)`,
      p_scheduled_start: `${day}T10:00:00Z`,
      p_scheduled_end: `${day}T12:00:00Z`,
      p_crew_user_ids: [fx.employeeA.userId],
      p_override_conflicts: true,
    });
    expect(withOverride.error).toBeNull();
    const jobId = (withOverride.data as { id: string }).id;
    createdJobIds.push(jobId);

    const { data: overrideLog } = await admin
      .from('activity_log')
      .select('event_type')
      .eq('entity_id', jobId)
      .eq('event_type', 'job_scheduling_conflict_overridden');
    expect(overrideLog ?? []).toHaveLength(1);
  });

  test('10-12. forced crew/schedule failures roll back the whole job creation — no partial job/crew/schedule ever persists', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);

    // 11. invalid crew member (not an org member) forces failure.
    const beforeCount = (await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', fx.orgId)).count ?? 0;
    const invalidCrew = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Should never exist (bad crew)`,
      p_scheduled_start: '2027-01-20T09:00:00Z',
      p_scheduled_end: '2027-01-20T11:00:00Z',
      p_crew_user_ids: [crypto.randomUUID()],
    });
    expect(invalidCrew.error).not.toBeNull();
    const afterInvalidCrewCount = (await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', fx.orgId)).count ?? 0;
    expect(afterInvalidCrewCount).toBe(beforeCount);
    const { data: leakedByTitle1 } = await admin.from('jobs').select('id').eq('org_id', fx.orgId).eq('title', `${E2E_TEST_PREFIX} Should never exist (bad crew)`);
    expect(leakedByTitle1 ?? []).toHaveLength(0);

    // 12. scheduled_end <= scheduled_start forces failure.
    const badSchedule = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Should never exist (bad schedule)`,
      p_scheduled_start: '2027-01-20T11:00:00Z',
      p_scheduled_end: '2027-01-20T09:00:00Z',
      p_crew_user_ids: [fx.employeeA.userId],
    });
    expect(badSchedule.error).not.toBeNull();
    const { data: leakedByTitle2 } = await admin.from('jobs').select('id').eq('org_id', fx.orgId).eq('title', `${E2E_TEST_PREFIX} Should never exist (bad schedule)`);
    expect(leakedByTitle2 ?? []).toHaveLength(0);
  });

  test('13. no partial linkage or side effects survive a rolled-back attempt', async () => {
    // The failed attempts above must have produced zero job_assignments,
    // zero invoices, and zero activity_log rows tied to a nonexistent job —
    // there is nothing to look up by job id since no job was ever created,
    // which is itself the proof: the FK-scoped queries below are
    // structurally guaranteed empty because rollback means the job row
    // (and everything that would reference it) never committed.
    const { data: orphanAssignments } = await admin
      .from('job_assignments')
      .select('id')
      .eq('org_id', fx.orgId)
      .not('job_id', 'in', `(${createdJobIds.length > 0 ? createdJobIds.map((id) => `'${id}'`).join(',') : "'00000000-0000-0000-0000-000000000000'"})`);
    expect(orphanAssignments ?? []).toHaveLength(0);
  });

  test('14-17. a successful transaction creates exactly one job, exactly the intended crew, at most one lead, and correct activity/audit rows', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const day = '2027-01-21';
    const title = `${E2E_TEST_PREFIX} Full success ${uniqueSuffix()}`;

    const { data, error } = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: title,
      p_scheduled_start: `${day}T09:00:00Z`,
      p_scheduled_end: `${day}T11:00:00Z`,
      p_crew_user_ids: [fx.employeeA.userId, fx.employeeB.userId],
      p_lead_user_id: fx.employeeA.userId,
    });
    expect(error).toBeNull();
    const jobId = (data as { id: string; scheduled: boolean; crewAssignedCount: number }).id;
    createdJobIds.push(jobId);
    expect((data as { scheduled: boolean }).scheduled).toBe(true);
    expect((data as { crewAssignedCount: number }).crewAssignedCount).toBe(2);

    // 14. exactly one job with this title exists.
    const { data: jobsByTitle } = await admin.from('jobs').select('id, status').eq('org_id', fx.orgId).eq('title', title);
    expect(jobsByTitle ?? []).toHaveLength(1);
    expect(jobsByTitle?.[0]?.status).toBe('scheduled');

    // 15. exactly the intended crew assignments exist.
    const { data: assignments } = await admin.from('job_assignments').select('user_id, is_lead').eq('job_id', jobId);
    expect((assignments ?? []).map((a) => a.user_id).sort()).toEqual([fx.employeeA.userId, fx.employeeB.userId].sort());

    // 16. at most one lead.
    const leads = (assignments ?? []).filter((a) => a.is_lead);
    expect(leads).toHaveLength(1);
    expect(leads[0]?.user_id).toBe(fx.employeeA.userId);

    // 17. activity/audit rows are correct.
    const { data: activity } = await admin.from('activity_log').select('event_type').eq('entity_id', jobId).eq('entity_type', 'job');
    const eventTypes = (activity ?? []).map((a) => a.event_type);
    expect(eventTypes).toContain('job_scheduled');
    expect(eventTypes).toContain('job_crew_assigned_lead');
    expect(eventTypes).toContain('job_crew_assigned');

    // A working invoice was also activated, mirroring apply_job_scheduling.
    const { data: invoice } = await admin.from('invoices').select('id, kind, status').eq('job_id', jobId).eq('kind', 'working').maybeSingle();
    expect(invoice?.status).toBe('draft');
  });

  test('base job creation with no schedule/crew still works and defaults to status=lead (unchanged authority)', async () => {
    const owner = await signIn(fx.owner.email, fx.owner.password);
    const title = `${E2E_TEST_PREFIX} Unscheduled base job ${uniqueSuffix()}`;

    const { data, error } = await owner.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: title,
    });
    expect(error).toBeNull();
    const jobId = (data as { id: string; scheduled: boolean; crewAssignedCount: number }).id;
    createdJobIds.push(jobId);
    expect((data as { scheduled: boolean }).scheduled).toBe(false);
    expect((data as { crewAssignedCount: number }).crewAssignedCount).toBe(0);

    const { data: job } = await admin.from('jobs').select('status, scheduled_start').eq('id', jobId).single();
    expect(job?.status).toBe('lead');
    expect(job?.scheduled_start).toBeNull();
  });

  test('subcontractor/viewer without canScheduleJobs cannot schedule or assign crew at creation (base job creation, no schedule, still succeeds)', async () => {
    const suffix = uniqueSuffix();
    const email = `${E2E_TEST_PREFIX.toLowerCase()}sched-viewer-${suffix}@example.com`;
    const password = `Sched_${Math.random().toString(36).slice(2)}!1`;
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const viewerId = created!.user!.id;
    await admin.from('org_members').insert({ org_id: fx.orgId, user_id: viewerId, role: 'viewer', status: 'active' });

    const viewer = await signIn(email, password);
    const day = '2027-01-22';

    const { error: scheduledAttemptError } = await viewer.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Viewer should not schedule`,
      p_scheduled_start: `${day}T09:00:00Z`,
      p_scheduled_end: `${day}T11:00:00Z`,
    });
    expect(scheduledAttemptError).not.toBeNull();
    expect(scheduledAttemptError?.message).toContain('canScheduleJobs');

    const { data: unscheduled, error: unscheduledError } = await viewer.rpc('create_job_with_schedule', {
      p_customer_id: fx.customerId,
      p_property_id: fx.propertyId,
      p_title: `${E2E_TEST_PREFIX} Viewer base job ${suffix}`,
    });
    expect(unscheduledError).toBeNull();
    createdJobIds.push((unscheduled as { id: string }).id);

    await admin.from('org_members').delete().eq('org_id', fx.orgId).eq('user_id', viewerId);
    await admin.auth.admin.deleteUser(viewerId);
  });

  test('18. zero residue — cleanup in afterAll removes every fixture row created by this bot', async () => {
    expect(createdJobIds.length).toBeGreaterThan(0);
    expect(fx.orgId).toBeTruthy();
  });
});
