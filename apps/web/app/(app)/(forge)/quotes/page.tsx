import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, FileSignature, Plus, Search, SearchX } from 'lucide-react';

import { getActiveOrgContext, listQuotes } from '@premier/db';
import { QuoteStatusSchema, type QuoteStatus } from '@premier/shared';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import type { ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { NewQuoteDialog } from './_components/new-quote-dialog';
import { QuotesShell } from './_components/quotes-shell';
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { toForgeQuoteSummary, type ForgeQuoteSummary } from './_lib/forge-quote-view-model';

export const metadata: Metadata = { title: 'Quotes' };

const STATUS_FILTERS: Array<{ label: string; value?: QuoteStatus }> = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Viewed', value: 'viewed' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Declined', value: 'declined' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revised', value: 'revised' },
];

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

  const result = await listQuotes(supabase, {
    limit: 100,
    offset: 0,
    orgId: orgContextResult.data.orgId,
    search,
    status,
  });

  if (!result.success) {
    return (
      <PageShell search={search} status={status} shellData={shellData} mobileNav={mobileNav}>
        <ErrorPanel>Failed to load quotes: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const quotes = result.data.quotes.map((quote) => toForgeQuoteSummary(quote));

  return (
    <PageShell search={search} status={status} total={result.data.total} shellData={shellData} mobileNav={mobileNav}>
      <p className="text-sm font-medium text-muted-foreground">
        {formatTotal(result.data.total, search, status)}
      </p>

      {quotes.length === 0 ? (
        <EmptyState search={search} status={status} />
      ) : (
        <>
          <QuotesTable quotes={quotes} />
          <div className="grid gap-3 lg:hidden">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  search = '',
  status,
  total = 0,
  shellData,
  mobileNav,
}: {
  children: React.ReactNode;
  search?: string;
  status?: QuoteStatus;
  total?: number;
  shellData: ForgeShellData;
  mobileNav: MobileNavConfig;
}) {
  return (
    <QuotesShell shellData={shellData} mobileNav={mobileNav}>
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Quotes</h1>
            <p className="text-sm text-muted-foreground">
              Track proposals sent to customers and their approval status.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/quotes/new"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New quote
            </Link>
            <NewQuoteDialog />
          </div>
        </div>

        <form action="/quotes" className="relative">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label="Search quotes"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={search}
            name="q"
            placeholder="Search by quote number, customer, or job…"
            type="search"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter quotes">
          {STATUS_FILTERS.map((filter) => {
            const active = status === filter.value || (!status && !filter.value);
            const href = `/quotes${buildQuery({ q: search, status: filter.value })}`;
            return (
              <Link
                key={filter.label}
                href={href}
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
    </QuotesShell>
  );
}

function QuotesTable({ quotes }: { quotes: ForgeQuoteSummary[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr className="text-muted-foreground">
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Quote</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Customer</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Amount</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Expires</th>
            <th className="px-5 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {quotes.map((quote) => (
            <tr key={quote.id} className="transition hover:bg-muted/30">
              <td className="px-5 py-4">
                <Link href={`/quotes/${quote.id}`} className="group flex items-center gap-2 font-bold text-foreground">
                  <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="group-hover:underline">{quote.number}</span>
                </Link>
                <div className="mt-0.5 text-xs text-muted-foreground">{quote.originLabel}</div>
              </td>
              <td className="px-5 py-4">
                <div className="font-medium text-foreground">{quote.customerName}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{quote.propertyName}</div>
              </td>
              <td className="px-5 py-4 font-bold text-foreground">{quote.amountLabel}</td>
              <td className="px-5 py-4"><ForgeStatusPill tone={quote.statusTone}>{quote.statusLabel}</ForgeStatusPill></td>
              <td className="px-5 py-4 text-xs text-muted-foreground">{quote.expiresLabel}</td>
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

function QuoteCard({ quote }: { quote: ForgeQuoteSummary }) {
  return (
    <Link
      href={`/quotes/${quote.id}`}
      className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-foreground">{quote.number}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {quote.customerName} · {quote.propertyName}
          </div>
        </div>
        <ForgeStatusPill tone={quote.statusTone}>{quote.statusLabel}</ForgeStatusPill>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-lg font-bold text-foreground">{quote.amountLabel}</span>
        <span className="text-xs font-bold text-primary">{quote.nextActionLabel} →</span>
      </div>
    </Link>
  );
}

function EmptyState({ search, status }: { search?: string; status?: QuoteStatus }) {
  return (
    <ForgeCard className="grid min-h-[40vh] place-items-center px-4 text-center">
      <div>
        <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">
          {search || status ? 'No quotes found' : 'No quotes yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {search || status ? 'Try adjusting your search or filters.' : 'Create a quote from an approved estimate or job.'}
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

function formatTotal(total: number, search: string | undefined, status: QuoteStatus | undefined): string {
  const noun = total === 1 ? 'quote' : 'quotes';
  if (search || status) return `${total} ${noun} match the filter`;
  return `${total} ${noun} total`;
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  return raw.trim();
}

function readStatusParam(value: string | string[] | undefined): QuoteStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = QuoteStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function buildQuery(params: { q?: string; status?: QuoteStatus }): string {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}
