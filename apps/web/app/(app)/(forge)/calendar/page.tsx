import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { getActiveOrgContext, getTodaySiteVisits, listJobLeadsForJobs, listJobsScheduledInRange } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { buildCalendarEvents, startOfMonth, startOfWeek } from './_lib/forge-calendar-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { CalendarShell } from './_components/calendar-shell';
import { CalendarContainer } from './_components/calendar-container';

export const metadata: Metadata = { title: 'Calendar' };

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const viewMode = readViewParam(params.view);
  const referenceDate = readDateParam(params.start) ?? new Date();

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
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </main>
    );
  }

  const { orgId } = orgContext.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContext.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const weekStart = startOfWeek(referenceDate);
  // Fetch window: for month view, the visible 6-week grid can span into the
  // adjacent month, so query a superset (the grid's actual start/end) in
  // both modes rather than maintaining two separate range calculations.
  const monthStart = startOfMonth(referenceDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 42);
  const rangeStart = viewMode === 'week' ? weekStart : gridStart;
  const rangeEnd =
    viewMode === 'week'
      ? (() => {
          const end = new Date(weekStart);
          end.setDate(end.getDate() + 7);
          return end;
        })()
      : gridEnd;

  const [jobsResult, siteVisitsResult] = await Promise.all([
    listJobsScheduledInRange(supabase, { orgId, start: rangeStart, end: rangeEnd }),
    getTodaySiteVisits(supabase, { orgId, startOfDay: rangeStart, endOfDay: rangeEnd }),
  ]);

  const jobs = jobsResult.success ? jobsResult.data : [];
  const siteVisits = siteVisitsResult.success ? siteVisitsResult.data : [];

  // Real per-job lead technician (same pattern as the Jobs list page) —
  // one batched job_assignments query for exactly the jobs in this range.
  const jobIds = jobs.map((item) => item.job.id);
  const leadNameByJobId = new Map<string, string>();
  const leadsResult = await listJobLeadsForJobs(supabase, { orgId, jobIds });
  if (leadsResult.success) {
    for (const row of leadsResult.data) {
      leadNameByJobId.set(row.jobId, row.displayName);
    }
  }

  const events = buildCalendarEvents({ jobs, siteVisits, leadNameByJobId });

  return (
    <CalendarShell shellData={shellData} mobileNav={mobileNav}>
      {!jobsResult.success || !siteVisitsResult.success ? (
        <p className="mx-auto max-w-7xl px-4 pt-4 text-sm text-red-700 sm:px-6 lg:px-8">
          Some calendar data could not be loaded. Refresh the page and try again.
        </p>
      ) : null}
      <CalendarContainer events={events} weekStart={weekStart} viewMode={viewMode} />
    </CalendarShell>
  );
}

function readViewParam(value: string | string[] | undefined): 'week' | 'month' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'month' ? 'month' : 'week';
}

function readDateParam(value: string | string[] | undefined): Date | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
