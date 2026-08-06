import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarDays, MapPin, Wrench } from 'lucide-react';

import { getActiveOrgContext, getTodaySiteVisits } from '@premier/db';

import { ForgeCard, ForgePage, ForgeSectionTitle, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Calendar' };

interface CalendarJob {
  id: string;
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
}

interface CalendarEvent {
  customerLabel: string;
  href: string;
  id: string;
  kind: 'job' | 'site_visit';
  locationLabel: string;
  start: string;
  statusLabel: string;
  title: string;
}

export default async function CalendarPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/calendar');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);

  if (!orgContext.success) {
    return (
      <ForgePage className="max-w-6xl gap-5">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </ForgePage>
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfWindow = new Date(startOfDay);
  endOfWindow.setDate(endOfWindow.getDate() + 30);

  const [jobsResult, siteVisitsResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title, scheduled_start, scheduled_end, status')
      .eq('org_id', orgContext.data.orgId)
      .gte('scheduled_start', startOfDay.toISOString())
      .lt('scheduled_start', endOfWindow.toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(100),
    getTodaySiteVisits(supabase, {
      orgId: orgContext.data.orgId,
      startOfDay,
      endOfDay: endOfWindow,
    }),
  ]);

  const jobEvents: CalendarEvent[] = ((jobsResult.data as CalendarJob[] | null) ?? [])
    .filter((job) => job.scheduled_start)
    .map((job) => ({
      customerLabel: 'Job',
      href: `/jobs/${job.id}`,
      id: job.id,
      kind: 'job',
      locationLabel: job.scheduled_end ? `Ends ${formatTime(job.scheduled_end)}` : 'No end time',
      start: job.scheduled_start!,
      statusLabel: labelize(job.status),
      title: job.title,
    }));

  const siteVisitEvents: CalendarEvent[] = siteVisitsResult.success
    ? siteVisitsResult.data.map((visit) => ({
        customerLabel: visit.contactName ?? 'Site visit',
        href: `/site-visits/${visit.siteVisitId}`,
        id: visit.appointmentId,
        kind: 'site_visit',
        locationLabel: visit.propertyAddress ?? 'No property address',
        start: visit.scheduledStart,
        statusLabel: 'Scheduled',
        title: 'Site visit',
      }))
    : [];

  const events = [...jobEvents, ...siteVisitEvents].sort((a, b) => a.start.localeCompare(b.start));
  const groupedEvents = groupByDate(events);

  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          See scheduled jobs and site visits from Premier&apos;s real schedule.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Scheduled work" value={events.length} />
        <SummaryCard label="Jobs" value={jobEvents.length} />
        <SummaryCard label="Site visits" value={siteVisitEvents.length} />
      </div>

      {jobsResult.error || !siteVisitsResult.success ? (
        <ForgeCard className="border-red-200 bg-red-50 text-sm text-red-700">
          Some calendar data could not be loaded. Refresh the page and try again.
        </ForgeCard>
      ) : null}

      {events.length === 0 ? (
        <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
          <div>
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold">No scheduled work in the next 30 days</h2>
            <p className="mt-1 text-sm text-muted-foreground">Scheduled jobs and visits will appear here.</p>
          </div>
        </ForgeCard>
      ) : (
        <section className="space-y-4">
          <ForgeSectionTitle>Next 30 days</ForgeSectionTitle>
          {groupedEvents.map(([dateLabel, items]) => (
            <ForgeCard key={dateLabel} className="overflow-hidden p-0">
              <div className="border-b bg-muted/40 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{dateLabel}</h2>
              </div>
              <ol className="divide-y">
                {items.map((event) => (
                  <li key={`${event.kind}-${event.id}`}>
                    <Link
                      href={event.href}
                      className="grid gap-3 p-4 transition hover:bg-muted/30 sm:grid-cols-[84px_1fr_auto] sm:items-center"
                    >
                      <div>
                        <time className="text-lg font-bold tabular-nums text-foreground">{formatTime(event.start)}</time>
                        <p className="text-xs font-semibold text-muted-foreground">{event.kind === 'site_visit' ? 'Site visit' : 'Job'}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {event.kind === 'site_visit' ? <Wrench className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-muted-foreground" />}
                          <h3 className="truncate font-bold text-foreground">{event.title}</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{event.customerLabel}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          <span className="truncate">{event.locationLabel}</span>
                        </p>
                      </div>
                      <ForgeStatusPill tone={event.kind === 'site_visit' ? 'blue' : 'neutral'}>{event.statusLabel}</ForgeStatusPill>
                    </Link>
                  </li>
                ))}
              </ol>
            </ForgeCard>
          ))}
        </section>
      )}
    </ForgePage>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <ForgeCard>
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold text-foreground">{value}</div>
    </ForgeCard>
  );
}

function groupByDate(events: CalendarEvent[]): Array<[string, CalendarEvent[]]> {
  const groups = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const label = new Date(event.start).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }

  return Array.from(groups.entries());
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
