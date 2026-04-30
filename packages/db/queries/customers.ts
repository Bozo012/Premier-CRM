import {
  ErrorCode,
  err,
  ok,
  type ListCustomersArgs,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

/**
 * A customer row as returned by the database. Re-exports the generated type
 * shape so call sites don't have to drill into `Database['public']['Tables']`.
 */
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Property = Database['public']['Tables']['properties']['Row'];

export interface Customer360RecentJob {
  id: string;
  scheduled_start: string | null;
  status: Database['public']['Enums']['job_status'];
  title: string;
  total: number | null;
}

export interface Customer360Quote {
  id: string;
  job_title: string | null;
  sent_at: string | null;
  total: number | null;
}

export interface Customer360Invoice {
  amount_due: number | null;
  days_overdue: number | null;
  due_date: string | null;
  id: string;
}

export interface Customer360Stats {
  last_contact_at: string | null;
  last_job_completed_at: string | null;
  total_jobs: number | null;
  total_revenue: number | null;
}

export interface Customer360 {
  customer: Customer;
  openQuotes: Customer360Quote[];
  properties: Property[];
  recentJobs: Customer360RecentJob[];
  stats: Customer360Stats;
  unpaidInvoices: Customer360Invoice[];
}

interface Customer360RpcPayload {
  customer?: Customer | null;
  open_quotes?: Customer360Quote[] | null;
  properties?: Property[] | null;
  recent_jobs?: Customer360RecentJob[] | null;
  stats?: Customer360Stats | null;
  unpaid_invoices?: Customer360Invoice[] | null;
}

/**
 * Paginated result of a customer list query.
 */
export interface CustomerListPage {
  customers: Customer[];
  total: number;
}

const EMPTY_CUSTOMER_360_STATS: Customer360Stats = {
  last_contact_at: null,
  last_job_completed_at: null,
  total_jobs: null,
  total_revenue: null,
};

/**
 * Escape characters that are wildcards in SQL LIKE/ILIKE patterns so a
 * user's literal `%` or `_` doesn't act as a wildcard. Backslash is also
 * escaped so the escape character itself can't be smuggled.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * List customers in an org, optionally filtered by archetype and free-text
 * search across `display_name` (the generated column that combines first/last
 * and falls back to company_name). Sorted by most recent contact first;
 * customers with no recorded contact land at the end. Archived customers
 * are excluded.
 *
 * Caller is responsible for sourcing `orgId` from the authenticated user's
 * active org membership — never from the URL or request body. RLS will
 * also enforce that the caller has access to the org, but defense in depth
 * means we filter explicitly.
 *
 * Returns a `Result<CustomerListPage>` per CONVENTIONS rule #1: never
 * throws on database errors — they come back as `ErrorCode.DB_ERROR`.
 */
export async function listCustomers(
  client: DbClient,
  args: ListCustomersArgs
): Promise<Result<CustomerListPage>> {
  const { orgId, search, archetype, limit, offset } = args;

  let query = client
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike('display_name', `%${escapeLikePattern(search)}%`);
  }

  if (archetype) {
    query = query.eq('archetype', archetype);
  }

  const { data, error, count } = await query;

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok({
    customers: data ?? [],
    total: count ?? 0,
  });
}

/**
 * Look up a single customer by id, scoped to the org via RLS. Returns
 * `ErrorCode.NOT_FOUND` if the customer doesn't exist or isn't visible to
 * the caller's session.
 */
export async function getCustomerById(
  client: DbClient,
  customerId: string
): Promise<Result<Customer>> {
  const { data, error } = await client
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!data) {
    return err(ErrorCode.NOT_FOUND, `Customer ${customerId} not found`);
  }

  return ok(data);
}

/**
 * Load the customer detail payload through the `get_customer_360` RPC.
 *
 * Caller provides the authenticated user's active `orgId`; the RPC enforces
 * org scoping and returns a single JSON document with the related lists
 * needed for the Week 3 customer detail page.
 */
export async function getCustomer360(
  client: DbClient,
  args: { customerId: string; orgId: string }
): Promise<Result<Customer360>> {
  const { data, error } = await client.rpc('get_customer_360', {
    search_customer_id: args.customerId,
    search_org_id: args.orgId,
  });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!isRecord(data)) {
    return err(ErrorCode.NOT_FOUND, `Customer ${args.customerId} not found`);
  }

  const payload = data as Customer360RpcPayload;

  if (!payload.customer || !isRecord(payload.customer)) {
    return err(ErrorCode.NOT_FOUND, `Customer ${args.customerId} not found`);
  }

  return ok({
    customer: payload.customer,
    openQuotes: normalizeArray(payload.open_quotes),
    properties: normalizeArray(payload.properties),
    recentJobs: normalizeArray(payload.recent_jobs),
    stats: isRecord(payload.stats) ? payload.stats : EMPTY_CUSTOMER_360_STATS,
    unpaidInvoices: normalizeArray(payload.unpaid_invoices),
  });
}
