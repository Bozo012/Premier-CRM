import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listRequests, type RequestListItem } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

interface RequestsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ShowFilter = 'open' | 'done' | 'all';

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

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell show={show}>
        <ErrorPanel>
          Could not load your organization membership: {membershipError.message}
        </ErrorPanel>
      </PageShell>
    );
  }

  if (!membership?.org_id) {
    return (
      <PageShell show={show}>
        <WarningPanel>
          You don&apos;t have an active organization membership yet.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await listRequests(supabase, {
    orgId: membership.org_id,
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

  // When showing 'open' filter, still exclude done/cancelled from count text.
  const { requests, total } = result.data;

  // For the 'open' tab, requests were already filtered server-side.
  // For 'all', include everything. For 'done', showDone=true but we want
  // to only display done/cancelled rows.
  const displayed =
    show === 'done'
      ? requests.filter((r) => r.status === 'done' || r.status === 'cancelled')
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
  // Extract the service line from the description block built by
  // buildTaskDescription: "Service: {service_needed}" appears near the top.
  const serviceLine = extractServiceLine(item.description);

  return (
    <li>
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-foreground">{item.title}</p>
            {serviceLine ? (
              <p className="text-sm text-muted-foreground">{serviceLine}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <StatusBadge status={item.status} />
            {item.priority !== 'normal' ? (
              <PriorityBadge priority={item.priority} />
            ) : null}
            {item.jobId ? (
              <Link
                href={`/jobs/${item.jobId}`}
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
    open: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-blue-50 text-blue-700',
    done: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500',
    snoozed: 'bg-purple-50 text-purple-700',
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

function WarningPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pull the "Service: {value}" line out of the structured description block
 * that buildTaskDescription writes. Returns null if the line isn't present.
 */
function extractServiceLine(description: string | null): string | null {
  if (!description) return null;
  for (const line of description.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Service:')) {
      const value = trimmed.slice('Service:'.length).trim();
      return value || null;
    }
  }
  return null;
}

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
