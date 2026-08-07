import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, Inbox, MapPin, Plus, Search } from 'lucide-react';

import { getActiveOrgContext, listSiteVisits } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';
import type { ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { toForgeSiteVisitSummary, type ForgeSiteVisitSummary } from './_lib/forge-site-visit-view-model';
import { SiteVisitsShell } from './_components/site-visits-shell';

export const metadata: Metadata = { title: 'Site Visits' };

interface SiteVisitsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Needs scheduling', value: 'awaiting_scheduling' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export default async function SiteVisitsPage({ searchParams }: SiteVisitsPageProps) {
  const params = await searchParams;
  const status = readStatusParam(params.status);
  const query = readStringParam(params.q);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/site-visits');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const result = await listSiteVisits(supabase, {
    orgId: orgContextResult.data.orgId,
    limit: 100,
    offset: 0,
    status,
  });

  if (!result.success) {
    return (
      <PageShell status={status} query={query} visits={[]} shellData={shellData} mobileNav={mobileNav}>
        <ErrorPanel>Failed to load site visits: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const visits = filterVisits(result.data.visits.map((visit) => toForgeSiteVisitSummary(visit)), query);

  return (
    <PageShell
      status={status}
      query={query}
      visits={result.data.visits.map((visit) => toForgeSiteVisitSummary(visit))}
      shellData={shellData}
      mobileNav={mobileNav}
    >
      <p className="text-sm font-medium text-muted-foreground">
        {visits.length} {visits.length === 1 ? 'site visit' : 'site visits'}
      </p>

      {visits.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visits.map((visit) => (
            <Link
              key={visit.id}
              href={`/site-visits/${visit.id}`}
              className="group rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground">{visit.visitNumber}</span>
                <ForgeStatusPill tone={visit.statusTone}>{visit.statusLabel}</ForgeStatusPill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-bold">{visit.scheduledDate}</span>
                <span className="text-muted-foreground">{visit.scheduledTime}</span>
              </div>
              <p className="mt-2 text-sm font-bold leading-snug">{visit.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{visit.customerName}</p>
              {visit.propertyAddress ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {visit.propertyAddress}
                </p>
              ) : null}
              {visit.progressLabel && visit.progressPercent !== null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{visit.progressLabel}</span>
                    <span className="font-bold text-primary">{visit.progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${visit.progressPercent}%` }} />
                  </div>
                </div>
              ) : null}
              {visit.nextActionLabel ? (
                <div className="mt-3 text-right text-xs font-bold text-primary group-hover:underline">
                  {visit.nextActionLabel} →
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  status,
  query,
  visits,
  shellData,
  mobileNav,
}: {
  children: React.ReactNode;
  status: StatusFilter;
  query: string;
  visits: ForgeSiteVisitSummary[];
  shellData: ForgeShellData;
  mobileNav: MobileNavConfig;
}) {
  return (
    <SiteVisitsShell shellData={shellData} mobileNav={mobileNav}>
    <ForgePage className="gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Site Visits</h1>
            <p className="text-sm text-muted-foreground">
              Manage scheduled inspections and continue field workflows from real site-visit records.
            </p>
          </div>
          <Link
            href="/requests"
            title="Create site visits from request triage."
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New visit
          </Link>
        </div>

        <form action="/site-visits" className="relative">
          <input type="hidden" name="status" value={status} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by visit, customer, address, or service…"
            aria-label="Search site visits"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Site visit filters">
          {STATUS_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/site-visits?status=${filter.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
              className={[
                'inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                status === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {filter.label}
              <span className={status === filter.value ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>
                {filter.value === 'all' ? visits.length : visits.filter((visit) => visit.statusLabel.toLowerCase().includes(statusLabelFragment(filter.value))).length}
              </span>
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </ForgePage>
    </SiteVisitsShell>
  );
}

function statusLabelFragment(value: StatusFilter): string {
  if (value === 'awaiting_scheduling') return 'awaiting';
  if (value === 'in_progress') return 'progress';
  return value;
}

function EmptyState({ query }: { query: string }) {
  return (
    <ForgeCard className="grid min-h-[30vh] place-items-center px-4 text-center">
      <div>
        {query ? (
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        )}
        <h2 className="mt-3 text-lg font-bold">
          {query ? 'No site visits found' : 'No site visits yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? 'Try another search or filter.' : 'Site visits are created from request triage.'}
        </p>
      </div>
    </ForgeCard>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

function filterVisits(
  visits: ForgeSiteVisitSummary[],
  query: string
): ForgeSiteVisitSummary[] {
  if (!query) return visits;
  const normalized = query.toLowerCase();
  return visits.filter((visit) =>
    [visit.visitNumber, visit.title, visit.customerName, visit.propertyAddress]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized))
  );
}

function readStatusParam(value: string | string[] | undefined): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.some((filter) => filter.value === raw) ? (raw as StatusFilter) : 'all';
}

function readStringParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}
