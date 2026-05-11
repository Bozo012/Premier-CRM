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
