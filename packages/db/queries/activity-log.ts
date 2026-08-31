/**
 * Shared reader/writer for `activity_log` — see
 * supabase/migrations/20260731010000_activity_log.sql for the table's own
 * rationale. This file adds two things that didn't exist before:
 *
 * 1. `logActivity()` — a single shared insert helper, so every call site
 *    (job creation, deposit waive, final invoice generation, etc.) writes
 *    the same shape instead of each hand-rolling its own `.insert()`.
 * 2. An audience-aware split: `getEntityTimeline()` returns raw, full
 *    entries for staff; `getEntityTimelineForCustomer()` applies an
 *    explicit allow-list of `event_type` values AT THE QUERY LEVEL and
 *    maps each to customer-facing copy, so the portal never reads raw
 *    activity_log rows directly. An event type absent from the allow-list
 *    is excluded by default (opt-in, not opt-out) — a new internal event
 *    type never leaks to a customer just because someone added an insert
 *    for it.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type ActivityLogEntry = Database['public']['Tables']['activity_log']['Row'];

export type ActivityLogEventType =
  | 'job_created_from_accepted_quote'
  | 'estimate_created_from_request'
  | 'estimate_status_changed'
  | 'quote_sent'
  | 'deposit_requested'
  | 'deposit_waived'
  | 'final_invoice_generated'
  | 'payment_recorded'
  | 'expense_created'
  | 'expense_submitted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'expense_voided'
  | 'job_note_general'
  | 'job_note_material'
  | 'job_note_safety'
  | 'invoice_email_sent'
  | 'invoice_email_failed';

/** Single shared insert path — every write site should call this, not `.insert()` directly. */
export async function logActivity(
  client: DbClient,
  args: {
    orgId: string;
    entityType: string;
    entityId: string;
    eventType: ActivityLogEventType;
    message: string;
    actorUserId: string | null;
  }
): Promise<void> {
  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    event_type: args.eventType,
    message: args.message,
    actor_user_id: args.actorUserId,
  });
}

/** Staff-facing: raw, full entries, ordered oldest-first. */
export async function getEntityTimeline(
  client: DbClient,
  args: { orgId: string; entityType: string; entityId: string }
): Promise<Result<ActivityLogEntry[]>> {
  const { data, error } = await client
    .from('activity_log')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('entity_type', args.entityType)
    .eq('entity_id', args.entityId)
    .order('created_at', { ascending: true });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data ?? []);
}

/**
 * Staff-facing: the single most recent entry matching one of `eventTypes`
 * for an entity, or null if none exists yet. Used to show a durable
 * (survives page refresh, unlike a toast) "last known" state — e.g. was
 * the customer actually emailed the last time this invoice was sent.
 */
export async function getLatestEntityEvent(
  client: DbClient,
  args: { orgId: string; entityType: string; entityId: string; eventTypes: ActivityLogEventType[] }
): Promise<Result<ActivityLogEntry | null>> {
  const { data, error } = await client
    .from('activity_log')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('entity_type', args.entityType)
    .eq('entity_id', args.entityId)
    .in('event_type', args.eventTypes)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data ?? null);
}

export interface CustomerTimelineEntry {
  id: string;
  eventType: ActivityLogEventType;
  label: string;
  createdAt: string;
}

// Opt-in allow-list: only event types explicitly reviewed for customer
// visibility appear here, each mapped to fixed customer-facing copy
// rather than the raw (potentially internally-toned) `message` column.
const CUSTOMER_VISIBLE_EVENT_COPY: Partial<Record<ActivityLogEventType, string>> = {
  job_created_from_accepted_quote: 'Your job was created.',
  quote_sent: 'A quote was sent to you.',
  deposit_requested: 'A deposit was requested for your job.',
  deposit_waived: 'The deposit requirement for your job was waived.',
  final_invoice_generated: 'Your final invoice was generated.',
  payment_recorded: 'A payment was recorded on your invoice.',
};

function projectTimelineForCustomer(entries: ActivityLogEntry[]): CustomerTimelineEntry[] {
  const result: CustomerTimelineEntry[] = [];

  for (const entry of entries) {
    const label = CUSTOMER_VISIBLE_EVENT_COPY[entry.event_type as ActivityLogEventType];
    if (!label) continue;

    result.push({
      id: entry.id,
      eventType: entry.event_type as ActivityLogEventType,
      label,
      createdAt: entry.created_at,
    });
  }

  return result;
}

/**
 * Customer-facing: filters to the allow-list at the query level (not just
 * client-side after the fact) and returns fixed customer-safe copy, never
 * the raw `message` column.
 */
export async function getEntityTimelineForCustomer(
  client: DbClient,
  args: { orgId: string; entityType: string; entityId: string }
): Promise<Result<CustomerTimelineEntry[]>> {
  const allowedEventTypes = Object.keys(CUSTOMER_VISIBLE_EVENT_COPY);

  const { data, error } = await client
    .from('activity_log')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('entity_type', args.entityType)
    .eq('entity_id', args.entityId)
    .in('event_type', allowedEventTypes)
    .order('created_at', { ascending: true });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(projectTimelineForCustomer(data ?? []));
}
