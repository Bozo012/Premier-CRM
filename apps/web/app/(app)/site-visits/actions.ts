'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  err,
  ok,
  validateInspectionResponses,
  validateRequiredFieldsPresent,
  type InspectionFieldDefinition,
  type Result,
} from '@premier/shared';
import {
  approveEstimatePricing,
  cancelSiteVisit,
  cancelSiteVisitAppointment,
  completeSiteVisit,
  correctRequestTriage,
  createServiceClient,
  createQuoteFromEstimateRpc,
  generateEstimateFromSiteVisit,
  getActiveOrgContext,
  recordRequestTriage,
  requestEstimatePricingReview,
  rescheduleSiteVisit,
  reopenEstimateForEdit,
  returnEstimatePricingForChanges,
  requestPendingUpload,
  saveSiteVisitInspectionTrusted,
  scheduleSiteVisit,
  startSiteVisit,
  undoSiteVisitStart,
} from '@premier/db';

import { finalizeSiteVisitUpload } from '@/lib/site-visit-attachments';
import { getServerSupabase } from '@/lib/supabase-server';

import { toUserFacingError } from './error-translation';

// ---------------------------------------------------------------------------
// Shared auth context — this workflow's RPCs enforce their own capability
// checks server-side (see supabase/migrations/20260802*), so this context
// only needs to establish who's asking and which org, not re-check
// capabilities here (that would be a second, potentially-drifting copy of
// the same check the RPC already performs).
// ---------------------------------------------------------------------------

async function getWorkflowActionContext(): Promise<Result<{ orgId: string; userId: string }>> {
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

  return ok({ orgId: orgContextResult.data.orgId, userId: user.id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value.length > 0 ? value : null;
}

function readOptionalNumber(formData: FormData, key: string): number | null {
  const value = readOptionalString(formData, key);
  return value !== null ? Number(value) : null;
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export type TriageActionState = Result<{ estimateId: string | null; siteVisitId: string | null; jobId: string | null }>;

export async function recordRequestTriageAction(
  _prevState: TriageActionState | null,
  formData: FormData
): Promise<TriageActionState> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const requestId = readString(formData, 'requestId');
  const decision = readString(formData, 'decision') as 'remote_estimate' | 'site_visit_required' | 'direct_work_order';
  const reason = readString(formData, 'reason');
  if (!requestId || !decision) return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID or decision.');

  const result = await recordRequestTriage(supabase, {
    requestId,
    decision,
    reason,
    authorizationType: readOptionalString(formData, 'authorizationType'),
    authorizedCustomerContact: readOptionalString(formData, 'authorizedCustomerContact'),
    authorizedAt: readOptionalString(formData, 'authorizedAt'),
    authorizationNote: readOptionalString(formData, 'authorizationNote'),
    notToExceedAmount: readOptionalNumber(formData, 'notToExceedAmount'),
    authorizationReference: readOptionalString(formData, 'authorizationReference'),
  });
  if (!result.success) return result;

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  return ok(result.data);
}

export async function correctRequestTriageAction(
  _prevState: TriageActionState | null,
  formData: FormData
): Promise<TriageActionState> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const requestId = readString(formData, 'requestId');
  const newDecision = readString(formData, 'newDecision') as 'remote_estimate' | 'site_visit_required' | 'direct_work_order';
  const reason = readString(formData, 'reason');
  if (!requestId || !newDecision || !reason) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID, new decision, or reason.');
  }

  const result = await correctRequestTriage(supabase, {
    requestId,
    decision: newDecision,
    newDecision,
    reason,
    authorizationType: readOptionalString(formData, 'authorizationType'),
    authorizedCustomerContact: readOptionalString(formData, 'authorizedCustomerContact'),
    authorizedAt: readOptionalString(formData, 'authorizedAt'),
    authorizationNote: readOptionalString(formData, 'authorizationNote'),
    notToExceedAmount: readOptionalNumber(formData, 'notToExceedAmount'),
    authorizationReference: readOptionalString(formData, 'authorizationReference'),
  });
  if (!result.success) return result;

  revalidatePath(`/requests/${requestId}`);
  return ok(result.data);
}

// ---------------------------------------------------------------------------
// Site-visit scheduling / lifecycle
// ---------------------------------------------------------------------------

export type SiteVisitActionState = Result<null> | Result<string>;

export async function scheduleSiteVisitAction(_prevState: Result<string> | null, formData: FormData): Promise<Result<string>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  const start = readString(formData, 'start');
  const end = readString(formData, 'end');
  if (!siteVisitId || !start || !end) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit, start, or end time.');

  const result = await scheduleSiteVisit(supabase, {
    siteVisitId,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    assignedUserId: readOptionalString(formData, 'assignedUserId'),
  });
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function rescheduleSiteVisitAction(_prevState: Result<string> | null, formData: FormData): Promise<Result<string>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  const start = readString(formData, 'start');
  const end = readString(formData, 'end');
  if (!siteVisitId || !start || !end) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit, start, or end time.');

  const result = await rescheduleSiteVisit(supabase, {
    siteVisitId,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    assignedUserId: readOptionalString(formData, 'assignedUserId'),
    reason: readOptionalString(formData, 'reason'),
  });
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function cancelSiteVisitAppointmentAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const appointmentId = readString(formData, 'appointmentId');
  const siteVisitId = readString(formData, 'siteVisitId');
  const reason = readString(formData, 'reason');
  if (!appointmentId || !reason) return err(ErrorCode.VALIDATION_ERROR, 'Missing appointment ID or reason.');

  const result = await cancelSiteVisitAppointment(supabase, { appointmentId, reason });
  if (result.success && siteVisitId) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function cancelSiteVisitAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  const reason = readString(formData, 'reason');
  if (!siteVisitId || !reason) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit or reason.');

  const result = await cancelSiteVisit(supabase, { siteVisitId, reason });
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function startSiteVisitAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  if (!siteVisitId) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit.');

  const result = await startSiteVisit(supabase, siteVisitId);
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function undoSiteVisitStartAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  if (!siteVisitId) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit.');

  const result = await undoSiteVisitStart(supabase, siteVisitId);
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function completeSiteVisitAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const siteVisitId = readString(formData, 'siteVisitId');
  if (!siteVisitId) return err(ErrorCode.VALIDATION_ERROR, 'Missing site visit.');

  const result = await completeSiteVisit(supabase, siteVisitId);
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

// ---------------------------------------------------------------------------
// Inspection findings — template-aware Zod validation (trusted server
// action layer), THEN the service-role-only RPC. This is the only place in
// the app that calls saveSiteVisitInspectionTrusted().
// ---------------------------------------------------------------------------

export type SaveInspectionActionState = Result<null> | Result<{ errors: { field: string; message: string }[] }>;

export async function saveSiteVisitInspectionAction(
  siteVisitId: string,
  templateFieldDefinitions: InspectionFieldDefinition[],
  responsesPatch: Record<string, unknown>
): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  // save_site_visit_inspection() runs as service_role (no auth.uid()), so it
  // cannot itself check actor/org membership — that responsibility belongs
  // entirely to this server action, which is the only caller. Verify the
  // target visit actually belongs to the caller's org via the RLS-scoped
  // client before doing anything else with it.
  const supabaseForOrgCheck = await getServerSupabase();
  const { data: visitOrgCheck, error: visitOrgCheckError } = await supabaseForOrgCheck
    .from('site_visits')
    .select('id')
    .eq('id', siteVisitId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (visitOrgCheckError) return err(ErrorCode.DB_ERROR, visitOrgCheckError.message);
  if (!visitOrgCheck) return err(ErrorCode.NOT_FOUND, 'Site visit not found.');

  const validation = validateInspectionResponses(responsesPatch, templateFieldDefinitions);
  if (!validation.valid) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
    );
  }

  // Referenced photo vault items must belong to the same org/site visit —
  // Zod alone can't check DB membership.
  if (validation.photoVaultItemIds.length > 0) {
    const supabase = await getServerSupabase();
    const { data: rows, error } = await supabase
      .from('vault_items')
      .select('id')
      .in('id', validation.photoVaultItemIds)
      .eq('site_visit_id', siteVisitId);
    if (error) return err(ErrorCode.DB_ERROR, error.message);
    if ((rows?.length ?? 0) !== validation.photoVaultItemIds.length) {
      return err(ErrorCode.VALIDATION_ERROR, 'One or more referenced photos do not belong to this site visit.');
    }
  }

  const serviceClient = createServiceClient();
  const result = await saveSiteVisitInspectionTrusted(serviceClient, { siteVisitId, responsesPatch });
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

export async function completeSiteVisitWithValidationAction(
  siteVisitId: string,
  templateFieldDefinitions: InspectionFieldDefinition[],
  fullResponses: Record<string, unknown>
): Promise<Result<null>> {
  const requiredErrors = validateRequiredFieldsPresent(fullResponses, templateFieldDefinitions);
  if (requiredErrors.length > 0) {
    return err(ErrorCode.VALIDATION_ERROR, requiredErrors.map((e) => e.message).join('; '));
  }
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();
  const result = await completeSiteVisit(supabase, siteVisitId);
  if (result.success) revalidatePath(`/site-visits/${siteVisitId}`);
  return result;
}

// ---------------------------------------------------------------------------
// Photo upload — request target (authenticated client) + finalize (service
// role, via the trusted apps/web-only sharp-processing module).
// ---------------------------------------------------------------------------

export interface UploadTargetResult {
  uploadId: string;
  pendingPath: string;
  signedUploadToken: string;
}

export async function requestSiteVisitPhotoUploadAction(input: {
  siteVisitId: string;
  entityType: 'site_visit' | 'estimate';
  declaredMimeType: string;
  declaredSizeBytes: number;
}): Promise<Result<UploadTargetResult>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;
  const supabase = await getServerSupabase();

  return requestPendingUpload(supabase, {
    orgId,
    entityType: input.entityType,
    entityId: input.siteVisitId,
    actorUserId: userId,
    declaredMimeType: input.declaredMimeType,
    declaredSizeBytes: input.declaredSizeBytes,
  });
}

export async function finalizeSiteVisitPhotoUploadAction(uploadId: string): Promise<Result<{ vaultItemId: string; storagePath: string }>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  // finalizeSiteVisitUpload() runs with the service client and has no org
  // context of its own — verify the pending upload belongs to the caller's
  // org before finalizing it (mirrors the check saveSiteVisitInspectionAction
  // does for the same reason: the underlying operation can't check auth.uid()
  // itself).
  const supabase = await getServerSupabase();
  const { data: pendingOrgCheck, error: pendingOrgCheckError } = await supabase
    .from('pending_uploads')
    .select('id')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (pendingOrgCheckError) return err(ErrorCode.DB_ERROR, pendingOrgCheckError.message);
  if (!pendingOrgCheck) return err(ErrorCode.NOT_FOUND, 'Pending upload not found.');

  const serviceClient = createServiceClient();
  return finalizeSiteVisitUpload(serviceClient, uploadId);
}

// ---------------------------------------------------------------------------
// Estimate generation / pricing review / quote creation
// ---------------------------------------------------------------------------

export async function generateEstimateFromSiteVisitAction(siteVisitId: string): Promise<Result<string>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();
  const result = await generateEstimateFromSiteVisit(supabase, siteVisitId);
  if (result.success) {
    revalidatePath(`/site-visits/${siteVisitId}`);
    revalidatePath(`/estimates/${result.data}`);
  }
  return result;
}

export async function requestEstimatePricingReviewAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const estimateId = readString(formData, 'estimateId');
  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Missing estimate.');

  const result = await requestEstimatePricingReview(supabase, estimateId);
  if (!result.success) return err(result.code, toUserFacingError(result.error));
  revalidatePath(`/estimates/${estimateId}`);
  return result;
}

export async function returnEstimatePricingForChangesAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const estimateId = readString(formData, 'estimateId');
  const note = readString(formData, 'note');
  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Missing estimate.');
  if (!note) return err(ErrorCode.VALIDATION_ERROR, 'A note explaining the requested changes is required.');

  const result = await returnEstimatePricingForChanges(supabase, { estimateId, note });
  if (!result.success) return err(result.code, toUserFacingError(result.error));
  revalidatePath(`/estimates/${estimateId}`);
  return result;
}

export async function approveEstimatePricingAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const estimateId = readString(formData, 'estimateId');
  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Missing estimate.');

  const result = await approveEstimatePricing(supabase, estimateId);
  if (!result.success) return err(result.code, toUserFacingError(result.error));
  revalidatePath(`/estimates/${estimateId}`);
  return result;
}

export async function reopenEstimateForEditAction(_prevState: Result<null> | null, formData: FormData): Promise<Result<null>> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const estimateId = readString(formData, 'estimateId');
  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Missing estimate.');

  const result = await reopenEstimateForEdit(supabase, estimateId);
  if (!result.success) return err(result.code, toUserFacingError(result.error));
  revalidatePath(`/estimates/${estimateId}`);
  return result;
}

export type CreateQuoteFromEstimateActionState = Result<{ quoteId: string }>;

export async function createQuoteFromEstimateWorkflowAction(
  _prevState: CreateQuoteFromEstimateActionState | null,
  formData: FormData
): Promise<CreateQuoteFromEstimateActionState> {
  const contextResult = await getWorkflowActionContext();
  if (!contextResult.success) return contextResult;
  const supabase = await getServerSupabase();

  const estimateId = readString(formData, 'estimateId');
  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Missing estimate.');

  const result = await createQuoteFromEstimateRpc(supabase, estimateId);
  if (!result.success) return result;

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath(`/quotes/${result.data}`);
  return ok({ quoteId: result.data });
}
