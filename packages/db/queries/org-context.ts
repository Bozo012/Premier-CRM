import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type OrgMemberRole = Database['public']['Enums']['user_role'];

/**
 * The one shared definition of "can manage the team" (invites, roles,
 * revocation). Previously copy-pasted as `role === 'owner' || role === 'admin'`
 * at each call site (team/actions.ts, team/page.tsx) — centralized here so a
 * future role addition (e.g. a manager tier) only needs one edit.
 */
export function canManageTeam(role: OrgMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

export interface AvailableOrgMembership {
  orgId: string;
  orgName: string;
  role: OrgMemberRole;
}

export interface ActiveOrgContext {
  orgId: string;
  role: OrgMemberRole;
  orgName: string;
  /** True only when this account holds more than one active membership. */
  hasMultipleOrgs: boolean;
  /** Populated only when hasMultipleOrgs is true — every active membership, for rendering a switcher. */
  availableOrgs?: AvailableOrgMembership[];
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
 *  - Exactly one active membership -> `ok({ orgId, role, orgName, hasMultipleOrgs: false })`.
 *  - More than one active membership (Forge Demonstration org support,
 *    2026-08-02) -> resolved via `user_profiles.active_org_id`, a
 *    per-account preference set ONLY by the guarded `switch_active_org()`
 *    RPC (never written directly, never trusted from a client-supplied
 *    value here). If that preference points at one of the caller's own
 *    active memberships, it wins. Otherwise this deterministically defaults
 *    to the OLDEST active membership (by `org_members.joined_at` ascending)
 *    — never a random/unstable choice, and never a membership added later
 *    silently taking over a user's default org. `hasMultipleOrgs: true` and
 *    `availableOrgs` are populated so the UI can render a switcher; every
 *    existing call site that only destructures `{ orgId, role, orgName }`
 *    keeps working unchanged.
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
    .select('org_id, role, joined_at, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

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

  if (rows.length === 1) {
    const [row] = rows;
    return ok({
      orgId: row!.org_id,
      role: row!.role,
      orgName: row!.organizations?.name?.trim() || 'Unknown organization',
      hasMultipleOrgs: false,
    });
  }

  const { data: profile } = await client
    .from('user_profiles')
    .select('active_org_id')
    .eq('id', userId)
    .maybeSingle();

  const preferredRow = profile?.active_org_id
    ? rows.find((row) => row.org_id === profile.active_org_id)
    : undefined;
  const activeRow = preferredRow ?? rows[0]!; // rows sorted by joined_at ascending — oldest first if no valid preference.

  return ok({
    orgId: activeRow.org_id,
    role: activeRow.role,
    orgName: activeRow.organizations?.name?.trim() || 'Unknown organization',
    hasMultipleOrgs: true,
    availableOrgs: rows.map((row) => ({
      orgId: row.org_id,
      orgName: row.organizations?.name?.trim() || 'Unknown organization',
      role: row.role,
    })),
  });
}
