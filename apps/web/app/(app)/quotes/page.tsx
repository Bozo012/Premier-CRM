import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listQuotes, type QuoteListItem } from '@premier/db';
import { QuoteStatusSchema, type QuoteStatus } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getServerSupabase } from '@/lib/supabase-server';

const STATUS_FILTERS: Array<{ label: string; value?: QuoteStatus }> = [
  { label: 'All quotes' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Viewed', value: 'viewed' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Declined', value: 'declined' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revised', value: 'revised' },
] as const;

interface QuotesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const status = readStatusParam(params.status);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/quotes');
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
          You don&apos;t have an active organization membership yet. Ask the
          owner to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await listQuotes(supabase, {
    limit: 100,
    offset: 0,
    orgId: membership.org_id,
    search,
    status,
  });

  if (!result.success) {
    return (
      <PageShell search={search} status={status}>
        <ErrorPanel>Failed to load quotes: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { quotes, total } = result.data;

  return (
    <PageShell search={search} status={status}>
      <p className="text-sm text-muted-foreground">
        {formatTotal(total, search, status)}
      </p>

      {quotes.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {quotes.map((item) => (
            <li key={item.quote.id}>
              <Link
                href={`/quotes/${item.quote.id}`}
                className="block space-y-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium text-foreground">
                    {resolveQuoteTitle(item)}
                  </p>
                  <StatusBadge status={item.quote.status} />
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">Total:</span>{' '}
                    {formatMoney(item.quote.total)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Customer:
                    </span>{' '}
                    {item.customer?.displayName || 'Unknown customer'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Line items:
                    </span>{' '}
                    {item.lineItemCount}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Created:
                    </span>{' '}
                    {formatDate(item.quote.created_at)}
                  </p>
                </div>

                {item.quote.valid_until ? (
                  <p className="text-sm text-muted-foreground">
                    Valid until {formatDate(item.quote.valid_until)}
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

// ---------------------------------------------------------------------------
// Shell and sub-components
// ---------------------------------------------------------------------------

function PageShell({
  children,
  search = '',
  status,
}: {
  children: React.ReactNode;
  search?: string;
  status?: QuoteStatus;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Quotes
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse and manage quotes across all jobs.
          </p>
        </div>

        <form action="/quotes" className="flex flex-col gap-2 lg:flex-row">
          <Input
            defaultValue={search}
            name="q"
            placeholder="Search by title or quote number..."
          />
          <select
            defaultValue={status ?? ''}
            name="status"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:max-w-48"
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
  status?: QuoteStatus;
}) {
  if (search || status) {
    return (
      <div className="space-y-3 rounded-md border bg-background px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No quotes match the current search and filter.
        </p>
        <Button asChild variant="outline">
          <Link href="/quotes">Clear filters</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      No quotes yet. Create one from a job&apos;s detail page.
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    accepted: 'bg-green-50 text-green-700',
    declined: 'bg-red-50 text-red-700',
    draft: 'bg-slate-100 text-slate-600',
    expired: 'bg-orange-50 text-orange-700',
    revised: 'bg-blue-50 text-blue-700',
    sent: 'bg-violet-50 text-violet-700',
    viewed: 'bg-indigo-50 text-indigo-700',
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

function WarningPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Formatters and param readers
// ---------------------------------------------------------------------------

function resolveQuoteTitle(item: QuoteListItem): string {
  if (item.quote.title?.trim()) return item.quote.title.trim();
  if (item.quote.quote_number?.trim()) return item.quote.quote_number.trim();
  if (item.job.title.trim()) return `Quote for ${item.job.title.trim()}`;
  if (item.job.jobNumber) return `Quote for job ${item.job.jobNumber}`;
  return 'Untitled quote';
}

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatTotal(
  total: number,
  search: string | undefined,
  status: QuoteStatus | undefined
): string {
  if (search || status) {
    return `${total} quote${total === 1 ? '' : 's'} match the filter`;
  }
  return `${total} quote${total === 1 ? '' : 's'} total`;
}

function readStringParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  return raw.trim();
}

function readStatusParam(
  value: string | string[] | undefined
): QuoteStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = QuoteStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
