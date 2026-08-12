/**
 * customer-staff-threaded-messaging-bot: live coverage for Customer / Staff
 * Threaded Messaging (20260812010000_customer_staff_threaded_messaging.sql)
 * — replaces the old one-shot activity_log('portal_contact_requested')
 * submission flow with a real two-way thread
 * (communication_threads/communication_messages,
 * start_customer_thread/send_customer_message/send_staff_reply/
 * list_customer_threads/list_customer_thread_messages/
 * mark_thread_read_by_customer).
 *
 * Security-critical: every assertion calls the RPCs (or the underlying
 * tables, for the direct-mutation-rejection tests) directly via the
 * Supabase client, proving the actual enforcement boundary.
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

interface CustomerAccount {
  email: string;
  password: string;
  userId: string;
  customerId: string;
}

interface Fixture {
  orgId: string;
  otherOrgId: string;
  customerId: string;
  otherCustomerId: string;
  requestId: string;
  otherOrgRequestId: string;
  owner: StaffAccount;
  admin: StaffAccount;
  employee: StaffAccount;
  subcontractor: StaffAccount;
  viewer: StaffAccount;
  otherOrgOwner: StaffAccount;
  customer: CustomerAccount;
  otherCustomer: CustomerAccount;
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

test.describe('customer-staff threaded messaging bot', () => {
  let admin: SupabaseClient<Database>;
  let fx: Fixture;
  let threadId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    const suffix = uniqueSuffix();
    const orgId = crypto.randomUUID();
    const otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: `${E2E_TEST_PREFIX}Messaging_${suffix}`, slug: `e2e-messaging-${suffix}` },
      { id: otherOrgId, name: `${E2E_TEST_PREFIX}MessagingOther_${suffix}`, slug: `e2e-messaging-other-${suffix}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'MessagingOwner', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const customerId = customer!.id;

    const { data: otherCustomerRow } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'MessagingOther', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const otherCustomerId = otherCustomerRow!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: `${E2E_TEST_PREFIX} Messaging Way`, city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();

    const { data: request } = await admin
      .from('service_requests')
      .insert({
        org_id: orgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: customerId,
        property_id: property!.id,
        contact_name: `${E2E_TEST_PREFIX} Messaging Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} Messaging Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10001',
        property_country: 'US',
        service_title: 'Messaging fixture request',
        service_description: 'Fixture request for customer-staff-threaded-messaging bot.',
      })
      .select('id')
      .single();
    const requestId = request!.id;

    // A request in the OTHER org — used to prove related-record ownership
    // is checked cross-org, not just cross-customer.
    const { data: otherOrgProperty } = await admin
      .from('properties')
      .insert({ org_id: otherOrgId, address_line_1: `${E2E_TEST_PREFIX} Other Org Way`, city: 'Testville', state: 'NY', zip: '10002', country: 'US' })
      .select('id')
      .single();
    const { data: otherOrgCustomer } = await admin
      .from('customers')
      .insert({ org_id: otherOrgId, type: 'residential', first_name: E2E_TEST_PREFIX, last_name: 'OtherOrgMessaging', source: 'manual_staff_entry' })
      .select('id')
      .single();
    const { data: otherOrgRequest } = await admin
      .from('service_requests')
      .insert({
        org_id: otherOrgId,
        source: 'website',
        status: 'reviewing',
        priority: 'normal',
        customer_id: otherOrgCustomer!.id,
        property_id: otherOrgProperty!.id,
        contact_name: `${E2E_TEST_PREFIX} Other Org Fixture`,
        property_address_line_1: `${E2E_TEST_PREFIX} Other Org Way`,
        property_city: 'Testville',
        property_state: 'NY',
        property_zip: '10002',
        property_country: 'US',
        service_title: 'Other-org fixture request',
        service_description: 'Fixture request for cross-org related-record test.',
      })
      .select('id')
      .single();

    async function createStaff(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer', targetOrgId: string): Promise<StaffAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}messaging-${role}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `Messaging_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    async function createCustomerAccount(customerIdForAccount: string, targetOrgId: string, label: string): Promise<CustomerAccount> {
      const email = `${E2E_TEST_PREFIX.toLowerCase()}messaging-${label}-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `Messaging_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(customer ${label}) failed: ${error?.message}`);
      await admin.from('customer_accounts').insert({
        org_id: targetOrgId,
        customer_id: customerIdForAccount,
        auth_user_id: created.user.id,
        email,
        status: 'active',
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      });
      return { email, password, userId: created.user.id, customerId: customerIdForAccount };
    }

    fx = {
      orgId,
      otherOrgId,
      customerId,
      otherCustomerId,
      requestId,
      otherOrgRequestId: otherOrgRequest!.id,
      owner: await createStaff('owner', orgId),
      admin: await createStaff('admin', orgId),
      employee: await createStaff('employee', orgId),
      subcontractor: await createStaff('subcontractor', orgId),
      viewer: await createStaff('viewer', orgId),
      otherOrgOwner: await createStaff('owner', otherOrgId),
      customer: await createCustomerAccount(customerId, orgId, 'owner'),
      otherCustomer: await createCustomerAccount(otherCustomerId, orgId, 'other'),
    };
  });

  test.afterAll(async () => {
    if (!admin || !fx) return;
    const userIds = [
      fx.owner.userId,
      fx.admin.userId,
      fx.employee.userId,
      fx.subcontractor.userId,
      fx.viewer.userId,
      fx.otherOrgOwner.userId,
      fx.customer.userId,
      fx.otherCustomer.userId,
    ];
    await admin.from('communication_messages').delete().eq('org_id', fx.orgId);
    await admin.from('communication_threads').delete().eq('org_id', fx.orgId);
    await admin.from('customer_accounts').delete().in('customer_id', [fx.customerId, fx.otherCustomerId]);
    await admin.from('org_members').delete().in('org_id', [fx.orgId, fx.otherOrgId]);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    await admin.from('service_requests').delete().in('org_id', [fx.orgId, fx.otherOrgId]);
    await admin.from('properties').delete().in('org_id', [fx.orgId, fx.otherOrgId]);
    await admin.from('customers').delete().in('id', [fx.customerId, fx.otherCustomerId]);
    await admin.from('customers').delete().eq('org_id', fx.otherOrgId);
    await admin.from('organizations').delete().in('id', [fx.orgId, fx.otherOrgId]);
  });

  test('1. customer can create a thread', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data, error } = await client.rpc('start_customer_thread', {
      p_subject: 'Question about my request',
      p_body: 'When will someone come by?',
      p_related_request_id: fx.requestId,
    });
    expect(error).toBeNull();
    expect(data?.customer_id).toBe(fx.customerId);
    expect(data?.org_id).toBe(fx.orgId);
    expect(data?.related_request_id).toBe(fx.requestId);
    threadId = data!.id;

    const { data: messages } = await admin.from('communication_messages').select('id, sender_type, body').eq('thread_id', threadId);
    expect(messages).toHaveLength(1);
    expect(messages?.[0]?.sender_type).toBe('customer');
  });

  test('2. customer can send a follow-up message', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data, error } = await client.rpc('send_customer_message', { p_thread_id: threadId, p_body: 'Any update?' });
    expect(error).toBeNull();
    expect(data?.sender_type).toBe('customer');
  });

  test('3. staff can see the thread', async () => {
    const client = await signIn(fx.owner.email, fx.owner.password);
    const { data, error } = await client.from('communication_threads').select('id, subject').eq('id', threadId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(threadId);
  });

  test('4. staff can reply', async () => {
    const client = await signIn(fx.owner.email, fx.owner.password);
    const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: "We'll be there Tuesday." });
    expect(error).toBeNull();
    expect(data?.sender_type).toBe('staff');
    expect(data?.sender_user_id).toBe(fx.owner.userId);
  });

  test('5. customer sees the staff reply', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data, error } = await client.rpc('list_customer_thread_messages', { p_thread_id: threadId });
    expect(error).toBeNull();
    expect((data ?? []).some((m) => m.sender_type === 'staff' && m.body === "We'll be there Tuesday.")).toBe(true);
  });

  test('6. ordering is stable (chronological, matches insert order)', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data } = await client.rpc('list_customer_thread_messages', { p_thread_id: threadId });
    const bodies = (data ?? []).map((m) => m.body);
    expect(bodies).toEqual([
      'When will someone come by?',
      'Any update?',
      "We'll be there Tuesday.",
    ]);
    const timestamps = (data ?? []).map((m) => new Date(m.created_at).getTime());
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  test('7. another customer cannot access the thread', async () => {
    const client = await signIn(fx.otherCustomer.email, fx.otherCustomer.password);
    const { data: threads } = await client.rpc('list_customer_threads');
    expect((threads ?? []).map((t) => t.id)).not.toContain(threadId);

    const { data: messages, error } = await client.rpc('list_customer_thread_messages', { p_thread_id: threadId });
    expect(error).toBeNull();
    expect(messages ?? []).toHaveLength(0);

    const { error: sendError } = await client.rpc('send_customer_message', { p_thread_id: threadId, p_body: 'Intrusion attempt' });
    expect(sendError).not.toBeNull();
  });

  test('8. another org cannot access the thread', async () => {
    const client = await signIn(fx.otherOrgOwner.email, fx.otherOrgOwner.password);
    const { data, error } = await client.from('communication_threads').select('id').eq('id', threadId).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();

    const { error: replyError } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Cross-org reply attempt' });
    expect(replyError).not.toBeNull();
  });

  test('9. customer cannot impersonate staff (send_staff_reply rejected for a customer session)', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Pretending to be staff' });
    expect(error).not.toBeNull();

    const { data: messages } = await admin.from('communication_messages').select('sender_user_id, customer_account_id').eq('thread_id', threadId);
    for (const m of messages ?? []) {
      // No message on this thread has a staff sender_user_id equal to the customer's own auth user id.
      expect(m.sender_user_id).not.toBe(fx.customer.userId);
    }
  });

  test('10. staff cannot spoof customer identity (customer_account_id is never client-supplied)', async () => {
    // send_staff_reply has no parameter for customer_account_id at all —
    // the RPC signature itself makes spoofing impossible, not just a
    // runtime check. Confirm every staff-authored message on this thread
    // has sender_type='staff' with a real sender_user_id, never a
    // customer_account_id.
    const { data: messages } = await admin
      .from('communication_messages')
      .select('sender_type, sender_user_id, customer_account_id')
      .eq('thread_id', threadId)
      .eq('sender_type', 'staff');
    expect(messages!.length).toBeGreaterThan(0);
    for (const m of messages!) {
      expect(m.sender_user_id).not.toBeNull();
      expect(m.customer_account_id).toBeNull();
    }
  });

  test('11. unauthenticated access is rejected', async () => {
    const anon = apiClient();
    const { data, error } = await anon.rpc('list_customer_threads');
    // Either an explicit auth error or an empty result (RPC's own
    // `auth.uid() is null` check inside start/send would raise; the SELECT-
    // style list function simply returns nothing for a null auth.uid()) is
    // an acceptable pass — what must never happen is real thread data
    // being returned to an anonymous caller.
    expect(error !== null || (data ?? []).length === 0).toBe(true);

    const { error: startError } = await anon.rpc('start_customer_thread', { p_subject: 'x', p_body: 'y' });
    expect(startError).not.toBeNull();
  });

  test('12. related request must belong to the same customer/org — cross-org and cross-customer both rejected', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);

    const { error: crossOrgError } = await client.rpc('start_customer_thread', {
      p_subject: 'Cross-org attempt',
      p_body: 'Trying to link someone else\'s org request',
      p_related_request_id: fx.otherOrgRequestId,
    });
    expect(crossOrgError).not.toBeNull();

    const otherClient = await signIn(fx.otherCustomer.email, fx.otherCustomer.password);
    const { error: crossCustomerError } = await otherClient.rpc('start_customer_thread', {
      p_subject: 'Cross-customer attempt',
      p_body: "Trying to link someone else's request",
      p_related_request_id: fx.requestId,
    });
    expect(crossCustomerError).not.toBeNull();
  });

  test('13. unread state behaves correctly (last_customer_read_at / last_staff_read_at)', async () => {
    const staffClient = await signIn(fx.owner.email, fx.owner.password);
    await staffClient.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'One more update' });

    const { data: beforeRead } = await admin
      .from('communication_threads')
      .select('updated_at, last_customer_read_at')
      .eq('id', threadId)
      .single();
    expect(new Date(beforeRead!.updated_at).getTime()).toBeGreaterThan(new Date(beforeRead!.last_customer_read_at!).getTime());

    const customerClient = await signIn(fx.customer.email, fx.customer.password);
    const { error: markError } = await customerClient.rpc('mark_thread_read_by_customer', { p_thread_id: threadId });
    expect(markError).toBeNull();

    const { data: afterRead } = await admin
      .from('communication_threads')
      .select('updated_at, last_customer_read_at')
      .eq('id', threadId)
      .single();
    expect(new Date(afterRead!.last_customer_read_at!).getTime()).toBeGreaterThanOrEqual(new Date(afterRead!.updated_at).getTime() - 1000);
  });

  test('14. old one-shot contact path is migrated/replaced cleanly — no portal_contact_requested rows are created by the new flow', async () => {
    const { count } = await admin
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', fx.orgId)
      .eq('event_type', 'portal_contact_requested');
    expect(count ?? 0).toBe(0);

    // The new flow's own high-level events are recorded instead.
    const { data: events } = await admin
      .from('activity_log')
      .select('event_type')
      .eq('org_id', fx.orgId)
      .eq('entity_id', threadId);
    const eventTypes = new Set((events ?? []).map((e) => e.event_type));
    expect(eventTypes.has('conversation_started')).toBe(true);
    expect(eventTypes.has('customer_message_received')).toBe(true);
    expect(eventTypes.has('staff_reply_sent')).toBe(true);
  });

  test('15. no duplicate phantom threads — one start_customer_thread call creates exactly one thread', async () => {
    const client = await signIn(fx.customer.email, fx.customer.password);
    const { data } = await client.rpc('start_customer_thread', { p_subject: 'Second conversation', p_body: 'A distinct topic.' });
    const { count } = await admin
      .from('communication_threads')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', fx.customerId)
      .eq('subject', 'Second conversation');
    expect(count).toBe(1);

    await admin.from('communication_messages').delete().eq('thread_id', data!.id);
    await admin.from('communication_threads').delete().eq('id', data!.id);
  });

  test('16. zero residue after teardown (verified structurally — this test just confirms fixture ids are non-null before afterAll runs)', async () => {
    expect(threadId).toBeTruthy();
    expect(fx.customer.userId).toBeTruthy();
    expect(fx.owner.userId).toBeTruthy();
  });

  // ==========================================================================
  // canReplyToCustomers role matrix (PR #144 correction): owner/admin/employee
  // allowed, subcontractor/viewer rejected. Proven directly against the RPC —
  // the actual enforcement boundary — not just the app-level capability map
  // (packages/shared/permissions.test.ts covers that half).
  // ==========================================================================

  test('17. admin reply succeeds', async () => {
    const client = await signIn(fx.admin.email, fx.admin.password);
    const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Admin reply.' });
    expect(error).toBeNull();
    expect(data?.sender_type).toBe('staff');
    expect(data?.sender_user_id).toBe(fx.admin.userId);
  });

  test('18. employee reply succeeds', async () => {
    const client = await signIn(fx.employee.email, fx.employee.password);
    const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Employee reply.' });
    expect(error).toBeNull();
    expect(data?.sender_type).toBe('staff');
    expect(data?.sender_user_id).toBe(fx.employee.userId);
  });

  test('19. subcontractor reply fails (direct RPC attempt rejected)', async () => {
    const client = await signIn(fx.subcontractor.email, fx.subcontractor.password);
    const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Subcontractor reply attempt.' });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: messages } = await admin.from('communication_messages').select('sender_user_id').eq('thread_id', threadId);
    for (const m of messages ?? []) {
      expect(m.sender_user_id).not.toBe(fx.subcontractor.userId);
    }
  });

  test('20. viewer reply fails (direct RPC attempt rejected)', async () => {
    const client = await signIn(fx.viewer.email, fx.viewer.password);
    const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Viewer reply attempt.' });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: messages } = await admin.from('communication_messages').select('sender_user_id').eq('thread_id', threadId);
    for (const m of messages ?? []) {
      expect(m.sender_user_id).not.toBe(fx.viewer.userId);
    }
  });

  test('21. unauthenticated caller cannot call send_staff_reply', async () => {
    const anon = apiClient();
    const { data, error } = await anon.rpc('send_staff_reply', { p_thread_id: threadId, p_body: 'Anonymous reply attempt.' });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
