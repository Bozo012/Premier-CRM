import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ChevronRight, Receipt, Search, SearchX } from 'lucide-react';

import { getActiveOrgContext, listInvoices } from '@premier/db';
import { InvoiceStatusSchema, type InvoiceStatus } from '@premier/shared';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { NewInvoiceDialog } from './_components/new-invoice-dialog';
import {
  formatMoney,
  invoiceOutstandingTotal,
  invoicePaidTotal,
  toForgeInvoiceSummary,
  type ForgeInvoiceSummary,
} from './_lib/forge-invoice-view-model';

export const metadata: Metadata = { title: 'Invoices' };

const STATUS_FILTERS: Array<{ label: string; value?: InvoiceStatus }> = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Viewed', value: 'viewed' },
  { label: 'Partially paid', value: 'partially_paid' },
  { label: 'Paid', value: 'paid' },
  { label: 'Void', value: 'void' },
  { label: 'Refunded', value: 'refunded' },
];

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

  const result = await listInvoices(supabase, {
    limit: 100,
    offset: 0,
    orgId: orgContextResult.data.orgId,
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

  const invoices = result.data.invoices.map((invoice) => toForgeInvoiceSummary(invoice));

  return (
    <PageShell
      outstandingLabel={formatMoney(invoiceOutstandingTotal(result.data.invoices))}
      paidLabel={formatMoney(invoicePaidTotal(result.data.invoices))}
      search={search}
      status={status}
      total={result.data.total}
    >
      <p className="text-sm font-medium text-muted-foreground">
        {formatTotal(result.data.total, search, status)}
      </p>

      {invoices.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <>
          <InvoicesTable invoices={invoices} />
          <div className="grid gap-3 lg:hidden">
            {invoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  outstandingLabel = '$0.00',
  paidLabel = '$0.00',
  search = '',
  status,
  total = 0,
}: {
  children: React.ReactNode;
  outstandingLabel?: string;
  paidLabel?: string;
  search?: string;
  status?: InvoiceStatus;
  total?: number;
}) {
  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Invoices</h1>
            <p className="text-sm text-muted-foreground">
              Track issued bills, payment statuses, and transaction history.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <NewInvoiceDialog />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ForgeCard>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{outstandingLabel}</div>
          </ForgeCard>
          <ForgeCard>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Paid</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{paidLabel}</div>
          </ForgeCard>
        </div>

        <form action="/invoices" className="relative">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label="Search invoices"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={search}
            name="q"
            placeholder="Search by invoice number, customer, or job…"
            type="search"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter invoices">
          {STATUS_FILTERS.map((filter) => {
            const active = status === filter.value || (!status && !filter.value);
            return (
              <Link
                key={filter.label}
                href={`/invoices${buildQuery({ q: search, status: filter.value })}`}
                className={[
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                {filter.label}
                {active ? (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">{total}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </ForgePage>
  );
}

function InvoicesTable({ invoices }: { invoices: ForgeInvoiceSummary[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr className="text-muted-foreground">
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Invoice</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Customer</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Amount</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Due</th>
            <th className="px-5 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="transition hover:bg-muted/30">
              <td className="px-5 py-4">
                <Link href={`/invoices/${invoice.id}`} className="group flex items-center gap-2 font-bold text-foreground">
                  <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="group-hover:underline">{invoice.number}</span>
                </Link>
                <div className="mt-0.5 text-xs text-muted-foreground">{invoice.originLabel}</div>
              </td>
              <td className="px-5 py-4">
                <div className="font-medium text-foreground">{invoice.customerName}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{invoice.propertyName}</div>
              </td>
              <td className="px-5 py-4">
                <div className="font-bold text-foreground">{invoice.amountLabel}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Due {invoice.amountDueLabel}</div>
              </td>
              <td className="px-5 py-4"><ForgeStatusPill tone={invoice.statusTone}>{invoice.statusLabel}</ForgeStatusPill></td>
              <td className="px-5 py-4 text-xs text-muted-foreground">{invoice.dueLabel}</td>
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

function InvoiceCard({ invoice }: { invoice: ForgeInvoiceSummary }) {
  const overdue = invoice.statusLabel === 'Overdue';
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-foreground">{invoice.number}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {invoice.customerName} · {invoice.propertyName}
          </div>
        </div>
        <ForgeStatusPill tone={invoice.statusTone}>{invoice.statusLabel}</ForgeStatusPill>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-lg font-bold text-foreground">{invoice.amountLabel}</span>
        {overdue ? (
          <span className="flex items-center gap-1 text-xs font-bold text-red-600">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Overdue
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Due {invoice.dueLabel}</span>
        )}
      </div>
    </Link>
  );
}

function EmptyState({ search, status }: { search?: string; status?: InvoiceStatus }) {
  return (
    <ForgeCard className="grid min-h-[40vh] place-items-center px-4 text-center">
      <div>
        <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">
          {search || status ? 'No invoices found' : 'No invoices yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {search || status ? 'Try adjusting your search or filters.' : 'Create an invoice from a completed job.'}
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

function formatTotal(total: number, search: string | undefined, status: InvoiceStatus | undefined): string {
  const noun = total === 1 ? 'invoice' : 'invoices';
  if (search || status) return `${total} ${noun} match the filter`;
  return `${total} ${noun} total`;
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

function buildQuery(params: { q?: string; status?: InvoiceStatus }): string {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}
