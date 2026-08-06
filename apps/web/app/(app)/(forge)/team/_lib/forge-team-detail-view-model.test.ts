import { describe, expect, it } from 'vitest';

import { buildCapabilitySummary, toTeamMemberDetailModel } from './forge-team-detail-view-model';

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

describe('buildCapabilitySummary', () => {
  it('lists granted capabilities for owner', () => {
    const summary = buildCapabilitySummary('owner');
    expect(summary).toContain('Approve estimate pricing');
    expect(summary).toContain('Record payments');
  });

  it('excludes owner/admin-only capabilities for viewer', () => {
    const summary = buildCapabilitySummary('viewer');
    expect(summary).toBe('No elevated capabilities for this role.');
  });
});

describe('toTeamMemberDetailModel', () => {
  it('maps identity, availability, and assigned work into the generic RecordDetailModel', () => {
    const model = toTeamMemberDetailModel({
      member: makeMember(),
      profile: { full_name: 'Jane Doe', phone: '555-0100' },
      availability: null,
      email: 'jane@example.com',
      assignedSiteVisits: [{ id: 'sv-1', status: 'scheduled', completed_at: null }],
      upcomingAppointments: [{ id: 'appt-1', site_visit_id: 'sv-1', scheduled_start: '2026-08-10T08:00:00.000Z', status: 'scheduled' }],
      canManageTeam: false,
      isSelf: true,
    });

    expect(model.title).toBe('Jane Doe');
    expect(model.recordType).toBe('Team member');
    // One open assignment resolves displayed availability to on_job even
    // though the manual/default status is available.
    expect(model.statusLabel).toBe('On job');
    const assignedSection = model.sections.find((s) => s.id === 'assigned');
    expect(assignedSection?.kind).toBe('related');
    if (assignedSection?.kind === 'related') {
      expect(assignedSection.items).toHaveLength(1);
      expect(assignedSection.items[0]?.route).toBe('/site-visits/sv-1');
    }
    const scheduleSection = model.sections.find((s) => s.id === 'schedule');
    if (scheduleSection?.kind === 'related') {
      expect(scheduleSection.items[0]?.route).toBe('/site-visits/sv-1');
    }
  });

  it('never exposes edit-role/deactivate actions — no real backend action exists', () => {
    const model = toTeamMemberDetailModel({
      member: makeMember(),
      profile: null,
      availability: null,
      email: null,
      assignedSiteVisits: [],
      upcomingAppointments: [],
      canManageTeam: true,
      isSelf: false,
    });
    expect(model.primaryAction).toBeNull();
    expect(model.secondaryActions).toEqual([]);
  });
});
