import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calculator, ChevronRight, Plus, Search, SearchX } from 'lucide-react';

import { getActiveOrgContext, listEstimates, type EstimateStatus } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import type { ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { EstimatesShell } from './_components/estimates-shell';
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import {
  toForgeEstimateSummary,
  type ForgeEstimateFilter,
  type ForgeEstimateSummary,
} from './_lib/forge-estimate-view-model';

export const metadata: Metadata = { title: 'Estimates' };

interface EstimatesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ACTIVE_STATUSES: EstimateStatus[] = [
  'draft',
  'site_visit_scheduled',
  'site_visit_complete',
  'quoted',
];

const VIEW_FILTERS: Array<{ label: string; value: ForgeEstimateFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'All', value: 'all' },
];

export default async function EstimatesPage({ searchParams }: EstimatesPageProps) {
  const params = await searchParams;
  const view = readViewParam(params.view);
  const query = readStringParam(params.q);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/estimates');
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

  const result = await listEstimates(supabase, {
    orgId: orgContextResult.data.orgId,
    statuses: view === 'active' ? ACTIVE_STATUSES : undefined,
    limit: 100,
    offset: 0,
  });

  if (!result.success) {
    return (
      <PageShell query={query} view={view} shellData={shellData} mobileNav={mobileNav}>
        <ErrorPanel>Failed to load estimates: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const summaries = filterEstimates(
    result.data.estimates.map((estimate) => toForgeEstimateSummary(estimate)),
    query
  );

  return (
    <PageShell query={query} total={result.data.total} view={view} shellData={shellData} mobileNav={mobileNav}>
      <p className="text-sm font-medium text-muted-foreground">
        {formatTotal(summaries.length, view, query)}
      </p>

      {summaries.length === 0 ? (
        <EmptyState query={query} view={view} />
      ) : (
        <>
          <EstimatesTable estimates={summaries} />
          <div className="grid gap-3 lg:hidden">
            {summaries.map((estimate) => (
              <EstimateCard key={estimate.id} estimate={estimate} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  query,
  total = 0,
  view,
  shellData,
  mobileNav,
}: {
  children: React.ReactNode;
  query: string;
  total?: number;
  view: ForgeEstimateFilter;
  shellData: ForgeShellData;
  mobileNav: MobileNavConfig;
}) {
  return (
    <EstimatesShell shellData={shellData} mobileNav={mobileNav}>
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Estimates</h1>
            <p className="text-sm text-muted-foreground">
              Track scope, pricing review, and quote readiness.
            </p>
          </div>
          <Link
            href="/estimates/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New estimate
          </Link>
        </div>

        <form action="/estimates" className="relative">
          <input type="hidden" name="view" value={view} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label="Search estimates"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={query}
            name="q"
            placeholder="Search by estimate number, customer, property, or status…"
            type="search"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter estimates">
          {VIEW_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/estimates?view=${filter.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
              className={[
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {filter.label}
              <span className={view === filter.value ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>
                {total}
              </span>
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </ForgePage>
    </EstimatesShell>
  );
}

function EstimatesTable({ estimates }: { estimates: ForgeEstimateSummary[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr className="text-muted-foreground">
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Estimate</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Customer</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Amount</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Updated</th>
            <th className="px-5 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {estimates.map((estimate) => (
            <tr key={estimate.id} className="transition hover:bg-muted/30">
              <td className="max-w-0 break-words px-5 py-4">
                <Link href={`/estimates/${estimate.id}`} className="group flex items-center gap-2 font-bold text-foreground">
                  <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="group-hover:underline">{estimate.number}</span>
                </Link>
                <div className="mt-0.5 text-xs text-muted-foreground">{estimate.title}</div>
              </td>
              <td className="max-w-0 break-words px-5 py-4">
                <div className="font-medium text-foreground">{estimate.customerName}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{estimate.propertyName}</div>
              </td>
              <td className="px-5 py-4 font-bold text-foreground">{estimate.amountLabel}</td>
              <td className="px-5 py-4">
                <div className="flex flex-col gap-1">
                  <ForgeStatusPill tone={estimate.statusTone}>{estimate.statusLabel}</ForgeStatusPill>
                  <span className="text-xs text-muted-foreground">{estimate.originLabel}</span>
                </div>
              </td>
              <td className="px-5 py-4 text-xs text-muted-foreground">{estimate.updatedLabel}</td>
              <td className="px-5 py-4 text-right">
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimateCard({ estimate }: { estimate: ForgeEstimateSummary }) {
  return (
    <Link
      href={`/estimates/${estimate.id}`}
      className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-foreground">{estimate.number}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {estimate.customerName} · {estimate.propertyName}
          </div>
        </div>
        <ForgeStatusPill tone={estimate.statusTone}>{estimate.statusLabel}</ForgeStatusPill>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-lg font-bold text-foreground">{estimate.amountLabel}</span>
        <span className="text-xs font-bold text-primary">{estimate.nextActionLabel} →</span>
      </div>
    </Link>
  );
}

function EmptyState({ query, view }: { query: string; view: ForgeEstimateFilter }) {
  return (
    <ForgeCard className="grid min-h-[40vh] place-items-center px-4 text-center">
      <div>
        <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">
          {query ? 'No estimates found' : view === 'active' ? 'No active estimates' : 'No estimates yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? 'Try adjusting your search or filters.' : 'Create one manually or convert a request into an estimate.'}
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

function filterEstimates(estimates: ForgeEstimateSummary[], query: string): ForgeEstimateSummary[] {
  if (!query) return estimates;
  const normalized = query.toLowerCase();
  return estimates.filter((estimate) =>
    [
      estimate.number,
      estimate.title,
      estimate.customerName,
      estimate.propertyName,
      estimate.propertyAddress,
      estimate.statusLabel,
      estimate.originLabel,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized))
  );
}

function formatTotal(count: number, view: ForgeEstimateFilter, query: string): string {
  const noun = count === 1 ? 'estimate' : 'estimates';
  if (query) return `${count} ${noun} match the search`;
  if (view === 'active') return `${count} active ${noun}`;
  return `${count} ${noun} total`;
}

function readViewParam(value: string | string[] | undefined): ForgeEstimateFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'all') return 'all';
  return 'active';
}

function readStringParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}
