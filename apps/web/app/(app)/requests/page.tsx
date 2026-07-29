import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, listRequests, type RequestListItem } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getRequestIntakePath, getRequestIntakePathLabel } from '@/lib/request-intake-flow';
import { getServerSupabase } from '@/lib/supabase-server';

interface RequestsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ShowFilter = 'open' | 'done' | 'all';
const REVIEWED_STATUSES = new Set([
  'reviewing',
  'estimate_created',
  'approved',
  'scheduled',
  'completed',
  'cancelled',
]);

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const params = await searchParams;
  const show = readShowParam(params.show);

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
      <PageShell show={show}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }
  const { orgId } = orgContextResult.data;

  const result = await listRequests(supabase, {
    orgId,
    limit: 100,
    offset: 0,
    showDone: show === 'done' || show === 'all',
  });

  if (!result.success) {
    return (
      <PageShell show={show}>
        <ErrorPanel>Failed to load requests: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { requests, total } = result.data;

  // For the 'open' tab, requests were already filtered server-side (status='new').
  // For 'all', include everything. For 'done', showDone=true but we only
  // display the reviewed / converted workflow states.
  const displayed =
    show === 'done'
      ? requests.filter((r) => REVIEWED_STATUSES.has(r.status))
      : requests;

  return (
    <PageShell show={show}>
      <p className="text-sm text-muted-foreground">
        {formatTotal(show === 'done' ? displayed.length : total, show)}
      </p>

      {displayed.length === 0 ? (
        <EmptyState show={show} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {displayed.map((item) => (
            <RequestRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function RequestRow({ item }: { item: RequestListItem }) {
  const intakePathLabel = getRequestIntakePathLabel(
    getRequestIntakePath({ estimateId: item.estimateId, jobId: item.jobId })
  );

  return (
    <li>
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <Link
              href={`/requests/${item.id}`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
            {item.serviceLine ? (
              <p className="text-sm text-muted-foreground">{item.serviceLine}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <StatusBadge status={item.status} />
            {item.priority !== 'normal' ? (
              <PriorityBadge priority={item.priority} />
            ) : null}
            {item.estimateId ? (
              <Link
                href={`/estimates/${item.estimateId}`}
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Estimate created
              </Link>
            ) : item.jobId ? (
              <Link
                href={`/jobs/${item.jobId}`}
                className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                Job created
              </Link>
            ) : null}
            {intakePathLabel ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {intakePathLabel}
              </span>
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
          {item.customer?.phonePrimary ? (
            <p>
              <span className="font-medium text-foreground">Phone:</span>{' '}
              {item.customer.phonePrimary}
            </p>
          ) : null}
          {item.customer?.email ? (
            <p>
              <span className="font-medium text-foreground">Email:</span>{' '}
              {item.customer.email}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Received {formatDateTime(item.createdAt)}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const SHOW_FILTERS: Array<{ label: string; value: ShowFilter }> = [
  { label: 'Open', value: 'open' },
  { label: 'Reviewed', value: 'done' },
  { label: 'All', value: 'all' },
];

function PageShell({
  children,
  show,
}: {
  children: React.ReactNode;
  show: ShowFilter;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Inbound inquiries from the website and other sources.
          </p>
        </div>

        <nav className="flex gap-1">
          {SHOW_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/requests?show=${filter.value}`}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                show === filter.value
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

function EmptyState({ show }: { show: ShowFilter }) {
  if (show === 'done') {
    return (
      <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No reviewed requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">No open requests</p>
      <p className="text-sm text-muted-foreground">
        New inquiries from your website form appear here automatically.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new: 'bg-amber-50 text-amber-700',
    reviewing: 'bg-blue-50 text-blue-700',
    estimate_created: 'bg-indigo-50 text-indigo-700',
    approved: 'bg-green-50 text-green-700',
    scheduled: 'bg-indigo-50 text-indigo-700',
    in_progress: 'bg-blue-50 text-blue-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500',
    spam: 'bg-red-50 text-red-600',
  };
  const color = colorMap[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {formatEnumLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    high: 'bg-orange-50 text-orange-700',
    urgent: 'bg-red-50 text-red-700',
    low: 'bg-slate-100 text-slate-500',
  };
  const color = colorMap[priority] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {formatEnumLabel(priority)}
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTotal(count: number, show: ShowFilter): string {
  const noun = count === 1 ? 'request' : 'requests';
  if (show === 'open') return `${count} open ${noun}`;
  if (show === 'done') return `${count} reviewed ${noun}`;
  return `${count} ${noun} total`;
}

function readShowParam(
  value: string | string[] | undefined
): ShowFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'done' || raw === 'all') return raw;
  return 'open';
}
