import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type OrgMemberRole = Database['public']['Enums']['user_role'];

export interface ActiveOrgContext {
  orgId: string;
  role: OrgMemberRole;
  orgName: string;
}

/**
 * The one correct way to resolve "what organization is this signed-in user
 * currently acting in" anywhere in the app — server components, server
 * actions, and query modules alike.
 *
 * Why this exists (PR C0): every call site used to run its own
 * `.from('org_members').select('org_id').eq('user_id', ...).limit(1).maybeSingle()`,
 * with no `status = 'active'` filter. `limit(1)` picks an arbitrary row when
 * more than one exists, and a stale `pending` row (e.g. from
 * `handle_new_user()`'s old auto-attach behavior — see migration
 * 20260727010000_fix_handle_new_user_no_auto_membership.sql) could be chosen
 * over a real active one, or the only row a user has could be the wrong
 * status entirely, producing the "Unknown org • Employee" dashboard bug this
 * PR fixes.
 *
 * Contract:
 *  - Zero active memberships -> `ErrorCode.NOT_FOUND`. Callers should render
 *    a clear "no active organization" state, never a fabricated placeholder.
 *  - Exactly one active membership -> `ok({ orgId, role, orgName })`.
 *  - More than one active membership -> `ErrorCode.CONFLICT`. This product
 *    currently supports exactly one active org per user; silently picking
 *    one would hide a real data problem, so this is surfaced instead of
 *    resolved automatically. If multi-org support becomes a real product
 *    requirement, replace this branch with an explicit org selector rather
 *    than loosening the check.
 *
 * Never trust a client-supplied org_id in place of this lookup — always
 * resolve the caller's own active membership server-side first.
 */
export async function getActiveOrgContext(
  client: DbClient,
  userId: string
): Promise<Result<ActiveOrgContext>> {
  const { data, error } = await client
    .from('org_members')
    .select('org_id, role, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return err(
      ErrorCode.NOT_FOUND,
      'No active organization membership was found for this account.'
    );
  }

  if (rows.length > 1) {
    return err(
      ErrorCode.CONFLICT,
      `This account has ${rows.length} active organization memberships, but only one is supported today. Contact an owner to resolve which one is correct.`
    );
  }

  const [row] = rows;
  return ok({
    orgId: row!.org_id,
    role: row!.role,
    orgName: row!.organizations?.name?.trim() || 'Unknown organization',
  });
}
