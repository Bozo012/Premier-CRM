import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, listEstimates, type EstimateListItem, type EstimateStatus } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

interface EstimatesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ViewFilter = 'active' | 'all';

const ACTIVE_STATUSES: EstimateStatus[] = [
  'draft',
  'site_visit_scheduled',
  'site_visit_complete',
  'quoted',
];

export default async function EstimatesPage({ searchParams }: EstimatesPageProps) {
  const params = await searchParams;
  const view = readViewParam(params.view);

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
      <PageShell view={view}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }
  const { orgId } = orgContextResult.data;

  const result = await listEstimates(supabase, {
    orgId,
    statuses: view === 'active' ? ACTIVE_STATUSES : undefined,
    limit: 100,
    offset: 0,
  });

  if (!result.success) {
    return (
      <PageShell view={view}>
        <ErrorPanel>Failed to load estimates: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { estimates, total } = result.data;

  return (
    <PageShell view={view}>
      <p className="text-sm text-muted-foreground">
        {formatTotal(total, view)}
      </p>

      {estimates.length === 0 ? (
        <EmptyState view={view} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {estimates.map((item) => (
            <EstimateRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function EstimateRow({ item }: { item: EstimateListItem }) {
  const address = item.property
    ? `${item.property.addressLine1}, ${item.property.city}, ${item.property.state} ${item.property.zip}`
    : null;

  return (
    <li>
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {item.estimateNumber}
              </span>
              <StatusBadge status={item.status} />
            </div>
            <Link
              href={`/estimates/${item.id}`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            {item.serviceRequestId ? (
              <Link
                href={`/requests/${item.serviceRequestId}`}
                className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                From request
              </Link>
            ) : null}
            {item.convertedJobId ? (
              <Link
                href={`/jobs/${item.convertedJobId}`}
                className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                Job created
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
          {item.customer ? (
            <p>
              <span className="font-medium text-foreground">Customer:</span>{' '}
              <Link
                href={`/customers/${item.customer.id}`}
                className="underline-offset-2 hover:underline"
              >
                {item.customer.displayName}
              </Link>
            </p>
          ) : null}
          {address ? (
            <p className="sm:col-span-2">
              <span className="font-medium text-foreground">Property:</span>{' '}
              {address}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Created {formatDate(item.createdAt)}</span>
          {item.siteVisitAt ? (
            <span>Site visit {formatDate(item.siteVisitAt)}</span>
          ) : null}
          {item.expiresAt ? (
            <span>Expires {formatDate(item.expiresAt)}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const VIEW_FILTERS: Array<{ label: string; value: ViewFilter }> = [
  { label: 'Active', value: 'active' },
  { label: 'All', value: 'all' },
];

function PageShell({
  children,
  view,
}: {
  children: React.ReactNode;
  view: ViewFilter;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Estimates
            </h1>
            <p className="text-sm text-muted-foreground">
              Site visits, scoped work, and quoted proposals.
            </p>
          </div>
          <Link
            href="/estimates/new"
            className="inline-flex shrink-0 items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            New estimate
          </Link>
        </div>

        <nav className="flex gap-1">
          {VIEW_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/estimates?view=${filter.value}`}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === filter.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      </header>

      {children}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ view }: { view: ViewFilter }) {
  if (view === 'all') {
    return (
      <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No estimates yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">No active estimates</p>
      <p className="text-sm text-muted-foreground">
        Convert a request to create an estimate, or{' '}
        <Link href="/estimates/new" className="font-medium text-foreground underline-offset-2 hover:underline">
          create one manually
        </Link>
        .
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const colorMap: Record<EstimateStatus, string> = {
    draft: 'bg-slate-100 text-slate-600',
    site_visit_scheduled: 'bg-blue-50 text-blue-700',
    site_visit_complete: 'bg-indigo-50 text-indigo-700',
    quoted: 'bg-purple-50 text-purple-700',
    accepted: 'bg-green-50 text-green-700',
    declined: 'bg-red-50 text-red-700',
    expired: 'bg-slate-100 text-slate-500',
    converted: 'bg-emerald-50 text-emerald-700',
  };
  const color = colorMap[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {formatEnumLabel(status)}
    </span>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTotal(count: number, view: ViewFilter): string {
  const noun = count === 1 ? 'estimate' : 'estimates';
  if (view === 'active') return `${count} active ${noun}`;
  return `${count} ${noun} total`;
}

function readViewParam(value: string | string[] | undefined): ViewFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'all') return 'all';
  return 'active';
}
