import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ChevronRight, Paperclip, Plus, Search, SearchX, WalletCards } from 'lucide-react';

import { getActiveOrgContext, listExpenses } from '@premier/db';
import { ExpenseFilterSchema, type ExpenseFilter } from '@premier/shared';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import {
  buildExpenseFilterHref,
  toForgeExpenseSummary,
  toSummaryCards,
  type ForgeExpenseSummary,
} from './_lib/forge-expense-view-model';

export const metadata: Metadata = { title: 'Expenses' };

interface ExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const filter = readFilterParam(params.filter);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/expenses');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return (
      <PageShell activeFilter={filter} filters={[]} search={search} summary={[]}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }

  const result = await listExpenses(supabase, {
    filter,
    limit: 100,
    offset: 0,
    orgId: orgContextResult.data.orgId,
    search,
  });

  if (!result.success) {
    return (
      <PageShell activeFilter={filter} filters={[]} search={search} summary={[]}>
        <ErrorPanel>Failed to load expenses: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const expenses = result.data.expenses.map((item) => toForgeExpenseSummary(item));

  return (
    <PageShell
      activeFilter={filter}
      filters={result.data.filters}
      search={search}
      summary={toSummaryCards(result.data.summary)}
      total={result.data.total}
    >
      <p className="text-sm font-medium text-muted-foreground">
        {formatTotal(result.data.total, search, filter)}
      </p>

      {expenses.length === 0 ? (
        <EmptyState search={search} filter={filter} />
      ) : (
        <>
          <ExpensesTable expenses={expenses} />
          <div className="grid gap-3 lg:hidden">
            {expenses.map((expense) => (
              <ExpenseCard key={expense.id} expense={expense} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  activeFilter,
  children,
  filters,
  search,
  summary,
  total = 0,
}: {
  activeFilter: ExpenseFilter;
  children: React.ReactNode;
  filters: Array<{ count: number; id: ExpenseFilter; label: string }>;
  search: string;
  summary: Array<{ id: string; label: string; value: number; valueLabel: string }>;
  total?: number;
}) {
  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              Expenses track Premier&apos;s cost. Invoices track what the customer owes.
            </p>
          </div>
          <Button asChild className="min-h-11 rounded-xl font-bold">
            <Link href="/expenses/new">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New expense
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {summary.length === 0
            ? ['Pending review', 'Approved cost', 'Invoiced to customers'].map((label) => (
                <ForgeCard key={label}>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-bold text-foreground">$0.00</div>
                </ForgeCard>
              ))
            : summary.map((card) => (
                <ForgeCard key={card.id}>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.label}</div>
                  <div className="mt-1 text-xl font-bold text-foreground">{card.valueLabel}</div>
                </ForgeCard>
              ))}
        </div>

        <form action="/expenses" className="relative">
          {activeFilter !== 'all' ? <input type="hidden" name="filter" value={activeFilter} /> : null}
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label="Search expenses"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={search}
            name="q"
            placeholder="Search by description, vendor, job number, property, or amount…"
            type="search"
          />
        </form>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter expenses">
          {filters.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <Link
                key={filter.id}
                href={buildExpenseFilterHref(filter.id, search)}
                className={[
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                {filter.label}
                <span className={active ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>
                  {active ? total : filter.count}
                </span>
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </ForgePage>
  );
}

function ExpensesTable({ expenses }: { expenses: ForgeExpenseSummary[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr className="text-muted-foreground">
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Description</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Category</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Job</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Vendor</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Cost</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
            <th className="px-5 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {expenses.map((expense) => (
            <tr key={expense.id} className="transition hover:bg-muted/30">
              <td className="px-5 py-4">
                <Link href={`/expenses/${expense.id}`} className="group flex items-center gap-2 font-bold text-foreground">
                  {expense.hasReceipt ? (
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  )}
                  <span className="group-hover:underline">{expense.description}</span>
                </Link>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {expense.propertyLabel} · {expense.dateLabel}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <BillingBadge label={expense.billingTreatmentLabel} />
                  {expense.invoiceLabel && expense.invoiceHref ? (
                    <Link href={expense.invoiceHref} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground hover:underline">
                      {expense.invoiceLabel}
                    </Link>
                  ) : null}
                </div>
                {expense.attentionLabel ? (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {expense.attentionLabel}
                  </div>
                ) : null}
              </td>
              <td className="px-5 py-4"><CategoryBadge label={expense.categoryLabel} /></td>
              <td className="px-5 py-4 text-xs text-muted-foreground">{expense.jobLabel}</td>
              <td className="px-5 py-4 text-xs font-medium text-foreground">{expense.vendor}</td>
              <td className="px-5 py-4 font-bold text-foreground">{expense.amountLabel}</td>
              <td className="px-5 py-4"><ForgeStatusPill tone={expense.statusTone}>{expense.statusLabel}</ForgeStatusPill></td>
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

function ExpenseCard({ expense }: { expense: ForgeExpenseSummary }) {
  return (
    <Link
      href={`/expenses/${expense.id}`}
      className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            {expense.hasReceipt ? (
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            )}
            <span className="truncate">{expense.description}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {expense.propertyLabel} · {expense.jobLabel}
          </div>
        </div>
        <ForgeStatusPill tone={expense.statusTone}>{expense.statusLabel}</ForgeStatusPill>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <CategoryBadge label={expense.categoryLabel} />
        <span className="text-lg font-bold text-foreground">{expense.amountLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BillingBadge label={expense.billingTreatmentLabel} />
        {expense.invoiceLabel ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{expense.invoiceLabel}</span> : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{expense.vendor}</span>
        <span>{expense.dateLabel}</span>
      </div>
    </Link>
  );
}

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
      {label}
    </span>
  );
}

function BillingBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      {label}
    </span>
  );
}

function EmptyState({ search, filter }: { filter: ExpenseFilter; search: string }) {
  if (search || filter !== 'all') {
    return (
      <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
        <div>
          <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-foreground">No expenses found</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting the search or filters.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/expenses">Clear filters</Link>
          </Button>
        </div>
      </ForgeCard>
    );
  }

  return (
    <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
      <div>
        <WalletCards className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold text-foreground">No expenses tracked yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Log materials, labor, subcontractor cost, and other job expenses here.</p>
        <Button asChild className="mt-4">
          <Link href="/expenses/new">New expense</Link>
        </Button>
      </div>
    </ForgeCard>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
      {children}
    </p>
  );
}

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

function readFilterParam(value: string | string[] | undefined): ExpenseFilter {
  const raw = readStringParam(value);
  const parsed = ExpenseFilterSchema.safeParse(raw || 'all');
  return parsed.success ? parsed.data : 'all';
}

function formatTotal(total: number, search: string, filter: ExpenseFilter): string {
  const suffix = total === 1 ? 'expense' : 'expenses';
  if (search) return `${total} ${suffix} matching “${search}”`;
  if (filter !== 'all') return `${total} ${suffix} in this filter`;
  return `${total} ${suffix}`;
}
