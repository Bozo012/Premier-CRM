import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listJobs } from '@premier/db';
import { JobStatusSchema, type JobStatus } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getServerSupabase } from '@/lib/supabase-server';

const STATUS_FILTERS: Array<{ label: string; value?: JobStatus }> = [
  { label: 'All jobs' },
  { label: 'Approved', value: 'approved' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Invoiced', value: 'invoiced' },
  { label: 'Paid', value: 'paid' },
  { label: 'On hold', value: 'on_hold' },
  { label: 'Cancelled', value: 'cancelled' },
] as const;

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;

  // Legacy bridge-model route — redirect to the real estimates workspace.
  if (readStringParam(params.view) === 'estimates') {
    redirect('/estimates');
  }

  const search = readStringParam(params.q);
  const status = readStatusParam(params.status);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/jobs');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell search={search} status={status}>
        <ErrorPanel>
          Could not load your organization membership: {membershipError.message}
        </ErrorPanel>
      </PageShell>
    );
  }

  if (!membership?.org_id) {
    return (
      <PageShell search={search} status={status}>
        <WarningPanel>
          You don&apos;t have an active organization membership yet. Ask the owner
          to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await listJobs(supabase, {
    limit: 100,
    offset: 0,
    orgId: membership.org_id,
    search,
    status,
  });

  if (!result.success) {
    return (
      <PageShell search={search} status={status}>
        <ErrorPanel>Failed to load jobs: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { jobs, total } = result.data;

  return (
    <PageShell search={search} status={status}>
      <p className="text-sm text-muted-foreground">
        {formatTotal(total, search, status)}
      </p>

      {jobs.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {jobs.map((item) => (
            <li key={item.job.id}>
              <Link
                href={`/jobs/${item.job.id}`}
                className="block space-y-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium text-foreground">
                    {item.job.title.trim() || item.job.job_number || 'Untitled job'}
                  </p>
                  <StatusBadge status={item.job.status} />
                  <PriorityBadge priority={item.job.priority} />
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">Next scheduled:</span>{' '}
                    {formatScheduledAt(item.nextScheduledAt)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Customer:</span>{' '}
                    {item.customer?.displayName || 'Unknown customer'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Property:</span>{' '}
                    {item.property ? formatPropertyAddress(item.property) : 'Unknown property'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Job #:</span>{' '}
                    {item.job.job_number || 'Not assigned'}
                  </p>
                </div>

                {item.category ? (
                  <p className="text-sm text-muted-foreground">
                    Service category: {item.category.name}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  search = '',
  status,
}: {
  children: React.ReactNode;
  search?: string;
  status?: JobStatus;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Review active work, schedule visibility, and linked customer/property context.
          </p>
        </div>

        <form action="/jobs" className="flex flex-col gap-2 lg:flex-row">
          <Input
            defaultValue={search}
            name="q"
            placeholder="Search by title, description, or job number..."
          />
          <select
            defaultValue={status ?? ''}
            name="status"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:max-w-56"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.label} value={filter.value ?? ''}>
                {filter.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </header>

      {children}
    </main>
  );
}

function EmptyState({
  search,
  status,
}: {
  search?: string;
  status?: JobStatus;
}) {
  if (search || status) {
    return (
      <div className="space-y-3 rounded-md border bg-background px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No jobs match the current search and filter.
        </p>
        <Button asChild variant="outline">
          <Link href="/jobs">Clear filters</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      No jobs yet. Jobs are created when a quote is accepted and approved.
    </div>
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

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      {formatEnumLabel(status)}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: 'emergency' | 'high' | 'low' | 'normal';
}) {
  const classes =
    priority === 'emergency'
      ? 'bg-red-50 text-red-700'
      : priority === 'high'
        ? 'bg-amber-50 text-amber-700'
        : priority === 'low'
          ? 'bg-slate-100 text-slate-700'
          : 'bg-muted text-muted-foreground';

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {formatEnumLabel(priority)}
    </span>
  );
}

function readStringParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200
    ? trimmed
    : undefined;
}

function readStatusParam(
  value: string | string[] | undefined
): JobStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = JobStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function formatPropertyAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [property.addressLine1, property.addressLine2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(', ');
}

function formatScheduledAt(value: string | null) {
  if (!value) return 'Unscheduled';

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTotal(total: number, search?: string, status?: JobStatus) {
  if (total === 0) {
    return search || status ? '' : '';
  }

  const noun = total === 1 ? 'job' : 'jobs';

  if (search || status) {
    return `${total} ${noun} matching the current filters`;
  }

  return `${total} ${noun}`;
}
