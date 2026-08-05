/**
 * Read-only access to `communications` (calls/emails/SMS mirrored from
 * Twilio/Resend/manual entry — see supabase/migrations/0003_vault_and_comms.sql)
 * for the Customer detail page's "contact history" section. Staff-facing
 * only — nothing here is exposed to the customer portal. Follows the
 * pattern in `activity-log.ts`: raw entries for staff, a distinct
 * customer-safe projection would be added separately if this were ever
 * surfaced in the portal.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Communication = Database['public']['Tables']['communications']['Row'];

export async function listCommunicationsForCustomer(
  client: DbClient,
  args: { orgId: string; customerId: string; limit?: number }
): Promise<Result<Communication[]>> {
  const { data, error } = await client
    .from('communications')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('customer_id', args.customerId)
    .order('occurred_at', { ascending: false })
    .limit(args.limit ?? 50);

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data ?? []);
}
