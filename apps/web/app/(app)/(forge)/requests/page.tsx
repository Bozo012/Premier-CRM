import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Inbox, Plus, Search } from 'lucide-react';

import { getActiveOrgContext, listRequests } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getRequestIntakePath, getRequestIntakePathLabel } from '@/lib/request-intake-flow';
import { getServerSupabase } from '@/lib/supabase-server';

import type { ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { toForgeRequestSummary, type ForgeRequestFilter } from './_lib/forge-request-view-model';
import { RequestsShell } from './_components/requests-shell';

export const metadata: Metadata = { title: 'Requests' };

interface RequestsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const REVIEWED_STATUSES = new Set([
  'reviewing',
  'estimate_created',
  'approved',
  'scheduled',
  'completed',
  'cancelled',
]);

const SHOW_FILTERS: Array<{ label: string; value: ForgeRequestFilter }> = [
  { label: 'Open', value: 'open' },
  { label: 'Reviewed', value: 'done' },
  { label: 'All', value: 'all' },
];

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const params = await searchParams;
  const show = readShowParam(params.show);
  const query = readStringParam(params.q);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/requests');
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

  const result = await listRequests(supabase, {
    orgId: orgContextResult.data.orgId,
    limit: 100,
    offset: 0,
    showDone: show === 'done' || show === 'all',
  });

  if (!result.success) {
    return (
      <PageShell show={show} query={query} shellData={shellData} mobileNav={mobileNav}>
        <ErrorPanel>Failed to load requests: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const baseRequests =
    show === 'done'
      ? result.data.requests.filter((request) => REVIEWED_STATUSES.has(request.status))
      : result.data.requests;

  const displayed = filterRequests(baseRequests.map((request) => toForgeRequestSummary(request)), query);

  return (
    <PageShell show={show} query={query} shellData={shellData} mobileNav={mobileNav}>
      <p className="text-sm font-medium text-muted-foreground">
        {formatTotal(displayed.length, show)}
      </p>

      {displayed.length === 0 ? (
        <EmptyState query={query} show={show} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayed.map((request) => {
            const intakePathLabel = getRequestIntakePathLabel(
              getRequestIntakePath({
                estimateId: request.relatedHref?.startsWith('/estimates/') ? request.relatedHref.split('/').at(-1) ?? null : null,
                jobId: request.relatedHref?.startsWith('/jobs/') ? request.relatedHref.split('/').at(-1) ?? null : null,
              })
            );

            return (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className="group rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{request.number}</span>
                  <ForgeStatusPill tone={request.statusTone}>{request.statusLabel}</ForgeStatusPill>
                </div>
                <p className="mt-2 text-sm font-bold leading-snug">{request.description}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {request.customerName}
                  {request.serviceLine ? ` · ${request.serviceLine}` : ''}
                </p>
                {request.contactLine ? (
                  <p className="mt-1 text-xs text-muted-foreground">{request.contactLine}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {request.ageLabel}
                    </span>
                    {request.priorityLabel ? (
                      <ForgeStatusPill tone={request.priorityTone}>{request.priorityLabel}</ForgeStatusPill>
                    ) : null}
                    {intakePathLabel ? <span>{intakePathLabel}</span> : null}
                  </div>
                  {request.nextActionLabel ? (
                    <span className="shrink-0 text-xs font-bold text-primary group-hover:underline">
                      {request.nextActionLabel} →
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  show,
  query,
  shellData,
  mobileNav,
}: {
  children: React.ReactNode;
  show: ForgeRequestFilter;
  query: string;
  shellData: ForgeShellData;
  mobileNav: MobileNavConfig;
}) {
  return (
    <RequestsShell shellData={shellData} mobileNav={mobileNav}>
    <ForgePage className="gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Requests</h1>
            <p className="text-sm text-muted-foreground">
              Triage inbound work and hand it off to estimates, site visits, or approved work orders.
            </p>
          </div>
          <Link
            href="/requests/new"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New request
          </Link>
        </div>

        <form action="/requests" className="relative">
          <input type="hidden" name="show" value={show} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by number, customer, service, or concern…"
            aria-label="Search requests"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Request filters">
          {SHOW_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/requests?show=${filter.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
              className={[
                'inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                show === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </ForgePage>
    </RequestsShell>
  );
}

function EmptyState({ query, show }: { query: string; show: ForgeRequestFilter }) {
  return (
    <ForgeCard className="grid min-h-[30vh] place-items-center px-4 text-center">
      <div>
        <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">
          {query ? 'No requests found' : show === 'done' ? 'No reviewed requests yet' : 'No open requests'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? 'Try another search or filter.' : 'New service requests appear here when they arrive.'}
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

function filterRequests<T extends { number: string; title: string; customerName: string; description: string; serviceLine: string | null }>(
  requests: T[],
  query: string
): T[] {
  if (!query) return requests;
  const normalized = query.toLowerCase();
  return requests.filter((request) =>
    [request.number, request.title, request.customerName, request.description, request.serviceLine]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized))
  );
}

function formatTotal(count: number, show: ForgeRequestFilter): string {
  const noun = count === 1 ? 'request' : 'requests';
  if (show === 'open') return `${count} open ${noun}`;
  if (show === 'done') return `${count} reviewed ${noun}`;
  return `${count} ${noun} total`;
}

function readShowParam(value: string | string[] | undefined): ForgeRequestFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'done' || raw === 'all') return raw;
  return 'open';
}

function readStringParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}
