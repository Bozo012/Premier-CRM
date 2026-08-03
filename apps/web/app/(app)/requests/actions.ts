'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, hasCapability, ok, type OrgRole, type Result } from '@premier/shared';
import { createServiceClient, getActiveOrgContext, logActivity } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface RequestActionContext {
  orgId: string;
  userId: string;
  role: OrgRole;
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

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  return ok({
    orgId: orgContextResult.data.orgId,
    userId: user.id,
    role: orgContextResult.data.role as OrgRole,
  });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

async function getRequestConversionContext(args: {
  orgId: string;
  requestId: string;
}): Promise<
  Result<{
    customerId: string;
    estimateTitle: string;
    orgId: string;
    propertyId: string;
    request: {
      id: string;
      customer_id: string | null;
      estimate_id: string | null;
      job_id: string | null;
      property_id: string | null;
      service_category: string | null;
      service_description: string | null;
      service_title: string;
    };
  }>
> {
  const client = createServiceClient();

  const { data: request, error: fetchError } = await client
    .from('service_requests')
    .select(
      'id, service_title, service_category, service_description, customer_id, property_id, estimate_id, job_id'
    )
    .eq('id', args.requestId)
    .eq('org_id', args.orgId)
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

  if (request.job_id) {
    return err(ErrorCode.VALIDATION_ERROR, 'A work order already exists for this request.');
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

  return ok({
    customerId: request.customer_id,
    estimateTitle: request.service_category ?? request.service_title,
    orgId: args.orgId,
    propertyId,
    request,
  });
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

  const conversionResult = await getRequestConversionContext({ orgId, requestId });
  if (!conversionResult.success) return conversionResult;
  const { customerId, estimateTitle, propertyId, request } = conversionResult.data;

  const client = createServiceClient();

  const { data: newEstimate, error: insertError } = await client
    .from('estimates')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      service_request_id: requestId,
      description: request.service_description ?? null,
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

  await logActivity(client, {
    orgId,
    entityType: 'estimate',
    entityId: newEstimate.id,
    eventType: 'estimate_created_from_request',
    message: `Estimate created from service request ${requestId}.`,
    actorUserId: userId,
  });

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/estimates');

  return ok({ estimateId: newEstimate.id });
}

// ---------------------------------------------------------------------------
// Direct work-order job from request
// ---------------------------------------------------------------------------

export type CreateJobFromRequestActionState = Result<{ jobId: string }>;

export async function createJobFromRequestAction(
  _prevState: CreateJobFromRequestActionState | null,
  formData: FormData
): Promise<CreateJobFromRequestActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId, role } = contextResult.data;

  // A direct work order skips quoting/pricing review entirely, matching the
  // guarded record_request_triage(decision='direct_work_order') RPC's own
  // restriction — this legacy "second door" must enforce the same boundary,
  // not a looser one, or it becomes exactly the casual bypass that RPC was
  // built to prevent.
  if (!hasCapability(role, 'canCreateDirectWorkOrder')) {
    return err(ErrorCode.FORBIDDEN, 'Only an owner or admin can create a direct work order.');
  }

  const requestId = readString(formData, 'requestId');
  if (!requestId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const conversionResult = await getRequestConversionContext({ orgId, requestId });
  if (!conversionResult.success) return conversionResult;
  const { customerId, estimateTitle, propertyId, request } = conversionResult.data;

  const client = createServiceClient();

  const { data: job, error: jobError } = await client
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      description: request.service_description ?? null,
      title: estimateTitle,
      status: 'approved',
      created_by: userId,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    return err(ErrorCode.DB_ERROR, jobError?.message ?? 'Failed to create job.');
  }

  const { error: updateError } = await client
    .from('service_requests')
    .update({
      job_id: job.id,
      status: 'approved',
      converted_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('org_id', orgId);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath(`/jobs/${job.id}`);
  revalidatePath('/jobs');

  return ok({ jobId: job.id });
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
  const { orgId, role } = contextResult.data;

  // Marking a request reviewed is part of the same request-workflow
  // lifecycle as triage — reuse canTriageRequests rather than inventing a
  // separate permission (see docs/security/service-requests-authorization-audit.md).
  if (!hasCapability(role, 'canTriageRequests')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not have permission to review requests.');
  }

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
