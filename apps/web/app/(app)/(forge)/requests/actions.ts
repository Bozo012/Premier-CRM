'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  ServiceRequestPayloadSchema,
  err,
  hasCapability,
  ok,
  type OrgRole,
  type Result,
} from '@premier/shared';
import { createServiceClient, createServiceRequest, getActiveOrgContext, recordRequestTriage } from '@premier/db';

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

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value || undefined;
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
// Manual staff request intake
// ---------------------------------------------------------------------------

export type CreateManualRequestActionState = Result<{ requestId: string }>;

export async function createManualRequestAction(
  _prevState: CreateManualRequestActionState | null,
  formData: FormData
): Promise<CreateManualRequestActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, role } = contextResult.data;

  if (!hasCapability(role, 'canTriageRequests')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not have permission to create requests.');
  }

  const parsed = ServiceRequestPayloadSchema.safeParse({
    name: readString(formData, 'name'),
    email: readOptionalString(formData, 'email'),
    phone: readOptionalString(formData, 'phone'),
    preferred_channel: readOptionalString(formData, 'preferredChannel'),
    address_line_1: readString(formData, 'addressLine1'),
    address_line_2: readOptionalString(formData, 'addressLine2'),
    city: readString(formData, 'city'),
    state: readString(formData, 'state'),
    zip: readString(formData, 'zip'),
    country: readOptionalString(formData, 'country') ?? 'US',
    property_type: readOptionalString(formData, 'propertyType'),
    service_category: readOptionalString(formData, 'serviceCategory'),
    service_title: readString(formData, 'serviceTitle'),
    service_description: readString(formData, 'serviceDescription'),
    preferred_date: readOptionalString(formData, 'preferredDate'),
    preferred_time: readOptionalString(formData, 'preferredTime'),
    access_notes: readOptionalString(formData, 'accessNotes'),
    priority: readOptionalString(formData, 'priority') ?? 'normal',
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(ErrorCode.VALIDATION_ERROR, firstIssue?.message ?? 'Invalid request details.');
  }

  const client = createServiceClient();
  const result = await createServiceRequest(client, {
    orgId,
    payload: parsed.data,
    source: 'manual',
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/requests');
  revalidatePath('/today');

  return ok({ requestId: result.data.serviceRequestId });
}

// ---------------------------------------------------------------------------
// Create estimate from request
//
// F2 (docs/releases/forge-v1-readiness-audit.md; docs/implementation/
// v1-known-gaps-audit.md §9): this legacy action used to hand-reproduce
// record_request_triage(decision='remote_estimate')'s insert/update logic
// directly against the tables, which meant it never set triage_decision/
// triage_reason/triaged_by/triaged_at, and — because it checked
// estimate_id/job_id instead of triage_decision — could be called again
// after the request had already been triaged some other way (e.g.
// site_visit_required), producing a request in two conflicting states at
// once. It also had no capability check at all (unlike createManualRequest-
// Action/createJobFromRequestAction), so — although this action has no
// remaining UI caller (TriagePanel is the only visible trigger; see
// tests/e2e/request-conversion-bot.spec.ts) — a direct call could reach it
// as a viewer, which canTriageRequests never permits.
//
// Fix: delegate to record_request_triage itself rather than duplicating its
// transition logic a second time. This is the same authoritative RPC
// TriagePanel calls via recordRequestTriageAction — the two paths now
// produce byte-identical service_requests state, one source of triage
// semantics, and the RPC's own capability + duplicate-triage checks apply
// here for free.
// ---------------------------------------------------------------------------

export type CreateEstimateFromRequestActionState = Result<{ estimateId: string }>;

export async function createEstimateFromRequestAction(
  _prevState: CreateEstimateFromRequestActionState | null,
  formData: FormData
): Promise<CreateEstimateFromRequestActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;

  const requestId = readString(formData, 'requestId');
  if (!requestId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const supabase = await getServerSupabase();
  const result = await recordRequestTriage(supabase, {
    requestId,
    decision: 'remote_estimate',
    reason: 'Estimate created via legacy conversion action.',
  });
  if (!result.success) return result;

  const { estimateId } = result.data;
  if (!estimateId) {
    return err(ErrorCode.DB_ERROR, 'Triage succeeded but no estimate was created.');
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/estimates');

  return ok({ estimateId });
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
