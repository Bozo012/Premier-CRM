import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestCustomerSummary {
  id: string;
  displayName: string;
  email: string | null;
  phonePrimary: string | null;
}

export interface RequestPropertySummary {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface RequestListItem {
  id: string;
  requestNumber: string;
  /** Composed display title: "{contactName} — {serviceTitle}" */
  title: string;
  /** Free-text service description. */
  description: string | null;
  /** Service category or title for the sub-line in the inbox row. */
  serviceLine: string | null;
  status: string;
  priority: string;
  createdAt: string;
  /** Linked job id if this request has been converted to a job (legacy path). */
  jobId: string | null;
  /** Linked estimate id if an estimate was created from this request. */
  estimateId: string | null;
  customer: RequestCustomerSummary | null;
}

export interface RequestDetail extends RequestListItem {
  customerId: string | null;
  propertyId: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  serviceTitle: string;
  serviceCategory: string | null;
  reviewedAt: string | null;
  convertedAt: string | null;
  property: RequestPropertySummary | null;
  triageDecision: 'remote_estimate' | 'site_visit_required' | 'direct_work_order' | null;
  triageReason: string | null;
  triagedAt: string | null;
  triageCorrectedFrom: string | null;
  triageCorrectedAt: string | null;
  triageCorrectionReason: string | null;
  siteVisitId: string | null;
}

export interface RequestListPage {
  requests: RequestListItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// List requests
// ---------------------------------------------------------------------------

/**
 * List inbound intake requests from the service_requests table.
 *
 * `showDone` controls visibility of reviewed/converted rows:
 *   false  → only status='new'
 *   true   → all statuses including reviewing/completed/cancelled
 */
export async function listRequests(
  client: DbClient,
  args: {
    orgId: string;
    limit?: number;
    offset?: number;
    showDone?: boolean;
  }
): Promise<Result<RequestListPage>> {
  const { orgId, limit = 100, offset = 0, showDone = false } = args;

  let query = client
    .from('service_requests')
    .select(
      `
      id,
      request_number,
      status,
      priority,
      job_id,
      estimate_id,
      customer_id,
      contact_name,
      service_title,
      service_category,
      service_description,
      submitted_at,
      customers (
        id,
        first_name,
        last_name,
        display_name,
        email,
        phone_primary
      )
    `,
      { count: 'exact' }
    )
    .eq('org_id', orgId);

  if (!showDone) {
    query = query.eq('status', 'new');
  }

  const { data, error, count } = await query
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const requests: RequestListItem[] = (data ?? []).map((row) => {
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;

    let displayName = 'Unknown customer';
    if (cust) {
      if (cust.display_name?.trim()) {
        displayName = cust.display_name.trim();
      } else {
        const parts = [cust.first_name, cust.last_name].filter(Boolean);
        if (parts.length > 0) displayName = parts.join(' ');
      }
    }

    const serviceLine = row.service_category ?? row.service_title ?? null;
    const title = `${row.contact_name} — ${row.service_title}`;

    return {
      id: row.id,
      requestNumber: row.request_number,
      title,
      description: row.service_description ?? null,
      serviceLine,
      status: row.status,
      priority: row.priority,
      createdAt: row.submitted_at,
      jobId: row.job_id ?? null,
      estimateId: row.estimate_id ?? null,
      customer: cust
        ? {
            id: cust.id,
            displayName,
            email: cust.email ?? null,
            phonePrimary: cust.phone_primary ?? null,
          }
        : null,
    };
  });

  return ok({ requests, total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// Single request detail
// ---------------------------------------------------------------------------

export async function getRequestById(
  client: DbClient,
  args: { taskId: string; orgId: string }
): Promise<Result<RequestDetail>> {
  const { taskId, orgId } = args;

  const { data: row, error } = await client
    .from('service_requests')
    .select(
      `
      id,
      request_number,
      status,
      priority,
      job_id,
      estimate_id,
      customer_id,
      property_id,
      contact_name,
      contact_email,
      contact_phone,
      service_title,
      service_category,
      service_description,
      submitted_at,
      reviewed_at,
      converted_at,
      triage_decision,
      triage_reason,
      triaged_at,
      triage_corrected_from,
      triage_corrected_at,
      triage_correction_reason,
      customers (
        id,
        first_name,
        last_name,
        display_name,
        email,
        phone_primary
      ),
      properties (
        id,
        address_line_1,
        address_line_2,
        city,
        state,
        zip
      )
    `
    )
    .eq('id', taskId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!row) {
    return err(ErrorCode.NOT_FOUND, `Request ${taskId} not found.`);
  }

  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const prop = Array.isArray(row.properties) ? row.properties[0] : row.properties;

  let displayName = 'Unknown customer';
  if (cust) {
    if (cust.display_name?.trim()) {
      displayName = cust.display_name.trim();
    } else {
      const parts = [cust.first_name, cust.last_name].filter(Boolean);
      if (parts.length > 0) displayName = parts.join(' ');
    }
  }

  const serviceLine = row.service_category ?? row.service_title ?? null;
  const title = `${row.contact_name} — ${row.service_title}`;

  let siteVisitId: string | null = null;
  if (row.triage_decision === 'site_visit_required') {
    const { data: visit } = await client
      .from('site_visits')
      .select('id')
      .eq('service_request_id', taskId)
      .maybeSingle();
    siteVisitId = visit?.id ?? null;
  }

  return ok({
    id: row.id,
    requestNumber: row.request_number,
    title,
    description: row.service_description ?? null,
    serviceLine,
    status: row.status,
    priority: row.priority,
    createdAt: row.submitted_at,
    jobId: row.job_id ?? null,
    estimateId: row.estimate_id ?? null,
    customerId: row.customer_id ?? null,
    propertyId: row.property_id ?? null,
    contactName: row.contact_name,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    serviceTitle: row.service_title,
    serviceCategory: row.service_category ?? null,
    reviewedAt: row.reviewed_at ?? null,
    convertedAt: row.converted_at ?? null,
    triageDecision: (row.triage_decision as RequestDetail['triageDecision']) ?? null,
    triageReason: row.triage_reason ?? null,
    triagedAt: row.triaged_at ?? null,
    triageCorrectedFrom: row.triage_corrected_from ?? null,
    triageCorrectedAt: row.triage_corrected_at ?? null,
    triageCorrectionReason: row.triage_correction_reason ?? null,
    siteVisitId,
    customer: cust
      ? {
          id: cust.id,
          displayName,
          email: cust.email ?? null,
          phonePrimary: cust.phone_primary ?? null,
        }
      : null,
    property: prop
      ? {
          id: prop.id,
          addressLine1: prop.address_line_1,
          addressLine2: prop.address_line_2 ?? null,
          city: prop.city,
          state: prop.state,
          zip: prop.zip,
        }
      : null,
  });
}
