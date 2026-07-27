import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, listInvoices, type InvoiceListItem } from '@premier/db';
import { InvoiceStatusSchema, type InvoiceStatus } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { NewInvoiceDialog } from './_components/new-invoice-dialog';

const STATUS_FILTERS: Array<{ label: string; value?: InvoiceStatus }> = [
  { label: 'All invoices' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Viewed', value: 'viewed' },
  { label: 'Partially paid', value: 'partially_paid' },
  { label: 'Paid', value: 'paid' },
  { label: 'Void', value: 'void' },
  { label: 'Refunded', value: 'refunded' },
] as const;

interface InvoicesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const status = readStatusParam(params.status);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/invoices');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <PageShell search={search} status={status}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }
  const { orgId } = orgContextResult.data;

  const result = await listInvoices(supabase, {
    limit: 100,
    offset: 0,
    orgId,
    search,
    status,
  });

  if (!result.success) {
    return (
      <PageShell search={search} status={status}>
        <ErrorPanel>Failed to load invoices: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { invoices, total } = result.data;

  return (
    <PageShell search={search} status={status} newInvoiceSlot={<NewInvoiceDialog />}>
      <p className="text-sm text-muted-foreground">{formatTotal(total, search, status)}</p>

      {invoices.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {invoices.map((item) => (
            <li key={item.invoice.id}>
              <Link
                href={`/invoices/${item.invoice.id}`}
                className="block space-y-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium text-foreground">
                    {resolveInvoiceTitle(item)}
                  </p>
                  <StatusBadge status={item.invoice.status} />
                  {item.isOverdue ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      Overdue
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">Total:</span>{' '}
                    {formatMoney(item.invoice.total)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Amount due:</span>{' '}
                    {formatMoney(item.invoice.amount_due)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Customer:</span>{' '}
                    {item.customer?.displayName || 'Unknown customer'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Job:</span>{' '}
                    {item.job.title || item.job.jobNumber || 'Unknown job'}
                  </p>
                </div>

                {item.invoice.due_date ? (
                  <p className="text-sm text-muted-foreground">
                    Due {formatDate(item.invoice.due_date)}
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
  newInvoiceSlot,
  search = '',
  status,
}: {
  children: React.ReactNode;
  newInvoiceSlot?: React.ReactNode;
  search?: string;
  status?: InvoiceStatus;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Invoices</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage invoices across all jobs.
            </p>
          </div>
          {newInvoiceSlot}
        </div>

        <form action="/invoices" className="flex flex-col gap-2 lg:flex-row">
          <Input
            defaultValue={search}
            name="q"
            placeholder="Search by title or invoice number..."
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

function EmptyState({ search, status }: { search?: string; status?: InvoiceStatus }) {
  if (search || status) {
    return (
      <div className="space-y-3 rounded-md border bg-background px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No invoices match the current search and filter.
        </p>
        <Button asChild variant="outline">
          <Link href="/invoices">Clear filters</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      No invoices yet. Use the{' '}
      <strong className="font-medium text-foreground">Create invoice</strong> button above to
      get started.
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-violet-50 text-violet-700',
    viewed: 'bg-indigo-50 text-indigo-700',
    partially_paid: 'bg-amber-50 text-amber-700',
    paid: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
    void: 'bg-slate-100 text-slate-500',
    refunded: 'bg-orange-50 text-orange-700',
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
// Formatters and param readers
// ---------------------------------------------------------------------------

function resolveInvoiceTitle(item: InvoiceListItem): string {
  if (item.invoice.title?.trim()) return item.invoice.title.trim();
  if (item.invoice.invoice_number?.trim()) return item.invoice.invoice_number.trim();
  if (item.job.title.trim()) return `Invoice for ${item.job.title.trim()}`;
  if (item.job.jobNumber) return `Invoice for job ${item.job.jobNumber}`;
  return 'Untitled invoice';
}

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
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
  status: InvoiceStatus | undefined
): string {
  if (search || status) {
    return `${total} invoice${total === 1 ? '' : 's'} match the filter`;
  }
  return `${total} invoice${total === 1 ? '' : 's'} total`;
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  return raw.trim();
}

function readStatusParam(value: string | string[] | undefined): InvoiceStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = InvoiceStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
