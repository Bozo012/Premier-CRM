import { describe, expect, it } from 'vitest';

import { buildSnapshotItems, buildTodaySchedule, deriveFirstName, deriveGreeting, formatScheduledTime, sortActionItems } from './view-model';
import type { TodayActionItem, TodaySiteVisit } from '@premier/db';

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
