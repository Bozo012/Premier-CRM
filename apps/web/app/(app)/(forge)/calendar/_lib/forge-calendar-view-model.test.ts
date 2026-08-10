import { describe, expect, it } from 'vitest';

import type { JobsInRangeItem, TodaySiteVisit } from '@premier/db';

import { buildCalendarEvents, startOfMonth, startOfWeek } from './forge-calendar-view-model';

function makeJob(overrides: Partial<JobsInRangeItem> = {}): JobsInRangeItem {
  return {
    job: {
      id: 'job-1',
      title: 'Gutter cleaning',
      job_number: 'JOB-0001',
      status: 'scheduled',
      priority: 'normal',
      scheduled_start: '2026-08-10T14:00:00.000Z',
      scheduled_end: '2026-08-10T16:00:00.000Z',
    },
    customer: { id: 'cust-1', displayName: 'Cedar Customer' },
    property: { id: 'prop-1', addressLine1: '100 Cedar Ln', addressLine2: null, city: 'Austin', state: 'TX', zip: '78701' },
    category: null,
    ...overrides,
  };
}

function makeSiteVisit(overrides: Partial<TodaySiteVisit> = {}): TodaySiteVisit {
  return {
    appointmentId: 'appt-1',
    siteVisitId: 'visit-1',
    scheduledStart: '2026-08-10T09:00:00.000Z',
    contactName: 'Brook Customer',
    propertyAddress: '200 Brook Ave',
    ...overrides,
  };
}

describe('startOfWeek', () => {
  it('returns the Monday of the week containing the reference date', () => {
    // 2026-08-10 is a Monday
    const monday = startOfWeek(new Date('2026-08-12T15:00:00.000Z'));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(10);
  });
});

describe('startOfMonth', () => {
  it('returns the 1st of the reference month', () => {
    const first = startOfMonth(new Date('2026-08-12T15:00:00.000Z'));
    expect(first.getDate()).toBe(1);
    expect(first.getMonth()).toBe(7); // August, 0-indexed
  });
});

describe('buildCalendarEvents — job projection', () => {
  it('projects a scheduled job into a calendar event with a real /jobs/:id route', () => {
    const events = buildCalendarEvents({ jobs: [makeJob()], siteVisits: [], leadNameByJobId: new Map() });
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('job');
    expect(events[0]!.route).toBe('/jobs/job-1');
  });

  it('excludes a job with no real scheduled_start rather than fabricating a date', () => {
    const events = buildCalendarEvents({
      jobs: [makeJob({ job: { ...makeJob().job, scheduled_start: null } })],
      siteVisits: [],
      leadNameByJobId: new Map(),
    });
    expect(events).toHaveLength(0);
  });

  it('shows Unassigned, never a fabricated name, when no lead is known', () => {
    const events = buildCalendarEvents({ jobs: [makeJob()], siteVisits: [], leadNameByJobId: new Map() });
    expect(events[0]!.technician).toBe('Unassigned');
  });

  it('projects the real lead technician name when supplied', () => {
    const events = buildCalendarEvents({ jobs: [makeJob()], siteVisits: [], leadNameByJobId: new Map([['job-1', 'Staff Gamma']]) });
    expect(events[0]!.technician).toBe('Staff Gamma');
  });
});

describe('buildCalendarEvents — site-visit projection', () => {
  it('projects a site visit into a calendar event with a real /site-visits/:id route', () => {
    const events = buildCalendarEvents({ jobs: [], siteVisits: [makeSiteVisit()], leadNameByJobId: new Map() });
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('site-visit');
    expect(events[0]!.route).toBe('/site-visits/visit-1');
  });

  it('falls back to "Unknown contact"/"Unknown property" without fabricating values', () => {
    const events = buildCalendarEvents({ jobs: [], siteVisits: [makeSiteVisit({ contactName: null, propertyAddress: null })], leadNameByJobId: new Map() });
    expect(events[0]!.customerName).toBe('Unknown contact');
    expect(events[0]!.propertyName).toBe('Unknown property');
  });
});

describe('buildCalendarEvents — schedule ordering', () => {
  it('sorts combined job and site-visit events chronologically', () => {
    const events = buildCalendarEvents({
      jobs: [makeJob({ job: { ...makeJob().job, id: 'job-late', scheduled_start: '2026-08-10T18:00:00.000Z' } })],
      siteVisits: [makeSiteVisit({ scheduledStart: '2026-08-10T09:00:00.000Z' })],
      leadNameByJobId: new Map(),
    });
    expect(events.map((e) => e.kind)).toEqual(['site-visit', 'job']);
  });
});
