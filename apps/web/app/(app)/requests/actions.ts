'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface RequestActionContext {
  orgId: string;
  userId: string;
}

async function getRequestActionContext(): Promise<Result<RequestActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }

  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

// ---------------------------------------------------------------------------
// Create estimate from request
// ---------------------------------------------------------------------------

export type CreateEstimateFromRequestActionState = Result<{ estimateId: string }>;

export async function createEstimateFromRequestAction(
  _prevState: CreateEstimateFromRequestActionState | null,
  formData: FormData
): Promise<CreateEstimateFromRequestActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const requestId = readString(formData, 'requestId');
  if (!requestId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const client = createServiceClient();

  const { data: request, error: fetchError } = await client
    .from('service_requests')
    .select('id, service_title, service_category, customer_id, property_id, estimate_id')
    .eq('id', requestId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) {
    return err(ErrorCode.DB_ERROR, fetchError.message);
  }

  if (!request) {
    return err(ErrorCode.NOT_FOUND, 'Request not found.');
  }

  if (request.estimate_id) {
    return err(ErrorCode.VALIDATION_ERROR, 'An estimate already exists for this request.');
  }

  if (!request.customer_id) {
    return err(ErrorCode.VALIDATION_ERROR, 'No customer linked to this request.');
  }

  let propertyId = request.property_id as string | null;

  if (!propertyId) {
    const { data: link, error: linkError } = await client
      .from('customer_properties')
      .select('property_id')
      .eq('customer_id', request.customer_id)
      .limit(1)
      .maybeSingle();

    if (linkError) {
      return err(ErrorCode.DB_ERROR, linkError.message);
    }

    propertyId = link?.property_id ?? null;
  }

  if (!propertyId) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'No property on file for this customer. Add a property from the customer record first.'
    );
  }

  const estimateTitle = request.service_category ?? request.service_title;

  const { data: newEstimate, error: insertError } = await client
    .from('estimates')
    .insert({
      org_id: orgId,
      customer_id: request.customer_id,
      property_id: propertyId,
      service_request_id: requestId,
      title: estimateTitle,
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !newEstimate) {
    return err(ErrorCode.DB_ERROR, insertError?.message ?? 'Failed to create estimate.');
  }

  const { error: updateError } = await client
    .from('service_requests')
    .update({
      estimate_id: newEstimate.id,
      status: 'estimate_created',
      converted_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('org_id', orgId);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/estimates');

  return ok({ estimateId: newEstimate.id });
}

// ---------------------------------------------------------------------------
// Mark request as reviewed
// ---------------------------------------------------------------------------

export type MarkRequestReviewedActionState = Result<{ taskId: string }>;

export async function markRequestReviewedAction(
  _prevState: MarkRequestReviewedActionState | null,
  formData: FormData
): Promise<MarkRequestReviewedActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const requestId = readString(formData, 'taskId');
  if (!requestId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const client = createServiceClient();

  const { error } = await client
    .from('service_requests')
    .update({
      status: 'reviewing',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('org_id', orgId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');

  return ok({ taskId: requestId });
}
