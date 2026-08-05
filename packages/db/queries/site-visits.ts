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

export interface SiteVisitListItem {
  id: string;
  status: string;
  serviceRequestId: string;
  serviceRequestTitle: string;
  serviceRequestDescription: string | null;
  customerId: string | null;
  customerDisplayName: string;
  propertyId: string | null;
  propertyAddress: string | null;
  assignedUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  inspectionResponseCount: number;
  inspectionFieldCount: number;
  generatedEstimateId: string | null;
  activeAppointment: { id: string; scheduledStart: string; scheduledEnd: string; assignedUserId: string | null } | null;
}

export interface SiteVisitListPage {
  visits: SiteVisitListItem[];
  total: number;
}

interface SiteVisitListQueryRow {
  id: string;
  status: string;
  service_request_id: string;
  assigned_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  inspection_responses: unknown;
  service_requests:
    | {
        id: string;
        service_title: string;
        service_description: string | null;
        customer_id: string | null;
        property_id: string | null;
        property_address_line_1: string | null;
        property_address_line_2: string | null;
        property_city: string | null;
        property_state: string | null;
        property_zip: string | null;
        customers:
          | {
              first_name: string | null;
              last_name: string | null;
              display_name: string | null;
              company_name: string | null;
            }
          | Array<{
              first_name: string | null;
              last_name: string | null;
              display_name: string | null;
              company_name: string | null;
            }>
          | null;
        properties:
          | {
              address_line_1: string;
              address_line_2: string | null;
              city: string;
              state: string;
              zip: string;
            }
          | Array<{
              address_line_1: string;
              address_line_2: string | null;
              city: string;
              state: string;
              zip: string;
            }>
          | null;
      }
    | Array<{
        id: string;
        service_title: string;
        service_description: string | null;
        customer_id: string | null;
        property_id: string | null;
        property_address_line_1: string | null;
        property_address_line_2: string | null;
        property_city: string | null;
        property_state: string | null;
        property_zip: string | null;
        customers:
          | {
              first_name: string | null;
              last_name: string | null;
              display_name: string | null;
              company_name: string | null;
            }
          | Array<{
              first_name: string | null;
              last_name: string | null;
              display_name: string | null;
              company_name: string | null;
            }>
          | null;
        properties:
          | {
              address_line_1: string;
              address_line_2: string | null;
              city: string;
              state: string;
              zip: string;
            }
          | Array<{
              address_line_1: string;
              address_line_2: string | null;
              city: string;
              state: string;
              zip: string;
            }>
          | null;
      }>
    | null;
  inspection_template_versions:
    | { field_definitions: unknown }
    | Array<{ field_definitions: unknown }>
    | null;
}

interface AppointmentRow {
  id: string;
  site_visit_id: string;
  scheduled_start: string;
  scheduled_end: string;
  assigned_user_id: string | null;
}

interface EstimateSourceRow {
  id: string;
  source_site_visit_id: string | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countInspectionResponses(value: unknown): number {
  if (!isRecord(value)) return 0;
  return Object.values(value).filter((entry) => {
    if (entry === undefined || entry === null) return false;
    if (typeof entry === 'string') return entry.trim().length > 0;
    if (Array.isArray(entry)) return entry.length > 0;
    return true;
  }).length;
}

function countFieldDefinitions(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function customerDisplayName(
  customer: {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    company_name: string | null;
  } | null
): string {
  if (!customer) return 'Unknown customer';
  if (customer.company_name?.trim()) return customer.company_name.trim();
  if (customer.display_name?.trim()) return customer.display_name.trim();
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return name || 'Unknown customer';
}

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const address = parts.filter((part): part is string => Boolean(part?.trim())).join(', ');
  return address || null;
}

export async function listSiteVisits(
  client: DbClient,
  args: {
    orgId: string;
    limit?: number;
    offset?: number;
    status?: SiteVisit['status'] | 'all';
  }
): Promise<Result<SiteVisitListPage>> {
  const { orgId, limit = 100, offset = 0, status } = args;

  let query = client
    .from('site_visits')
    .select(
      `
      id,
      status,
      service_request_id,
      assigned_user_id,
      started_at,
      completed_at,
      cancelled_at,
      inspection_responses,
      service_requests (
        id,
        service_title,
        service_description,
        customer_id,
        property_id,
        property_address_line_1,
        property_address_line_2,
        property_city,
        property_state,
        property_zip,
        customers ( first_name, last_name, display_name, company_name ),
        properties ( address_line_1, address_line_2, city, state, zip )
      ),
      inspection_template_versions ( field_definitions )
    `,
      { count: 'exact' }
    )
    .eq('org_id', orgId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as unknown as SiteVisitListQueryRow[];
  const visitIds = rows.map((row) => row.id);

  const { data: appointments, error: appointmentError } = visitIds.length
    ? await client
        .from('site_visit_appointments')
        .select('id, site_visit_id, scheduled_start, scheduled_end, assigned_user_id')
        .in('site_visit_id', visitIds)
        .eq('status', 'scheduled')
    : { data: [] as AppointmentRow[], error: null };

  if (appointmentError) return err(ErrorCode.DB_ERROR, appointmentError.message);

  const { data: estimates, error: estimateError } = visitIds.length
    ? await client
        .from('estimates')
        .select('id, source_site_visit_id')
        .eq('org_id', orgId)
        .in('source_site_visit_id', visitIds)
    : { data: [] as EstimateSourceRow[], error: null };

  if (estimateError) return err(ErrorCode.DB_ERROR, estimateError.message);

  const appointmentByVisitId = new Map(
    ((appointments ?? []) as AppointmentRow[]).map((appointment) => [appointment.site_visit_id, appointment])
  );
  const estimateByVisitId = new Map(
    ((estimates ?? []) as EstimateSourceRow[])
      .filter((estimate) => estimate.source_site_visit_id)
      .map((estimate) => [estimate.source_site_visit_id as string, estimate.id])
  );

  const visits = rows.map((row): SiteVisitListItem => {
    const request = firstOrNull(row.service_requests);
    const customer = firstOrNull(request?.customers);
    const property = firstOrNull(request?.properties);
    const templateVersion = firstOrNull(row.inspection_template_versions);
    const appointment = appointmentByVisitId.get(row.id) ?? null;
    const propertyAddress =
      property
        ? formatAddress([
            property.address_line_1,
            property.address_line_2,
            `${property.city}, ${property.state} ${property.zip}`,
          ])
        : formatAddress([
            request?.property_address_line_1,
            request?.property_address_line_2,
            request?.property_city ? `${request.property_city}, ${request.property_state ?? ''} ${request.property_zip ?? ''}` : null,
          ]);

    return {
      id: row.id,
      status: row.status,
      serviceRequestId: request?.id ?? row.service_request_id,
      serviceRequestTitle: request?.service_title ?? 'Site visit',
      serviceRequestDescription: request?.service_description ?? null,
      customerId: request?.customer_id ?? null,
      customerDisplayName: customerDisplayName(customer),
      propertyId: request?.property_id ?? null,
      propertyAddress,
      assignedUserId: row.assigned_user_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      inspectionResponseCount: countInspectionResponses(row.inspection_responses),
      inspectionFieldCount: countFieldDefinitions(templateVersion?.field_definitions),
      generatedEstimateId: estimateByVisitId.get(row.id) ?? null,
      activeAppointment: appointment
        ? {
            id: appointment.id,
            scheduledStart: appointment.scheduled_start,
            scheduledEnd: appointment.scheduled_end,
            assignedUserId: appointment.assigned_user_id,
          }
        : null,
    };
  });

  return ok({ visits, total: count ?? 0 });
}

/**
 * Site visits don't carry customer_id/property_id directly (that lives on
 * the parent service_requests row, joined in `listSiteVisits`), so rather
 * than duplicating that join here, this filters the already-org-scoped list.
 * Fine at current SMB scale (`limit` defaults to 200); revisit with a real
 * `!inner` join filter if an org's site-visit volume ever makes that
 * insufficient.
 */
export async function listSiteVisitsForCustomer(
  client: DbClient,
  args: { orgId: string; customerId: string; limit?: number }
): Promise<Result<SiteVisitListItem[]>> {
  const result = await listSiteVisits(client, { orgId: args.orgId, limit: args.limit ?? 200, status: 'all' });
  if (!result.success) return result;
  return ok(result.data.visits.filter((visit) => visit.customerId === args.customerId));
}

export async function listSiteVisitsForProperty(
  client: DbClient,
  args: { orgId: string; propertyId: string; limit?: number }
): Promise<Result<SiteVisitListItem[]>> {
  const result = await listSiteVisits(client, { orgId: args.orgId, limit: args.limit ?? 200, status: 'all' });
  if (!result.success) return result;
  return ok(result.data.visits.filter((visit) => visit.propertyId === args.propertyId));
}

/** Site visits (plus their scheduled appointments) currently assigned to one team member — for the Team Member detail page. */
export async function listSiteVisitsAssignedToMember(
  client: DbClient,
  args: { orgId: string; userId: string; limit?: number }
): Promise<Result<SiteVisitListItem[]>> {
  const result = await listSiteVisits(client, { orgId: args.orgId, limit: args.limit ?? 200, status: 'all' });
  if (!result.success) return result;
  return ok(result.data.visits.filter((visit) => visit.assignedUserId === args.userId));
}

export async function getSiteVisitById(client: DbClient, siteVisitId: string, orgId: string): Promise<Result<SiteVisitDetail>> {
  const { data: visit, error } = await client
    .from('site_visits')
    .select('id, org_id, status, service_request_id, assigned_user_id, started_at, completed_at, cancelled_at, cancellation_reason, inspection_responses, inspection_template_version_id')
    .eq('id', siteVisitId)
    .eq('org_id', orgId)
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

export async function requestEstimatePricingReview(client: DbClient, estimateId: string): Promise<Result<null>> {
  const { error } = await client.rpc('request_estimate_pricing_review', { p_estimate_id: estimateId });
  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok(null);
}

export async function returnEstimatePricingForChanges(
  client: DbClient,
  args: { estimateId: string; note: string }
): Promise<Result<null>> {
  const { error } = await client.rpc('return_estimate_pricing_for_changes', {
    p_estimate_id: args.estimateId,
    p_note: args.note,
  });
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
