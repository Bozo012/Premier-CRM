// Layer 2 adapter — maps real jobs (packages/db/queries/jobs.ts:
// listJobsScheduledInRange, an additive query added for this slice) and real
// site visits (packages/db/queries/today-actions.ts:getTodaySiteVisits,
// already range-generic despite its "Today" name — the pre-existing
// (legacy)/calendar/page.tsx already called it with a 30-day window) into
// the Base44-exact CalendarView presentation's event shape (ported from
// Forge-Base44-UX @ 497d0693 — src/contracts/calendar.ts's CalendarEvent).
//
// CALENDAR DATA MODEL DECISION: no `calendar_events` table exists anywhere
// in supabase/migrations (verified via `grep -r calendar_event`) and no UI
// creates one. Base44's Week/Month grid is fully supportable by combining
// real jobs.scheduled_start and real site_visit_appointments.scheduled_start
// — exactly what the pre-existing calendar page already did (just without a
// week/month grid or crew context) — so no new events table is introduced.
import type { JobsInRangeItem, TodaySiteVisit } from '@premier/db';

import { formatEnumLabel } from '../../jobs/_lib/forge-jobs-view-model';

export interface CalendarEventModel {
  id: string;
  title: string;
  kind: 'job' | 'site-visit';
  kindLabel: string;
  customerName: string;
  propertyName: string;
  startTime: string; // "HH:MM" 24h, for the week grid's slot lookup
  endLabel: string;
  date: string; // "YYYY-MM-DD" local
  technician: string;
  statusLabel: string;
  route: string;
}

export interface CalendarViewModel {
  events: CalendarEventModel[];
  weekStart: Date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toLocalTimeKey(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatClockTime(value: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(value);
}

/** Monday-start week containing `reference`. */
export function startOfWeek(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d;
}

export function startOfMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

function jobRouteAndTechnician(job: JobsInRangeItem['job'], leadNameByJobId: Map<string, string>): string {
  return leadNameByJobId.get(job.id) ?? 'Unassigned';
}

export function buildCalendarEvents(args: {
  jobs: JobsInRangeItem[];
  siteVisits: TodaySiteVisit[];
  leadNameByJobId: Map<string, string>;
}): CalendarEventModel[] {
  const { jobs, siteVisits, leadNameByJobId } = args;

  const jobEvents: CalendarEventModel[] = jobs
    .filter((item) => item.job.scheduled_start)
    .map((item) => {
      const start = new Date(item.job.scheduled_start as string);
      return {
        id: item.job.id,
        title: item.job.title.trim() || item.job.job_number || 'Untitled job',
        kind: 'job',
        kindLabel: 'Job',
        customerName: item.customer?.displayName ?? 'Unknown customer',
        propertyName: item.property ? item.property.addressLine1 : 'Unknown property',
        startTime: toLocalTimeKey(start),
        endLabel: item.job.scheduled_end ? `Ends ${formatClockTime(new Date(item.job.scheduled_end))}` : formatClockTime(start),
        date: toLocalDateKey(start),
        technician: jobRouteAndTechnician(item.job, leadNameByJobId),
        statusLabel: formatEnumLabel(item.job.status),
        route: `/jobs/${item.job.id}`,
      };
    });

  const siteVisitEvents: CalendarEventModel[] = siteVisits.map((visit) => {
    const start = new Date(visit.scheduledStart);
    return {
      id: visit.appointmentId,
      title: 'Site visit',
      kind: 'site-visit',
      kindLabel: 'Site visit',
      customerName: visit.contactName ?? 'Unknown contact',
      propertyName: visit.propertyAddress ?? 'Unknown property',
      startTime: toLocalTimeKey(start),
      endLabel: formatClockTime(start),
      date: toLocalDateKey(start),
      technician: 'Not assigned', // Real gap — site_visit_appointments has no per-appointment crew field distinct from site_visits.assigned_user_id, which this range query doesn't currently join; documented in the report.
      statusLabel: 'Scheduled',
      route: `/site-visits/${visit.siteVisitId}`,
    };
  });

  return [...jobEvents, ...siteVisitEvents].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
