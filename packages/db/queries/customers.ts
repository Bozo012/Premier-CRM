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

/**
 * Paginated result of a customer list query.
 */
export interface CustomerListPage {
  customers: Customer[];
  total: number;
}

/**
 * Escape characters that are wildcards in SQL LIKE/ILIKE patterns so a
 * user's literal `%` or `_` doesn't act as a wildcard. Backslash is also
 * escaped so the escape character itself can't be smuggled.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
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
