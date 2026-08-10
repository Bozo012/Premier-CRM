import { describe, expect, it } from 'vitest';

import {
  buildJobsListModel,
  deriveJobOrigin,
  deriveJobProgress,
  isValidJobsFilterId,
  statusesForFilter,
  toJobRowModel,
  type JobRowModel,
} from './forge-jobs-view-model';
import type { JobListItem } from '@premier/db';

function makeItem(overrides: Partial<JobListItem['job']> = {}, extras: Partial<JobListItem> = {}): JobListItem {
  return {
    job: {
      id: 'job-1',
      job_number: 'JOB-0001',
      title: 'Gutter cleaning',
      status: 'scheduled',
      priority: 'normal',
      org_id: 'org-1',
      customer_id: 'cust-1',
      property_id: 'prop-1',
      origin_quote_id: null,
      origin_estimate_id: null,
      origin_request_id: null,
      ...overrides,
    } as JobListItem['job'],
    customer: { id: 'cust-1', displayName: 'Cedar Customer' },
    property: { id: 'prop-1', addressLine1: '100 Cedar Ln', addressLine2: null, city: 'Austin', state: 'TX', zip: '78701' },
    category: null,
    nextScheduledAt: '2026-08-10T14:00:00.000Z',
    ...extras,
  };
}

describe('deriveJobProgress — progress-source decision', () => {
  it('every real job_status maps to a stable stage/percent pair', () => {
    expect(deriveJobProgress('lead')).toEqual({ stage: 'on_hold', percent: 0 });
    expect(deriveJobProgress('approved')).toEqual({ stage: 'scheduled', percent: 20 });
    expect(deriveJobProgress('in_progress')).toEqual({ stage: 'in_progress', percent: 65 });
    expect(deriveJobProgress('completed')).toEqual({ stage: 'completed', percent: 100 });
    expect(deriveJobProgress('paid')).toEqual({ stage: 'completed', percent: 100 });
  });

  it('two jobs in the same status always produce the same progress (no fabricated per-job variance)', () => {
    expect(deriveJobProgress('in_progress')).toEqual(deriveJobProgress('in_progress'));
  });

  it('falls back to a safe default for an unrecognized status rather than throwing', () => {
    expect(deriveJobProgress('not_a_real_status')).toEqual({ stage: 'scheduled', percent: 0 });
  });
});

describe('deriveJobOrigin', () => {
  it('prefers quote/estimate origin over request', () => {
    expect(deriveJobOrigin({ origin_quote_id: 'q-1', origin_estimate_id: null, origin_request_id: 'r-1' })).toBe('from-quote');
    expect(deriveJobOrigin({ origin_quote_id: null, origin_estimate_id: 'e-1', origin_request_id: null })).toBe('from-quote');
  });

  it('falls back to request, then manual', () => {
    expect(deriveJobOrigin({ origin_quote_id: null, origin_estimate_id: null, origin_request_id: 'r-1' })).toBe('from-request');
    expect(deriveJobOrigin({ origin_quote_id: null, origin_estimate_id: null, origin_request_id: null })).toBe('manual');
  });
});

describe('toJobRowModel', () => {
  it('projects a real lead technician name when supplied', () => {
    const row = toJobRowModel(makeItem(), 'Staff Gamma');
    expect(row.assignedTechnician).toBe('Staff Gamma');
  });

  it('shows Unassigned (never fabricates a name) when no lead is supplied', () => {
    const row = toJobRowModel(makeItem(), null);
    expect(row.assignedTechnician).toBeNull();
  });

  it('handles a missing customer/property without throwing', () => {
    const row = toJobRowModel(makeItem({}, { customer: null, property: null }), null);
    expect(row.customerName).toBe('Unknown customer');
    expect(row.propertyName).toBe('Unknown property');
  });

  it('buckets emergency priority into the "high" display bucket', () => {
    const row = toJobRowModel(makeItem({ priority: 'emergency' }), null);
    expect(row.priority).toBe('high');
  });
});

describe('filters', () => {
  it('validates known filter ids only', () => {
    expect(isValidJobsFilterId('all')).toBe(true);
    expect(isValidJobsFilterId('in_progress')).toBe(true);
    expect(isValidJobsFilterId('bogus')).toBe(false);
  });

  it('maps each filter to the real statuses used for the server-side query', () => {
    expect(statusesForFilter('completed')).toEqual(['completed', 'invoiced', 'paid']);
    expect(statusesForFilter('all')).toEqual([]);
  });
});

describe('buildJobsListModel', () => {
  it('computes filter counts from the full org-wide status list, not the current page', () => {
    const items = [makeItem({ id: 'job-1', status: 'scheduled' })];
    const model = buildJobsListModel(items, new Map(), 1, ['scheduled', 'scheduled', 'completed', 'in_progress']);

    const scheduledFilter = model.filters.find((f) => f.id === 'scheduled');
    const completedFilter = model.filters.find((f) => f.id === 'completed');
    const allFilter = model.filters.find((f) => f.id === 'all');

    expect(scheduledFilter?.count).toBe(2);
    expect(completedFilter?.count).toBe(1);
    expect(allFilter?.count).toBe(4);
  });

  it('rows list length matches the current page, independent of the org-wide counts', () => {
    const items = [makeItem({ id: 'job-1' }), makeItem({ id: 'job-2' })];
    const model = buildJobsListModel(items, new Map(), 2, ['scheduled', 'scheduled']);
    expect(model.jobs).toHaveLength(2);
  });
});

describe('JobRowModel shape sanity', () => {
  it('never leaves progress outside 0-100', () => {
    const statuses = ['lead', 'site_visit_scheduled', 'quoted', 'approved', 'scheduled', 'in_progress', 'on_hold', 'completed', 'invoiced', 'paid', 'cancelled'];
    for (const status of statuses) {
      const row: JobRowModel = toJobRowModel(makeItem({ status: status as never }), null);
      expect(row.progress).toBeGreaterThanOrEqual(0);
      expect(row.progress).toBeLessThanOrEqual(100);
    }
  });
});
