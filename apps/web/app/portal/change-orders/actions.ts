'use server';

import { revalidatePath } from 'next/cache';

import {
  addChangeOrderComment,
  createChangeOrderDraft,
  createServiceClient,
  incorporateChangeOrderRevision,
  respondToChangeOrderRevision,
} from '@premier/db';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

async function resolveActivePortalCustomer(): Promise<
  Result<{ customerId: string; orgId: string }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return err(ErrorCode.FORBIDDEN, 'You must be signed in to the portal.');

  const serviceClient = createServiceClient();
  const { data: account, error } = await serviceClient
    .from('customer_accounts')
    .select('customer_id, org_id, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!account || account.status !== 'active') {
    return err(ErrorCode.FORBIDDEN, 'No active portal account link found.');
  }

  return ok({ customerId: account.customer_id, orgId: account.org_id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export type RequestChangeOrderActionState = Result<{ changeOrderId: string }>;

/**
 * Customer-initiated request. Creates a draft only — it has no contractual
 * or invoice effect and cannot self-propose. Staff must formalize
 * (createChangeOrderDraftAction / proposeChangeOrderAction) before it can
 * be approved.
 */
export async function requestChangeOrderAction(
  _previousState: RequestChangeOrderActionState | null,
  formData: FormData
): Promise<RequestChangeOrderActionState> {
  const identity = await resolveActivePortalCustomer();
  if (!identity.success) return identity;
  const { customerId, orgId } = identity.data;

  const jobId = readString(formData, 'jobId');
  const reason = readString(formData, 'reason');
  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');
  if (!reason) return err(ErrorCode.VALIDATION_ERROR, 'Please describe what you are requesting.');

  const serviceClient = createServiceClient();

  const { data: job } = await serviceClient
    .from('jobs')
    .select('id, customer_id, org_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || job.customer_id !== customerId || job.org_id !== orgId) {
    return err(ErrorCode.FORBIDDEN, 'This job does not belong to your account.');
  }

  const result = await createChangeOrderDraft(serviceClient, {
    orgId,
    jobId,
    initiator: 'customer',
    requestedByCustomerId: customerId,
    createdByUserId: null,
    reason,
    lineItems: [],
  });

  if (!result.success) return result;

  revalidatePath('/portal/dashboard');
  return ok({ changeOrderId: result.data.change_order_id });
}

export type RespondToChangeOrderActionState = Result<{ revisionId: string; status: string }>;

export async function respondToChangeOrderAction(
  _previousState: RespondToChangeOrderActionState | null,
  formData: FormData
): Promise<RespondToChangeOrderActionState> {
  const identity = await resolveActivePortalCustomer();
  if (!identity.success) return identity;
  const { customerId } = identity.data;

  const revisionId = readString(formData, 'revisionId');
  const response = readString(formData, 'response') as 'approved' | 'declined' | 'revision_requested';
  const decisionNote = readString(formData, 'decisionNote');
  const acknowledgmentVersion = readString(formData, 'acknowledgmentVersion');

  if (!revisionId) return err(ErrorCode.VALIDATION_ERROR, 'Revision ID is required.');
  if (!['approved', 'declined', 'revision_requested'].includes(response)) {
    return err(ErrorCode.VALIDATION_ERROR, 'Invalid response.');
  }

  const serviceClient = createServiceClient();
  const result = await respondToChangeOrderRevision(serviceClient, {
    revisionId,
    actorCustomerId: customerId,
    response,
    decisionNote: decisionNote || null,
    acknowledgmentVersion: acknowledgmentVersion || null,
  });

  if (!result.success) return result;

  // Approval is the contractual acceptance — incorporate immediately so
  // the working invoice reflects it without a separate staff step. Best-
  // effort: never blocks the response that already succeeded above.
  if (result.data.status === 'approved') {
    const incorporateResult = await incorporateChangeOrderRevision(serviceClient, {
      revisionId,
      actorUserId: null,
    });
    if (!incorporateResult.success) {
      console.error('[portal change-orders] incorporation failed:', incorporateResult.error);
    }
  }

  revalidatePath('/portal/dashboard');
  return ok({ revisionId: result.data.id, status: result.data.status });
}

export type AddChangeOrderCommentActionState = Result<{ commentId: string }>;

export async function addChangeOrderCommentAction(
  _previousState: AddChangeOrderCommentActionState | null,
  formData: FormData
): Promise<AddChangeOrderCommentActionState> {
  const identity = await resolveActivePortalCustomer();
  if (!identity.success) return identity;
  const { customerId, orgId } = identity.data;

  const changeOrderId = readString(formData, 'changeOrderId');
  const revisionId = readString(formData, 'revisionId') || null;
  const body = readString(formData, 'body');

  if (!changeOrderId) return err(ErrorCode.VALIDATION_ERROR, 'Change order ID is required.');
  if (!body) return err(ErrorCode.VALIDATION_ERROR, 'Comment cannot be empty.');

  const serviceClient = createServiceClient();

  const { data: changeOrder } = await serviceClient
    .from('change_orders')
    .select('id, job_id, org_id, jobs:job_id(customer_id)')
    .eq('id', changeOrderId)
    .maybeSingle();

  const jobCustomerId = (changeOrder as unknown as { jobs?: { customer_id?: string } } | null)?.jobs
    ?.customer_id;
  if (!changeOrder || jobCustomerId !== customerId) {
    return err(ErrorCode.FORBIDDEN, 'This change order does not belong to your account.');
  }

  const result = await addChangeOrderComment(serviceClient, {
    orgId,
    changeOrderId,
    revisionId,
    authorCustomerId: customerId,
    body,
  });

  if (!result.success) return result;

  revalidatePath('/portal/dashboard');
  return ok({ commentId: result.data.id });
}
