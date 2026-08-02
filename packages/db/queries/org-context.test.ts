import { describe, expect, it, vi } from 'vitest';

import { getActiveOrgContext } from './org-context';

// Minimal chainable mock matching the exact query shape getActiveOrgContext
// builds: .from('org_members').select(...).eq(...).eq(...).order(...) for
// the membership list, then a second .from('user_profiles').select(...)
// .eq(...).maybeSingle() only when more than one active row is returned.
function buildClient(membershipRows: unknown[], activeOrgId: string | null) {
  const membershipChain = {
    eq: () => membershipChain,
    order: () => Promise.resolve({ data: membershipRows, error: null }),
  };
  const profileChain = {
    eq: () => ({ maybeSingle: () => Promise.resolve({ data: { active_org_id: activeOrgId }, error: null }) }),
  };
  return {
    from: (table: string) => {
      if (table === 'org_members') return { select: () => membershipChain };
      if (table === 'user_profiles') return { select: () => profileChain };
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('getActiveOrgContext — multi-org resolution', () => {
  it('single active membership: unchanged behavior, hasMultipleOrgs false', async () => {
    const client = buildClient(
      [{ org_id: 'org-a', role: 'owner', joined_at: '2026-01-01', organizations: { name: 'Org A' } }],
      null
    );
    const result = await getActiveOrgContext(client, 'user-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgId).toBe('org-a');
      expect(result.data.hasMultipleOrgs).toBe(false);
      expect(result.data.availableOrgs).toBeUndefined();
    }
  });

  it('zero active memberships: NOT_FOUND', async () => {
    const client = buildClient([], null);
    const result = await getActiveOrgContext(client, 'user-1');
    expect(result.success).toBe(false);
  });

  it('multiple memberships, valid stored preference: honors the preference, not the oldest', async () => {
    const client = buildClient(
      [
        { org_id: 'org-old', role: 'owner', joined_at: '2026-01-01', organizations: { name: 'PPM' } },
        { org_id: 'org-new', role: 'owner', joined_at: '2026-08-01', organizations: { name: 'Demo' } },
      ],
      'org-new'
    );
    const result = await getActiveOrgContext(client, 'user-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgId).toBe('org-new');
      expect(result.data.hasMultipleOrgs).toBe(true);
      expect(result.data.availableOrgs).toHaveLength(2);
    }
  });

  it('multiple memberships, no stored preference: deterministically defaults to the OLDEST (never a random/unstable choice)', async () => {
    const client = buildClient(
      [
        { org_id: 'org-old', role: 'owner', joined_at: '2026-01-01', organizations: { name: 'PPM' } },
        { org_id: 'org-new', role: 'owner', joined_at: '2026-08-01', organizations: { name: 'Demo' } },
      ],
      null
    );
    const result = await getActiveOrgContext(client, 'user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.orgId).toBe('org-old');
  });

  it('multiple memberships, stale preference pointing at a NON-member org: falls back to oldest, never trusts an invalid stored value', async () => {
    const client = buildClient(
      [
        { org_id: 'org-old', role: 'owner', joined_at: '2026-01-01', organizations: { name: 'PPM' } },
        { org_id: 'org-new', role: 'owner', joined_at: '2026-08-01', organizations: { name: 'Demo' } },
      ],
      'org-not-a-real-membership'
    );
    const result = await getActiveOrgContext(client, 'user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.orgId).toBe('org-old');
  });
});
