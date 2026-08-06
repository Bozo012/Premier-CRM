import { describe, expect, it } from 'vitest';

import { buildTeamFilters, buildTeamMemberView, formatLastActive, initialsFor, roleLabel, toTeamListViewModel } from './forge-team-view-model';

function makeMember(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'member-1',
    user_id: 'user-1',
    role: 'employee',
    joined_at: '2026-03-01T00:00:00.000Z',
    org_id: 'org-1',
    status: 'active',
    ...overrides,
  } as never;
}

describe('buildTeamMemberView', () => {
  it('maps a member with no availability record to "available" and a joined-date last-active', () => {
    const view = buildTeamMemberView({ activeAssignments: 0, availability: undefined, email: 'jane@example.com', member: makeMember(), profile: { full_name: 'Jane Doe', phone: '555-0100' } });
    expect(view.availability).toBe('available');
    expect(view.manualAvailability).toBe('available');
    expect(view.lastActiveLabel).toContain('Joined');
    expect(view.skills).toEqual(['Field work', 'Customer updates']);
  });

  it('resolves displayed availability to on_job when active assignments exist and manual status is available', () => {
    const view = buildTeamMemberView({ activeAssignments: 2, availability: undefined, email: null, member: makeMember(), profile: undefined });
    expect(view.availability).toBe('on_job');
    expect(view.fullName).toBe('Unnamed user');
  });

  it('a manual on_leave status overrides assignment-derived availability', () => {
    const view = buildTeamMemberView({
      activeAssignments: 3,
      availability: { availability_status: 'on_leave', last_seen_at: null, skills: ['Electrical'] } as never,
      email: null,
      member: makeMember(),
      profile: { full_name: 'Sam', phone: null },
    });
    expect(view.availability).toBe('on_leave');
    expect(view.skills).toEqual(['Electrical']);
  });
});

describe('formatLastActive / roleLabel / initialsFor', () => {
  it('falls back to joined date when last_seen_at is missing', () => {
    expect(formatLastActive(null, '2026-03-01T00:00:00.000Z')).toContain('Joined');
  });

  it('formats role and initials', () => {
    expect(roleLabel('subcontractor')).toBe('subcontractor');
    expect(initialsFor('Jane Doe')).toBe('JD');
    expect(initialsFor('')).toBe('');
  });
});

describe('toTeamListViewModel', () => {
  it('filters by availability and search text over the fetched page', () => {
    const members = [
      buildTeamMemberView({ activeAssignments: 0, availability: undefined, email: 'a@x.com', member: makeMember({ id: 'm1', role: 'owner' }), profile: { full_name: 'Alpha Owner', phone: null } }),
      buildTeamMemberView({
        activeAssignments: 1,
        availability: { availability_status: 'on_leave', last_seen_at: null, skills: [] } as never,
        email: 'b@x.com',
        member: makeMember({ id: 'm2', role: 'employee' }),
        profile: { full_name: 'Beta Tech', phone: null },
      }),
    ];

    const model = toTeamListViewModel({ members, searchQuery: '', activeFilter: 'on_leave' });
    expect(model.members).toHaveLength(1);
    expect(model.members[0]?.name).toBe('Beta Tech');

    const searched = toTeamListViewModel({ members, searchQuery: 'alpha', activeFilter: 'all' });
    expect(searched.members).toHaveLength(1);
    expect(searched.members[0]?.name).toBe('Alpha Owner');
  });

  it('canInvite defaults to false and only becomes true when explicitly passed', () => {
    // Regression: the ported TeamList component always rendered its
    // "Invite member" button (it's permission-free by design); this flag
    // is what page.tsx uses to actually gate it. Defaulting to false keeps
    // the error-state call sites (which don't pass canInvite) fail-closed.
    const defaulted = toTeamListViewModel({ members: [], searchQuery: '', activeFilter: 'all' });
    expect(defaulted.canInvite).toBe(false);

    const forManager = toTeamListViewModel({ members: [], searchQuery: '', activeFilter: 'all', canInvite: true });
    expect(forManager.canInvite).toBe(true);
  });

  it('builds filter counts including "all"', () => {
    const members = [
      buildTeamMemberView({ activeAssignments: 0, availability: undefined, email: null, member: makeMember({ id: 'm1' }), profile: { full_name: 'A', phone: null } }),
    ];
    const filters = buildTeamFilters(members);
    expect(filters.find((f) => f.id === 'all')?.count).toBe(1);
  });
});
