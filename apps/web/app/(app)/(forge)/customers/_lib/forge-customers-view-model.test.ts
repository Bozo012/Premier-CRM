import { describe, expect, it } from 'vitest';

import {
  buildCustomerFilters,
  deriveCustomerPresentationStatus,
  formatRelativeActivity,
  resolveCustomerDisplayName,
  toCustomerSummary,
  toCustomersListViewModel,
} from './forge-customers-view-model';

function makeCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cust-1',
    display_name: 'Jane Doe',
    company_name: null,
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone_primary: '555-0100',
    is_archived: false,
    total_jobs: 0,
    last_contact_at: null,
    updated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as never;
}

describe('deriveCustomerPresentationStatus', () => {
  it('maps archived customers to inactive regardless of job history', () => {
    expect(deriveCustomerPresentationStatus({ is_archived: true, total_jobs: 12 })).toBe('inactive');
  });

  it('maps non-archived customers with completed jobs to active', () => {
    expect(deriveCustomerPresentationStatus({ is_archived: false, total_jobs: 3 })).toBe('active');
  });

  it('maps non-archived customers with no job history to prospect', () => {
    expect(deriveCustomerPresentationStatus({ is_archived: false, total_jobs: 0 })).toBe('prospect');
    expect(deriveCustomerPresentationStatus({ is_archived: false, total_jobs: null })).toBe('prospect');
  });
});

describe('resolveCustomerDisplayName', () => {
  it('prefers display_name', () => {
    expect(resolveCustomerDisplayName(makeCustomer({ display_name: 'Acme Co' }))).toBe('Acme Co');
  });

  it('falls back to company_name, then first+last name, then Unnamed customer', () => {
    expect(resolveCustomerDisplayName(makeCustomer({ display_name: null, company_name: 'Acme Holdings' }))).toBe('Acme Holdings');
    expect(resolveCustomerDisplayName(makeCustomer({ display_name: null, company_name: null, first_name: 'Sam', last_name: 'Lee' }))).toBe('Sam Lee');
    expect(resolveCustomerDisplayName(makeCustomer({ display_name: null, company_name: null, first_name: null, last_name: null }))).toBe(
      'Unnamed customer'
    );
  });
});

describe('formatRelativeActivity', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('reports "No activity yet" for missing timestamps', () => {
    expect(formatRelativeActivity(null, now)).toBe('No activity yet');
  });

  it('formats hours, days, and weeks', () => {
    expect(formatRelativeActivity('2026-08-05T11:30:00.000Z', now)).toBe('Now');
    expect(formatRelativeActivity('2026-08-05T06:00:00.000Z', now)).toBe('6h ago');
    expect(formatRelativeActivity('2026-08-03T12:00:00.000Z', now)).toBe('2d ago');
    expect(formatRelativeActivity('2026-07-01T12:00:00.000Z', now)).toBe('5w ago');
  });
});

describe('toCustomerSummary', () => {
  it('counts only open requests/estimates and maps properties', () => {
    const summary = toCustomerSummary(
      makeCustomer({ is_archived: false, total_jobs: 2 }),
      [{ customer_id: 'cust-1', properties: { id: 'prop-1', address_line_1: '1 Main St', property_type: 'commercial' } }],
      [
        { customer_id: 'cust-1', status: 'new' },
        { customer_id: 'cust-1', status: 'completed' },
      ],
      [
        { customer_id: 'cust-1', status: 'sent' },
        { customer_id: 'cust-1', status: 'declined' },
      ],
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(summary.status).toBe('active');
    expect(summary.openRequests).toBe(1);
    expect(summary.openEstimates).toBe(1);
    expect(summary.properties).toEqual([{ id: 'prop-1', name: '1 Main St', address: '1 Main St', type: 'commercial', typeLabel: 'Commercial' }]);
    expect(summary.nextActionLabel).toBe('Triage open request');
  });

  it('falls back to "Create an estimate" for prospects with no open work', () => {
    const summary = toCustomerSummary(makeCustomer({ is_archived: false, total_jobs: 0 }), [], [], [], new Date('2026-08-05T12:00:00.000Z'));
    expect(summary.status).toBe('prospect');
    expect(summary.nextActionId).toBe('create-estimate');
  });
});

describe('buildCustomerFilters', () => {
  it('counts customers per status plus an "all" bucket', () => {
    const customers = [
      toCustomerSummary(makeCustomer({ id: 'a', is_archived: false, total_jobs: 1 }), [], [], []),
      toCustomerSummary(makeCustomer({ id: 'b', is_archived: false, total_jobs: 0 }), [], [], []),
      toCustomerSummary(makeCustomer({ id: 'c', is_archived: true, total_jobs: 5 }), [], [], []),
    ];
    const filters = buildCustomerFilters(customers);
    expect(filters).toEqual([
      { id: 'all', label: 'All', count: 3 },
      { id: 'active', label: 'Active', count: 1 },
      { id: 'prospect', label: 'Prospect', count: 1 },
      { id: 'inactive', label: 'Inactive', count: 1 },
    ]);
  });
});

describe('toCustomersListViewModel', () => {
  it('filters by status without touching search (already applied server-side)', () => {
    const customers = [
      toCustomerSummary(makeCustomer({ id: 'a', is_archived: false, total_jobs: 1 }), [], [], []),
      toCustomerSummary(makeCustomer({ id: 'b', is_archived: true, total_jobs: 5 }), [], [], []),
    ];
    const model = toCustomersListViewModel({ customers, searchQuery: 'jane', statusFilter: 'inactive' });
    expect(model.customers).toHaveLength(1);
    expect(model.customers[0]?.id).toBe('b');
    expect(model.searchQuery).toBe('jane');
    expect(model.activeFilter).toBe('inactive');
    expect(model.filters.find((f) => f.id === 'all')?.count).toBe(2);
  });
});
