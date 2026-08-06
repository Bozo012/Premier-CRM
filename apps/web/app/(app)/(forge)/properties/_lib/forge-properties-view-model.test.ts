import { describe, expect, it } from 'vitest';

import { buildStatusFilters, buildTypeFilters, derivePropertyStatus, derivePropertyType, toPropertiesListViewModel, toPropertySummary } from './forge-properties-view-model';

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customerCount: 1,
    customers: [{ id: 'cust-1', displayName: 'Jane Doe', isPrimary: true, relationship: 'owner' }],
    duplicateCount: 1,
    property: {
      id: 'prop-1',
      address_line_1: '142 Cedar Lane',
      city: 'Demo',
      state: 'CA',
      zip: '90001',
      property_type: 'single_family',
      jobber_id: null,
      access_notes: null,
      gate_code: null,
      updated_at: '2026-08-01T00:00:00.000Z',
      ...((overrides.property as object) ?? {}),
    },
    ...overrides,
  } as never;
}

describe('derivePropertyStatus', () => {
  it('maps zero linked customers to inactive', () => {
    expect(derivePropertyStatus(makeItem({ customerCount: 0, customers: [] }))).toBe('inactive');
  });

  it('maps a jobber-imported property with a customer to active', () => {
    expect(derivePropertyStatus(makeItem({ property: { jobber_id: 'jobber-1' } }))).toBe('active');
  });

  it('maps a manually-created property with a customer to onboarding', () => {
    expect(derivePropertyStatus(makeItem({ property: { jobber_id: null } }))).toBe('onboarding');
  });
});

describe('derivePropertyType', () => {
  it('detects commercial from property_type text', () => {
    expect(derivePropertyType(makeItem({ property: { property_type: 'Commercial · storage yard' } }))).toBe('commercial');
  });

  it('defaults to residential otherwise', () => {
    expect(derivePropertyType(makeItem({ property: { property_type: 'single_family' } }))).toBe('residential');
    expect(derivePropertyType(makeItem({ property: { property_type: null } }))).toBe('residential');
  });
});

describe('toPropertySummary', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('maps linked customer, open work counts, and attention label', () => {
    const item = makeItem();
    const requests = [
      { property_id: 'prop-1', status: 'triage' },
      { property_id: 'prop-1', status: 'completed' },
      { property_id: 'other', status: 'triage' },
    ];
    const jobs = [
      { property_id: 'prop-1', status: 'scheduled', scheduled_start: '2026-08-10T08:00:00.000Z', title: 'Gutter cleaning' },
      { property_id: 'prop-1', status: 'completed', scheduled_start: '2026-07-01T08:00:00.000Z', title: 'Old job' },
    ];
    const summary = toPropertySummary(item, requests, jobs, now);

    expect(summary.customerId).toBe('cust-1');
    expect(summary.customerName).toBe('Jane Doe');
    expect(summary.openRequests).toBe(1);
    expect(summary.activeJobs).toBe(1);
    expect(summary.upcomingVisitLabel).toContain('Gutter cleaning');
    expect(summary.attentionLabel).toBeUndefined();
  });

  it('handles a property with no linked customer', () => {
    const item = makeItem({ customerCount: 0, customers: [] });
    const summary = toPropertySummary(item, [], [], now);
    expect(summary.customerId).toBeNull();
    expect(summary.customerName).toBe('No customer');
    expect(summary.status).toBe('inactive');
  });

  it('surfaces an attention label when access notes or a gate code are on file', () => {
    const withNotes = toPropertySummary(makeItem({ property: { access_notes: 'Side gate unlocked' } }), [], [], now);
    expect(withNotes.attentionLabel).toBe('Side gate unlocked');

    const withGateCode = toPropertySummary(makeItem({ property: { access_notes: null, gate_code: '1234' } }), [], [], now);
    expect(withGateCode.attentionLabel).toBe('Gate or access note on file');
  });
});

describe('buildStatusFilters / buildTypeFilters', () => {
  it('counts summaries per filter bucket including "all"', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const summaries = [
      toPropertySummary(makeItem({ property: { jobber_id: 'j-1' } }), [], [], now),
      toPropertySummary(makeItem({ customerCount: 0, customers: [] }), [], [], now),
    ];
    const statusFilters = buildStatusFilters(summaries);
    expect(statusFilters.find((f) => f.id === 'all')?.count).toBe(2);
    expect(statusFilters.find((f) => f.id === 'active')?.count).toBe(1);
    expect(statusFilters.find((f) => f.id === 'inactive')?.count).toBe(1);

    const typeFilters = buildTypeFilters(summaries);
    expect(typeFilters.find((f) => f.id === 'all')?.count).toBe(2);
    expect(typeFilters.find((f) => f.id === 'residential')?.count).toBe(2);
  });
});

describe('toPropertiesListViewModel', () => {
  it('applies status and type filters over the fetched page', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const summaries = [
      toPropertySummary(makeItem({ property: { jobber_id: 'j-1' } }), [], [], now),
      toPropertySummary(makeItem({ customerCount: 0, customers: [] }), [], [], now),
    ];
    const model = toPropertiesListViewModel({ properties: summaries, searchQuery: '', statusFilter: 'active', typeFilter: 'all', canCreate: false });
    expect(model.properties).toHaveLength(1);
    expect(model.totalLabel).toBe('1 of 2 properties');
  });

  it('surfaces a load error and an empty filtered list', () => {
    const model = toPropertiesListViewModel({ properties: [], searchQuery: '', statusFilter: 'all', typeFilter: 'all', canCreate: false, error: 'boom' });
    expect(model.error).toBe('boom');
    expect(model.properties).toHaveLength(0);
  });
});
