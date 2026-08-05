/**
 * Reads for `customer_accounts` (the portal-account link — see
 * apps/web/lib/customer-portal-account.ts for the write path and
 * apps/web/lib/auth-routing.ts for the other existing direct read site).
 * Consolidates what was previously 3+ ad hoc `.from('customer_accounts')`
 * calls scattered across apps/web into one reusable, org-scoped query, for
 * the Customer detail page's "portal account status" widget.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type CustomerAccount = Database['public']['Tables']['customer_accounts']['Row'];

export async function getCustomerAccountStatus(
  client: DbClient,
  args: { orgId: string; customerId: string }
): Promise<Result<CustomerAccount | null>> {
  const { data, error } = await client
    .from('customer_accounts')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('customer_id', args.customerId)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data ?? null);
}
