import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type EstimateStatus = Database['public']['Enums']['estimate_status'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EstimateCustomerSummary {
  id: string;
  displayName: string;
  email: string | null;
  phonePrimary: string | null;
}

export interface EstimatePropertySummary {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}

export interface EstimateListItem {
  id: string;
  estimateNumber: string;
  title: string;
  status: EstimateStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  siteVisitAt: string | null;
  serviceRequestId: string | null;
  convertedJobId: string | null;
  customer: EstimateCustomerSummary | null;
  property: EstimatePropertySummary | null;
}

export interface EstimateDetail extends EstimateListItem {
  description: string | null;
  siteVisitNotes: string | null;
  convertedAt: string | null;
  createdBy: string | null;
  /** Resolved from user_profiles — null if createdBy is null or has no profile. */
  createdByName: string | null;
}

export interface EstimateListPage {
  estimates: EstimateListItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// List estimates
// ---------------------------------------------------------------------------

export async function listEstimates(
  client: DbClient,
  args: {
    orgId: string;
    statuses?: EstimateStatus[];
    limit?: number;
    offset?: number;
  }
): Promise<Result<EstimateListPage>> {
  const { orgId, statuses, limit = 100, offset = 0 } = args;

  let query = client
    .from('estimates')
    .select(
      `
      id,
      estimate_number,
      title,
      status,
      created_at,
      updated_at,
      expires_at,
      site_visit_at,
      service_request_id,
      converted_job_id,
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
        city,
        state,
        zip
      )
    `,
      { count: 'exact' }
    )
    .eq('org_id', orgId);

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const estimates: EstimateListItem[] = (data ?? []).map((row) => {
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const prop = Array.isArray(row.properties) ? row.properties[0] : row.properties;

    return {
      id: row.id,
      estimateNumber: row.estimate_number,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? null,
      siteVisitAt: row.site_visit_at ?? null,
      serviceRequestId: row.service_request_id ?? null,
      convertedJobId: row.converted_job_id ?? null,
      customer: cust
        ? {
            id: cust.id,
            displayName: resolveDisplayName(cust),
            email: cust.email ?? null,
            phonePrimary: cust.phone_primary ?? null,
          }
        : null,
      property: prop
        ? {
            id: prop.id,
            addressLine1: prop.address_line_1,
            city: prop.city,
            state: prop.state,
            zip: prop.zip,
          }
        : null,
    };
  });

  return ok({ estimates, total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// Single estimate detail
// ---------------------------------------------------------------------------

export async function getEstimateById(
  client: DbClient,
  args: { estimateId: string; orgId: string }
): Promise<Result<EstimateDetail>> {
  const { estimateId, orgId } = args;

  const { data: row, error } = await client
    .from('estimates')
    .select(
      `
      id,
      estimate_number,
      title,
      description,
      status,
      created_at,
      updated_at,
      expires_at,
      site_visit_at,
      site_visit_notes,
      service_request_id,
      converted_job_id,
      converted_at,
      created_by,
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
        city,
        state,
        zip
      )
    `
    )
    .eq('id', estimateId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!row) {
    return err(ErrorCode.NOT_FOUND, `Estimate ${estimateId} not found.`);
  }

  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const prop = Array.isArray(row.properties) ? row.properties[0] : row.properties;

  // No direct FK from estimates to user_profiles (created_by references
  // auth.users; user_profiles.id also references auth.users, but separately)
  // — PostgREST can't embed this in one query, so it's a small follow-up
  // lookup. RLS ("Users see profiles in shared orgs") allows any co-member
  // to read this, so it resolves correctly for both owner and employee
  // viewers.
  let createdByName: string | null = null;
  if (row.created_by) {
    const { data: profile } = await client
      .from('user_profiles')
      .select('full_name')
      .eq('id', row.created_by)
      .maybeSingle();
    createdByName = profile?.full_name?.trim() || null;
  }

  return ok({
    id: row.id,
    estimateNumber: row.estimate_number,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? null,
    siteVisitAt: row.site_visit_at ?? null,
    serviceRequestId: row.service_request_id ?? null,
    convertedJobId: row.converted_job_id ?? null,
    description: row.description ?? null,
    siteVisitNotes: row.site_visit_notes ?? null,
    convertedAt: row.converted_at ?? null,
    createdBy: row.created_by ?? null,
    createdByName,
    customer: cust
      ? {
          id: cust.id,
          displayName: resolveDisplayName(cust),
          email: cust.email ?? null,
          phonePrimary: cust.phone_primary ?? null,
        }
      : null,
    property: prop
      ? {
          id: prop.id,
          addressLine1: prop.address_line_1,
          city: prop.city,
          state: prop.state,
          zip: prop.zip,
        }
      : null,
  });
}

// ---------------------------------------------------------------------------
// Quotes linked to an estimate
// ---------------------------------------------------------------------------

export interface EstimateLinkedQuote {
  id: string;
  quoteNumber: string | null;
  title: string | null;
  status: string;
  total: number | null;
  createdAt: string;
}

export async function listQuotesForEstimate(
  client: DbClient,
  args: { estimateId: string; orgId: string }
): Promise<Result<EstimateLinkedQuote[]>> {
  const { data, error } = await client
    .from('quotes')
    .select('id, quote_number, title, status, total, created_at')
    .eq('org_id', args.orgId)
    .eq('estimate_id', args.estimateId)
    .order('created_at', { ascending: false });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      quoteNumber: row.quote_number,
      title: row.title,
      status: row.status,
      total: row.total,
      createdAt: row.created_at,
    }))
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDisplayName(cust: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (cust.display_name?.trim()) return cust.display_name.trim();
  const parts = [cust.first_name, cust.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return 'Unknown customer';
}
