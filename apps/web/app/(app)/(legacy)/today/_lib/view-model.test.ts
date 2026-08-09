import { describe, expect, it } from 'vitest';

import { buildKanbanCards, buildSnapshotItems, buildTodaySchedule, deriveFirstName, deriveGreeting, formatScheduledTime, sortActionItems } from './view-model';
import type { BoardJob, BoardSiteVisit, TodayActionItem, TodaySiteVisit } from '@premier/db';

const NOW = new Date('2026-08-08T12:00:00Z');

function makeBoardJob(overrides: Partial<BoardJob> = {}): BoardJob {
  return {
    id: 'job-1',
    title: 'Gutter repair',
    status: 'scheduled',
    priority: 'normal',
    scheduledStart: null,
    updatedAt: '2026-08-08T00:00:00Z',
    customers: { company_name: null, display_name: 'Customer Cedar', first_name: null, last_name: null },
    properties: { address_line_1: '142 Cedar Lane', city: 'Demo County', state: 'KY' },
    ...overrides,
  };
}

function makeBoardSiteVisit(overrides: Partial<BoardSiteVisit> = {}): BoardSiteVisit {
  return {
    siteVisitId: 'visit-1',
    status: 'scheduled',
    serviceTitle: 'Kitchen remodel',
    contactName: 'Dana',
    propertyAddress: '1 Main St',
    scheduledStart: '2026-08-10T18:35:00Z',
    completedAt: null,
    ...overrides,
  };
}

describe('sortActionItems — pure presentation ordering, no workflow decisions', () => {
  it('sorts pricing-review, create-quote, and send-quote tasks chronologically by their respective timestamps', () => {
    const items: TodayActionItem[] = [
      { kind: 'send_quote', quoteId: 'q1', quoteNumber: null, title: null, customerName: null, createdAt: '2026-01-03' },
      { kind: 'pricing_review_requested', estimateId: 'e1', estimateNumber: 'EST-1', title: 'A', customerName: null, proposedTotal: 0, submittedByName: null, submittedAt: '2026-01-01' },
      { kind: 'create_quote', estimateId: 'e2', estimateNumber: 'EST-2', title: 'B', customerName: null, approvedAt: '2026-01-02' },
    ];
    const sorted = sortActionItems(items);
    expect(sorted.map((i) => i.kind)).toEqual(['pricing_review_requested', 'create_quote', 'send_quote']);
  });

  it('does not mutate the input array', () => {
    const items: TodayActionItem[] = [
      { kind: 'send_quote', quoteId: 'q1', quoteNumber: null, title: null, customerName: null, createdAt: '2026-01-01' },
    ];
    const original = [...items];
    sortActionItems(items);
    expect(items).toEqual(original);
  });
});

describe('buildTodaySchedule — merges jobs and site visits, no workflow decisions', () => {
  it('merges both lists and sorts by formatted time label', () => {
    const jobs = [{ id: 'job-1', title: 'Fence repair', scheduled_start: '2026-01-01T14:00:00Z' }];
    const visits: TodaySiteVisit[] = [
      { appointmentId: 'appt-1', siteVisitId: 'visit-1', scheduledStart: '2026-01-01T09:00:00Z', contactName: 'Dana', propertyAddress: '1 Main St' },
    ];
    const schedule = buildTodaySchedule(jobs, visits);
    expect(schedule).toHaveLength(2);
    expect(schedule.map((e) => e.kind)).toContain('job');
    expect(schedule.map((e) => e.kind)).toContain('site_visit');
  });

  it('site-visit entries use contact name as title and property address as subtitle', () => {
    const visits: TodaySiteVisit[] = [
      { appointmentId: 'appt-1', siteVisitId: 'visit-1', scheduledStart: '2026-01-01T09:00:00Z', contactName: 'Dana Whitfield', propertyAddress: '482 Fernwood Lane' },
    ];
    const [entry] = buildTodaySchedule([], visits);
    expect(entry?.title).toBe('Dana Whitfield');
    expect(entry?.subtitle).toBe('482 Fernwood Lane');
    expect(entry?.href).toBe('/site-visits/visit-1');
  });

  it('job entries link to the job route with no subtitle', () => {
    const jobs = [{ id: 'job-1', title: 'Roof inspection', scheduled_start: null }];
    const [entry] = buildTodaySchedule(jobs, []);
    expect(entry?.href).toBe('/jobs/job-1');
    expect(entry?.subtitle).toBeNull();
    expect(entry?.timeLabel).toBe('Anytime');
  });

  it('returns an empty array when nothing is scheduled', () => {
    expect(buildTodaySchedule([], [])).toEqual([]);
  });
});

describe('buildKanbanCards — maps real statuses into board columns, not a hard-coded stage or a today-only date filter', () => {
  it('groups job statuses into the Base44 board columns without changing workflow state', () => {
    const cards = buildKanbanCards(
      [makeBoardJob({ status: 'on_hold', priority: 'emergency', scheduledStart: '2026-08-08T14:00:00Z' })],
      [],
      NOW
    );

    expect(cards[0]).toMatchObject({
      customer: 'Customer Cedar',
      flag: 'Emergency',
      href: '/jobs/job-1',
      priority: 'high',
      property: '142 Cedar Lane, Demo County, KY',
      stage: 'on_hold',
      title: 'Gutter repair',
    });
  });

  // Acceptance test: "A persisted Site Visit showing 'Inspection in
  // progress' must not disappear from the Kanban merely because its
  // appointment is not today, and it must render under In Progress rather
  // than Scheduled." (Kitchen remodel, Aug 10 appointment, in_progress,
  // viewed on Aug 8.)
  it('an in-progress site visit whose appointment is in the future still renders under In Progress, not Scheduled', () => {
    const cards = buildKanbanCards(
      [],
      [makeBoardSiteVisit({ status: 'in_progress', serviceTitle: 'Kitchen remodel', scheduledStart: '2026-08-10T18:35:00Z' })],
      NOW
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stage: 'in_progress', title: 'Kitchen remodel' });
  });

  it('a same-day scheduled site visit appears in Scheduled', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ status: 'scheduled', scheduledStart: '2026-08-08T20:00:00Z' })], NOW);
    expect(cards[0]).toMatchObject({ stage: 'scheduled' });
  });

  it('a future scheduled site visit within the board horizon (7 days) appears in Scheduled', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ status: 'scheduled', scheduledStart: '2026-08-12T18:00:00Z' })], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stage: 'scheduled' });
  });

  it('a scheduled site visit beyond the board horizon is excluded', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ status: 'scheduled', scheduledStart: '2026-08-20T18:00:00Z' })], NOW);
    expect(cards).toHaveLength(0);
  });

  it('an in-progress site visit whose appointment was yesterday remains visible (no date filter applies to in_progress)', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ status: 'in_progress', scheduledStart: '2026-08-07T09:00:00Z' })], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stage: 'in_progress' });
  });

  it('a completed site visit lands in Completed and shows its completion time, not the original scheduled time', () => {
    const cards = buildKanbanCards(
      [],
      [makeBoardSiteVisit({ status: 'completed', scheduledStart: null, completedAt: '2026-08-08T15:00:00Z' })],
      NOW
    );
    expect(cards[0]).toMatchObject({ stage: 'completed' });
    expect(cards[0]?.timeLabel).toMatch(/\d{1,2}:\d{2}/);
  });

  it('site-visit card title reflects the real service title, not a generic "[customer] visit" fallback', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ serviceTitle: 'Kitchen remodel', contactName: 'Dana' })], NOW);
    expect(cards[0]?.title).toBe('Kitchen remodel');
  });

  it('falls back to customer/property placeholders when a site visit has neither', () => {
    const cards = buildKanbanCards([], [makeBoardSiteVisit({ contactName: null, propertyAddress: null })], NOW);
    expect(cards[0]).toMatchObject({ customer: 'Customer', property: 'Property' });
  });

  it('an in-progress job started days ago remains visible (no date filter applies to in_progress)', () => {
    const cards = buildKanbanCards([makeBoardJob({ status: 'in_progress', scheduledStart: '2026-08-01T09:00:00Z' })], [], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stage: 'in_progress' });
  });

  it('an on-hold job with no scheduled_start today remains visible', () => {
    const cards = buildKanbanCards([makeBoardJob({ status: 'on_hold', scheduledStart: null })], [], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stage: 'on_hold' });
  });

  it('a scheduled job beyond the board horizon is excluded, but one within it is included', () => {
    const withinHorizon = buildKanbanCards([makeBoardJob({ status: 'scheduled', scheduledStart: '2026-08-12T09:00:00Z' })], [], NOW);
    expect(withinHorizon).toHaveLength(1);

    const beyondHorizon = buildKanbanCards([makeBoardJob({ status: 'scheduled', scheduledStart: '2026-08-20T09:00:00Z' })], [], NOW);
    expect(beyondHorizon).toHaveLength(0);
  });
});

describe('buildSnapshotItems — operational counts only, never accounting totals', () => {
  it('produces exactly three actionable-count items, no revenue/currency fields', () => {
    const items = buildSnapshotItems({ newRequestCount: 3, todayScheduleCount: 2, invoicesNeedingActionCount: 1 });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.label)).toEqual(['New requests', "Today's work", 'Invoices needing action']);
    expect(items.every((i) => !/\$|revenue|total/i.test(i.helper))).toBe(true);
  });

  it('renders zero counts as "0", not blank', () => {
    const items = buildSnapshotItems({ newRequestCount: 0, todayScheduleCount: 0, invoicesNeedingActionCount: 0 });
    expect(items.every((i) => i.value === '0')).toBe(true);
  });
});

describe('deriveGreeting / deriveFirstName — pure presentation labels', () => {
  it('greets by time of day', () => {
    expect(deriveGreeting(new Date('2026-01-01T08:00:00'))).toBe('Good morning');
    expect(deriveGreeting(new Date('2026-01-01T14:00:00'))).toBe('Good afternoon');
    expect(deriveGreeting(new Date('2026-01-01T20:00:00'))).toBe('Good evening');
  });

  it('prefers profile full name, falls back to email local-part, then "there"', () => {
    expect(deriveFirstName('Dana Whitfield', 'dana@example.com')).toBe('Dana');
    expect(deriveFirstName(null, 'dana@example.com')).toBe('dana');
    expect(deriveFirstName(null, null)).toBe('there');
  });
});

describe('formatScheduledTime', () => {
  it('returns "Anytime" for a null value', () => {
    expect(formatScheduledTime(null)).toBe('Anytime');
  });

  it('formats a real timestamp as a time string', () => {
    expect(formatScheduledTime('2026-01-01T14:30:00Z')).toMatch(/\d{1,2}:\d{2}/);
  });
});
