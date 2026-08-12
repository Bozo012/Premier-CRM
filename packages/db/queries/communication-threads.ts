/**
 * Customer / Staff Threaded Messaging (docs: see PR description —
 * 20260812010000_customer_staff_threaded_messaging.sql). Replaces the
 * one-shot activity_log('portal_contact_requested') submission flow.
 *
 * Customer mutations/reads always go through the SECURITY DEFINER RPCs
 * (org/customer identity derived server-side from auth.uid(), never
 * client-supplied). Staff reads/writes use ordinary org-scoped RLS
 * (org_isolation_communication_threads/_messages), except sending a reply,
 * which still goes through send_staff_reply() so sender_user_id is always
 * server-derived, never client-supplied.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';

export interface CommunicationThread {
  id: string;
  orgId: string;
  customerId: string;
  subject: string;
  category: string | null;
  relatedRequestId: string | null;
  relatedPropertyId: string | null;
  status: string;
  lastCustomerReadAt: string | null;
  lastStaffReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationMessage {
  id: string;
  threadId: string;
  orgId: string;
  senderType: 'customer' | 'staff';
  senderUserId: string | null;
  customerAccountId: string | null;
  body: string;
  createdAt: string;
}

interface ThreadRow {
  id: string;
  org_id: string;
  customer_id: string;
  subject: string;
  category: string | null;
  related_request_id: string | null;
  related_property_id: string | null;
  status: string;
  last_customer_read_at: string | null;
  last_staff_read_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  org_id: string;
  sender_type: string;
  sender_user_id: string | null;
  customer_account_id: string | null;
  body: string;
  created_at: string;
}

function mapThread(row: ThreadRow): CommunicationThread {
  return {
    id: row.id,
    orgId: row.org_id,
    customerId: row.customer_id,
    subject: row.subject,
    category: row.category,
    relatedRequestId: row.related_request_id,
    relatedPropertyId: row.related_property_id,
    status: row.status,
    lastCustomerReadAt: row.last_customer_read_at,
    lastStaffReadAt: row.last_staff_read_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): CommunicationMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    orgId: row.org_id,
    senderType: row.sender_type as 'customer' | 'staff',
    senderUserId: row.sender_user_id,
    customerAccountId: row.customer_account_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Customer-side — always the user's own session client, RPC-mediated.
// ---------------------------------------------------------------------------

export interface StartCustomerThreadInput {
  subject: string;
  body: string;
  category?: string | null;
  relatedRequestId?: string | null;
  relatedPropertyId?: string | null;
}

export async function startCustomerThread(client: DbClient, input: StartCustomerThreadInput): Promise<Result<CommunicationThread>> {
  const { data, error } = await client.rpc('start_customer_thread', {
    p_subject: input.subject,
    p_body: input.body,
    p_category: input.category ?? undefined,
    p_related_request_id: input.relatedRequestId ?? undefined,
    p_related_property_id: input.relatedPropertyId ?? undefined,
  });
  if (error || !data) return err(ErrorCode.VALIDATION_ERROR, error?.message ?? 'Failed to start conversation.');
  return ok(mapThread(data));
}

export async function sendCustomerMessage(client: DbClient, threadId: string, body: string): Promise<Result<CommunicationMessage>> {
  const { data, error } = await client.rpc('send_customer_message', { p_thread_id: threadId, p_body: body });
  if (error || !data) return err(ErrorCode.VALIDATION_ERROR, error?.message ?? 'Failed to send message.');
  return ok(mapMessage(data));
}

export async function listCustomerThreads(client: DbClient): Promise<Result<CommunicationThread[]>> {
  const { data, error } = await client.rpc('list_customer_threads');
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok((data ?? []).map(mapThread));
}

export async function listCustomerThreadMessages(client: DbClient, threadId: string): Promise<Result<CommunicationMessage[]>> {
  const { data, error } = await client.rpc('list_customer_thread_messages', { p_thread_id: threadId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok((data ?? []).map(mapMessage));
}

export async function markThreadReadByCustomer(client: DbClient, threadId: string): Promise<Result<null>> {
  const { error } = await client.rpc('mark_thread_read_by_customer', { p_thread_id: threadId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(null);
}

// ---------------------------------------------------------------------------
// Staff-side — org-scoped RLS for reads (no RPC needed), RPC for replies so
// sender_user_id is always server-derived.
// ---------------------------------------------------------------------------

export async function listOrgThreads(client: DbClient, orgId: string): Promise<Result<CommunicationThread[]>> {
  const { data, error } = await client
    .from('communication_threads')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok((data ?? []).map(mapThread));
}

export async function listThreadMessages(client: DbClient, threadId: string, orgId: string): Promise<Result<CommunicationMessage[]>> {
  const { data, error } = await client
    .from('communication_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok((data ?? []).map(mapMessage));
}

export async function sendStaffReply(client: DbClient, threadId: string, body: string): Promise<Result<CommunicationMessage>> {
  const { data, error } = await client.rpc('send_staff_reply', { p_thread_id: threadId, p_body: body });
  if (error || !data) return err(ErrorCode.VALIDATION_ERROR, error?.message ?? 'Failed to send reply.');
  return ok(mapMessage(data));
}

export async function markThreadReadByStaff(client: DbClient, threadId: string, orgId: string): Promise<Result<null>> {
  const { error } = await client
    .from('communication_threads')
    .update({ last_staff_read_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('org_id', orgId);
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(null);
}
