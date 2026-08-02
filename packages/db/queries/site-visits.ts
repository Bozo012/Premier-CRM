/**
 * Thin wrappers around the SECURITY DEFINER RPC functions that own the
 * entire request → site visit → estimate → quote lifecycle (see
 * supabase/migrations/20260802* and
 * docs/implementation/request-site-visit-estimate-workflow.md for the full
 * design). All authorization/state/transition enforcement happens in these
 * RPCs and their underlying triggers, not here — this module never mutates
 * site_visits/site_visit_appointments/estimate_line_items directly.
 *
 * save_site_visit_inspection() is intentionally NOT wrapped here for direct
 * client use — its EXECUTE grant is revoked from `authenticated`. It must
 * only ever be called from a trusted server action, after full
 * template-aware Zod validation, using the service-role client. See
 * saveSiteVisitInspectionTrusted() below, which exists specifically to make
 * that constraint impossible to miss at the call site.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database, Json } from '../types';

export type SiteVisit = Database['public']['Tables']['site_visits']['Row'];
export type SiteVisitAppointment = Database['public']['Tables']['site_visit_appointments']['Row'];

export interface SiteVisitDetail {
  id: string;
  orgId: string;
  status: string;
  serviceRequestId: string;
  serviceRequestTitle: string;
  customerId: string;
  customerDisplayName: string;
  assignedUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  inspectionResponses: Record<string, unknown> | null;
  inspectionTemplateVersionId: string | null;
  fieldDefinitions: unknown[];
  generatedEstimateId: string | null;
  activeAppointment: { id: string; scheduledStart: string; scheduledEnd: string; assignedUserId: string | null } | null;
}

export async function getSiteVisitById(client: DbClient, siteVisitId: string): Promise<Result<SiteVisitDetail>> {
  const { data: visit, error } = await client
    .from('site_visits')
    .select('id, org_id, status, service_request_id, assigned_user_id, started_at, completed_at, cancelled_at, cancellation_reason, inspection_responses, inspection_template_version_id')
    .eq('id', siteVisitId)
    .maybeSingle();
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!visit) return err(ErrorCode.NOT_FOUND, 'Site visit not found.');

  const { data: request, error: requestError } = await client
    .from('service_requests')
    .select('id, service_title, customer_id')
    .eq('id', visit.service_request_id)
    .maybeSingle();
  if (requestError || !request) return err(ErrorCode.DB_ERROR, requestError?.message ?? 'Source request not found.');

  const { data: customer } = await client.from('customers').select('display_name').eq('id', request.customer_id).maybeSingle();

  let fieldDefinitions: unknown[] = [];
  if (visit.inspection_template_version_id) {
    const { data: templateVersion } = await client
      .from('inspection_template_versions')
      .select('field_definitions')
      .eq('id', visit.inspection_template_version_id)
      .maybeSingle();
    fieldDefinitions = (templateVersion?.field_definitions as unknown[] | undefined) ?? [];
  }

  const { data: appointment } = await client
    .from('site_visit_appointments')
    .select('id, scheduled_start, scheduled_end, assigned_user_id')
    .eq('site_visit_id', siteVisitId)
    .eq('status', 'scheduled')
    .maybeSingle();

  const { data: estimate } = await client
    .from('estimates')
    .select('id')
    .eq('source_site_visit_id', siteVisitId)
    .maybeSingle();

  return ok({
    id: visit.id,
    orgId: visit.org_id,
    status: visit.status,
    serviceRequestId: request.id,
    serviceRequestTitle: request.service_title,
    customerId: request.customer_id,
    customerDisplayName: customer?.display_name ?? 'Unknown customer',
    assignedUserId: visit.assigned_user_id,
    startedAt: visit.started_at,
    completedAt: visit.completed_at,
    cancelledAt: visit.cancelled_at,
    cancellationReason: visit.cancellation_reason,
    inspectionResponses: (visit.inspection_responses as Record<string, unknown> | null) ?? null,
    inspectionTemplateVersionId: visit.inspection_template_version_id,
    fieldDefinitions,
    generatedEstimateId: estimate?.id ?? null,
    activeAppointment: appointment
      ? { id: appointment.id, scheduledStart: appointment.scheduled_start, scheduledEnd: appointment.scheduled_end, assignedUserId: appointment.assigned_user_id }
      : null,
  });
}

export interface CustomerSiteVisitSummary {
  siteVisitId: string;
  safeStatus: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  isRescheduled: boolean;
  isCancelled: boolean;
}

export interface RequestTriageInput {
  requestId: string;
  decision: 'remote_estimate' | 'site_visit_required' | 'direct_work_order';
  reason: string;
  authorizationType?: string | null;
  authorizedCustomerContact?: string | null;
  authorizedAt?: string | null;
  authorizationNote?: string | null;
  notToExceedAmount?: number | null;
  authorizationReference?: string | null;
}

export interface TriageResult {
  estimateId: string | null;
  siteVisitId: string | null;
  jobId: string | null;
}

function triageRpcArgs(input: RequestTriageInput) {
  return {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_authorization_type: (input.authorizationType ?? null) as unknown as string,
    p_authorized_customer_contact: (input.authorizedCustomerContact ?? null) as unknown as string,
    p_authorized_at: (input.authorizedAt ?? null) as unknown as string,
    p_authorization_note: (input.authorizationNote ?? null) as unknown as string,
    p_not_to_exceed_amount: (input.notToExceedAmount ?? null) as unknown as number,
    p_authorization_reference: (input.authorizationReference ?? null) as unknown as string,
  };
}

export async function recordRequestTriage(client: DbClient, input: RequestTriageInput): Promise<Result<TriageResult>> {
  const { data, error } = await client.rpc('record_request_triage', triageRpcArgs(input));
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  const result = data as unknown as { estimateId: string | null; siteVisitId: string | null; jobId: string | null };
  return ok(result);
}

export async function correctRequestTriage(
  client: DbClient,
  input: RequestTriageInput & { newDecision: RequestTriageInput['decision'] }
): Promise<Result<TriageResult>> {
  const baseArgs = triageRpcArgs({ ...input, decision: input.newDecision });
  const { data, error } = await client.rpc('correct_request_triage', {
    p_request_id: baseArgs.p_request_id,
    p_new_decision: input.newDecision,
    p_reason: baseArgs.p_reason,
    p_authorization_type: baseArgs.p_authorization_type,
    p_authorized_customer_contact: baseArgs.p_authorized_customer_contact,
    p_authorized_at: baseArgs.p_authorized_at,
    p_authorization_note: baseArgs.p_authorization_note,
    p_not_to_exceed_amount: baseArgs.p_not_to_exceed_amount,
    p_authorization_reference: baseArgs.p_authorization_reference,
  });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  const result = data as unknown as { estimateId: string | null; siteVisitId: string | null; jobId: string | null };
  return ok(result);
}

export async function scheduleSiteVisit(
  client: DbClient,
  args: { siteVisitId: string; start: string; end: string; assignedUserId?: string | null }
): Promise<Result<string>> {
  const { data, error } = await client.rpc('schedule_site_visit', {
    p_site_visit_id: args.siteVisitId,
    p_start: args.start,
    p_end: args.end,
    p_assigned_user_id: (args.assignedUserId ?? null) as unknown as string,
  });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as string);
}

export async function rescheduleSiteVisit(
  client: DbClient,
  args: { siteVisitId: string; start: string; end: string; assignedUserId?: string | null; reason?: string | null }
): Promise<Result<string>> {
  const { data, error } = await client.rpc('reschedule_site_visit', {
    p_site_visit_id: args.siteVisitId,
    p_start: args.start,
    p_end: args.end,
    p_assigned_user_id: (args.assignedUserId ?? null) as unknown as string,
    p_reason: (args.reason ?? null) as unknown as string,
  });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as string);
}

export async function cancelSiteVisitAppointment(client: DbClient, args: { appointmentId: string; reason: string }): Promise<Result<null>> {
  const { error } = await client.rpc('cancel_site_visit_appointment', { p_appointment_id: args.appointmentId, p_reason: args.reason });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function cancelSiteVisit(client: DbClient, args: { siteVisitId: string; reason: string }): Promise<Result<null>> {
  const { error } = await client.rpc('cancel_site_visit', { p_site_visit_id: args.siteVisitId, p_reason: args.reason });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function startSiteVisit(client: DbClient, siteVisitId: string): Promise<Result<null>> {
  const { error } = await client.rpc('start_site_visit', { p_site_visit_id: siteVisitId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function undoSiteVisitStart(client: DbClient, siteVisitId: string): Promise<Result<null>> {
  const { error } = await client.rpc('undo_site_visit_start', { p_site_visit_id: siteVisitId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function completeSiteVisit(client: DbClient, siteVisitId: string): Promise<Result<null>> {
  const { error } = await client.rpc('complete_site_visit', { p_site_visit_id: siteVisitId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

/**
 * MUST be called with a service-role client, and only after the caller has
 * already performed full template-aware Zod validation against the site
 * visit's bound inspection_template_versions.field_definitions — the RPC
 * itself only performs coarse DB-appropriate checks (shape, size, state,
 * template-version consistency), not dynamic per-field validation. This is
 * why save_site_visit_inspection has no EXECUTE grant for `authenticated`.
 */
export async function saveSiteVisitInspectionTrusted(
  serviceClient: DbClient,
  args: { siteVisitId: string; responsesPatch: Record<string, unknown> }
): Promise<Result<null>> {
  const { error } = await serviceClient.rpc('save_site_visit_inspection', {
    p_site_visit_id: args.siteVisitId,
    p_responses_patch: args.responsesPatch as unknown as Json,
  });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function generateEstimateFromSiteVisit(client: DbClient, siteVisitId: string): Promise<Result<string>> {
  const { data, error } = await client.rpc('generate_estimate_from_site_visit', { p_site_visit_id: siteVisitId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as string);
}

export async function approveEstimatePricing(client: DbClient, estimateId: string): Promise<Result<null>> {
  const { error } = await client.rpc('approve_estimate_pricing', { p_estimate_id: estimateId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function reopenEstimateForEdit(client: DbClient, estimateId: string): Promise<Result<null>> {
  const { error } = await client.rpc('reopen_estimate_for_edit', { p_estimate_id: estimateId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function createQuoteFromEstimateRpc(client: DbClient, estimateId: string): Promise<Result<string>> {
  const { data, error } = await client.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(data as string);
}

export async function getMySiteVisitSummary(client: DbClient, serviceRequestId: string): Promise<Result<CustomerSiteVisitSummary[]>> {
  const { data, error } = await client.rpc('get_my_site_visit_summary', { p_service_request_id: serviceRequestId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  const rows = (data ?? []) as Array<{
    site_visit_id: string;
    safe_status: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    is_rescheduled: boolean;
    is_cancelled: boolean;
  }>;
  return ok(
    rows.map((r) => ({
      siteVisitId: r.site_visit_id,
      safeStatus: r.safe_status,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      isRescheduled: r.is_rescheduled,
      isCancelled: r.is_cancelled,
    }))
  );
}
