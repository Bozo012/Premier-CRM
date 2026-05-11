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
  title: string;
  /** Structured description block built by createQuoteRequest. */
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
  /** Linked job id if this request has been converted to a job. */
  jobId: string | null;
  customer: RequestCustomerSummary | null;
}

export interface RequestDetail extends RequestListItem {
  customerId: string | null;
  propertyId: string | null;
  property: RequestPropertySummary | null;
}

export interface RequestListPage {
  requests: RequestListItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * List inbound intake requests backed by the tasks table.
 *
 * Web leads land in tasks via createQuoteRequest (title always starts with
 * "Quote request from"). The `showDone` flag controls whether completed /
 * cancelled tasks are included; the default inbox shows only open ones.
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
    .from('tasks')
    .select(
      `
      id,
      title,
      description,
      status,
      priority,
      created_at,
      job_id,
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
    .eq('org_id', orgId)
    .ilike('title', 'Quote request from%');

  if (!showDone) {
    query = query.not('status', 'in', '("done","cancelled")');
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const requests: RequestListItem[] = (data ?? []).map((row) => {
    const cust = Array.isArray(row.customers)
      ? row.customers[0]
      : row.customers;

    let displayName = 'Unknown customer';
    if (cust) {
      if (cust.display_name?.trim()) {
        displayName = cust.display_name.trim();
      } else {
        const parts = [cust.first_name, cust.last_name].filter(Boolean);
        if (parts.length > 0) displayName = parts.join(' ');
      }
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      jobId: row.job_id ?? null,
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
    .from('tasks')
    .select(
      `
      id,
      title,
      description,
      status,
      priority,
      created_at,
      job_id,
      customer_id,
      property_id,
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

  return ok({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    jobId: row.job_id ?? null,
    customerId: row.customer_id ?? null,
    propertyId: row.property_id ?? null,
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
