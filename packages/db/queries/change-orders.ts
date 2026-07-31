/**
 * Thin wrappers around the SECURITY DEFINER RPC functions — these are the
 * ONLY way change_orders/revisions/line_items get mutated (see
 * 20260731150000_change_order_rpc_functions.sql for the actual
 * authorization/transition/immutability enforcement, which happens in the
 * database, not here).
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database, Json } from '../types';

export type ChangeOrder = Database['public']['Tables']['change_orders']['Row'];
export type ChangeOrderRevision = Database['public']['Tables']['change_order_revisions']['Row'];
export type ChangeOrderLineItem = Database['public']['Tables']['change_order_line_items']['Row'];
export type ChangeOrderComment = Database['public']['Tables']['change_order_comments']['Row'];

export interface ChangeOrderLineItemInput {
  kind: 'labor' | 'material' | 'credit' | 'other';
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  sourceReference?: string | null;
  sortOrder?: number;
}

export interface ChangeOrderDraftInput {
  orgId: string;
  jobId: string;
  changeOrderId?: string | null;
  initiator: 'customer' | 'contractor';
  requestedByCustomerId?: string | null;
  requestedByUserId?: string | null;
  createdByUserId: string | null;
  reason?: string | null;
  scopeChangeSummary?: string | null;
  scheduleOnly?: boolean;
  scheduleImpactNotes?: string | null;
  scheduleDeltaMinutes?: number | null;
  acknowledgmentText?: string | null;
  acknowledgmentVersion?: string | null;
  lineItems: ChangeOrderLineItemInput[];
}

export async function createChangeOrderDraft(
  client: DbClient,
  input: ChangeOrderDraftInput
): Promise<Result<ChangeOrderRevision>> {
  const { data, error } = await client.rpc('create_change_order_draft', {
    p_org_id: input.orgId,
    p_job_id: input.jobId,
    p_change_order_id: (input.changeOrderId ?? null) as unknown as string,
    p_initiator: input.initiator,
    p_requested_by_customer_id: (input.requestedByCustomerId ?? null) as unknown as string,
    p_requested_by_user_id: (input.requestedByUserId ?? null) as unknown as string,
    p_created_by_user_id: (input.createdByUserId ?? null) as unknown as string,
    p_reason: (input.reason ?? null) as unknown as string,
    p_scope_change_summary: (input.scopeChangeSummary ?? null) as unknown as string,
    p_schedule_only: input.scheduleOnly ?? false,
    p_schedule_impact_notes: (input.scheduleImpactNotes ?? null) as unknown as string,
    p_schedule_delta_minutes: (input.scheduleDeltaMinutes ?? null) as unknown as number,
    p_acknowledgment_text: (input.acknowledgmentText ?? null) as unknown as string,
    p_acknowledgment_version: (input.acknowledgmentVersion ?? null) as unknown as string,
    p_line_items: input.lineItems.map((item, index) => ({
      kind: item.kind,
      description: item.description,
      unit: item.unit ?? 'each',
      quantity: item.quantity,
      unit_price: item.unitPrice,
      taxable: item.taxable ?? true,
      source_reference: item.sourceReference ?? null,
      sort_order: item.sortOrder ?? index,
    })) as unknown as Json,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as ChangeOrderRevision);
}

export async function proposeChangeOrderRevision(
  client: DbClient,
  args: { revisionId: string; actorUserId: string; expectedPriceAdjustment?: number | null }
): Promise<Result<ChangeOrderRevision>> {
  const { data, error } = await client.rpc('propose_change_order_revision', {
    p_revision_id: args.revisionId,
    p_actor_user_id: args.actorUserId,
    p_expected_price_adjustment: (args.expectedPriceAdjustment ?? null) as unknown as number,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as ChangeOrderRevision);
}

export async function respondToChangeOrderRevision(
  client: DbClient,
  args: {
    revisionId: string;
    actorCustomerId: string;
    response: 'approved' | 'declined' | 'revision_requested';
    decisionNote?: string | null;
    acknowledgmentVersion?: string | null;
  }
): Promise<Result<ChangeOrderRevision>> {
  const { data, error } = await client.rpc('respond_to_change_order_revision', {
    p_revision_id: args.revisionId,
    p_actor_customer_id: args.actorCustomerId,
    p_response: args.response,
    p_decision_note: (args.decisionNote ?? null) as unknown as string,
    p_acknowledgment_version: (args.acknowledgmentVersion ?? null) as unknown as string,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as ChangeOrderRevision);
}

export async function withdrawChangeOrderRevision(
  client: DbClient,
  args: { revisionId: string; actorUserId: string }
): Promise<Result<ChangeOrderRevision>> {
  const { data, error } = await client.rpc('withdraw_change_order_revision', {
    p_revision_id: args.revisionId,
    p_actor_user_id: args.actorUserId,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as ChangeOrderRevision);
}

export async function incorporateChangeOrderRevision(
  client: DbClient,
  args: { revisionId: string; actorUserId: string | null }
): Promise<Result<ChangeOrderRevision>> {
  const { data, error } = await client.rpc('incorporate_change_order_revision', {
    p_revision_id: args.revisionId,
    p_actor_user_id: args.actorUserId as unknown as string,
  });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data as ChangeOrderRevision);
}

export async function addChangeOrderComment(
  client: DbClient,
  args: {
    orgId: string;
    changeOrderId: string;
    revisionId?: string | null;
    authorUserId?: string | null;
    authorCustomerId?: string | null;
    body: string;
  }
): Promise<Result<ChangeOrderComment>> {
  const { data, error } = await client
    .from('change_order_comments')
    .insert({
      org_id: args.orgId,
      change_order_id: args.changeOrderId,
      revision_id: args.revisionId ?? null,
      author_user_id: args.authorUserId ?? null,
      author_customer_id: args.authorCustomerId ?? null,
      body: args.body,
    })
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data);
}

export interface ChangeOrderThreadDetail {
  changeOrder: ChangeOrder;
  revisions: ChangeOrderRevision[];
  currentRevisionLineItems: ChangeOrderLineItem[];
  comments: ChangeOrderComment[];
}

export async function listChangeOrdersForJob(
  client: DbClient,
  args: { orgId: string; jobId: string }
): Promise<Result<ChangeOrderThreadDetail[]>> {
  const { data: changeOrders, error: coError } = await client
    .from('change_orders')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .order('created_at', { ascending: false });

  if (coError) return err(ErrorCode.DB_ERROR, coError.message);
  if (!changeOrders || changeOrders.length === 0) return ok([]);

  const threads: ChangeOrderThreadDetail[] = [];
  for (const changeOrder of changeOrders) {
    const { data: revisions } = await client
      .from('change_order_revisions')
      .select('*')
      .eq('change_order_id', changeOrder.id)
      .order('version', { ascending: false });

    const currentRevision = revisions?.find((r) => r.id === changeOrder.current_revision_id) ?? revisions?.[0];

    const { data: lineItems } = currentRevision
      ? await client
          .from('change_order_line_items')
          .select('*')
          .eq('revision_id', currentRevision.id)
          .order('sort_order')
      : { data: [] };

    const { data: comments } = await client
      .from('change_order_comments')
      .select('*')
      .eq('change_order_id', changeOrder.id)
      .order('created_at');

    threads.push({
      changeOrder,
      revisions: revisions ?? [],
      currentRevisionLineItems: lineItems ?? [],
      comments: comments ?? [],
    });
  }

  return ok(threads);
}
