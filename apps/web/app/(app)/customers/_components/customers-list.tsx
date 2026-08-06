'use client'; // Search input, filter tabs, and row clicks are all interactive handlers.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/customers/CustomersList.tsx. Markup, spacing,
// desktop-table/mobile-card responsive split, and loading/error/empty/
// no-results states are unchanged. `forge-*` Tailwind classes swapped for
// the existing equivalent tokens (see apps/web/components/forge-shell/ForgeMark.tsx
// for why no new CSS was required). Props-driven, no data/auth/fixture
// imports — real wiring lives in customers-list-container.tsx.
import { Search, SearchX, Plus, Phone, Mail, Building2, Home, ChevronRight } from 'lucide-react';

import type { CustomerCallbacks, CustomersListViewModel } from '../_lib/forge-customers-contracts';

export function CustomersList({ model, callbacks }: { model: CustomersListViewModel; callbacks: CustomerCallbacks }) {
  const hasCustomers = model.customers.length > 0;
  const showNoResults = !hasCustomers && !model.isLoading && !model.error && (model.searchQuery || model.activeFilter !== 'all');

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer accounts, properties, and contact details.</p>
        </div>
        <button
          onClick={() => callbacks.onOpenAction('new-customer')}
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" /> Add customer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          defaultValue={model.searchQuery}
          onChange={(e) => callbacks.onSearch(e.target.value)}
          placeholder="Search by name, email, or property…"
          aria-label="Search customers"
          className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Filters */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter customers">
        {model.filters.map((filter) => {
          const active = model.activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              role="tab"
              aria-selected={active}
              onClick={() => callbacks.onFilter(filter.id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground'}`}
            >
              {filter.label}
              <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{filter.count}</span>
            </button>
          );
        })}
      </div>

      {/* States */}
      {model.isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" aria-label="Loading customers" />
        </div>
      ) : model.error ? (
        <div className="grid min-h-[40vh] place-items-center px-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground">{model.error.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{model.error.message}</p>
            <button
              onClick={() => callbacks.onOpenAction('retry-customers')}
              type="button"
              className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              Retry
            </button>
          </div>
        </div>
      ) : showNoResults ? (
        <div className="grid min-h-[40vh] place-items-center px-4">
          <div className="text-center">
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold text-foreground">No customers found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        </div>
      ) : !hasCustomers ? (
        <div className="grid min-h-[40vh] place-items-center px-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground">No customers yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add your first customer to get started.</p>
            <button
              onClick={() => callbacks.onOpenAction('new-customer')}
              type="button"
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add customer
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-muted-foreground">
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Customer
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Contact
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Properties
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Open items
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-bold uppercase tracking-wide">
                    Updated
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {model.customers.map((c) => (
                  <tr key={c.id} className="cursor-pointer transition hover:bg-muted/30" onClick={() => callbacks.onOpenCustomer(c.id)}>
                    <td className="px-5 py-4">
                      <div className="font-bold text-card-foreground">{c.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{c.properties[0]?.name}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {c.phone}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        {c.email}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-card-foreground">
                      {c.properties.length} {c.properties.length === 1 ? 'property' : 'properties'}
                    </td>
                    <td className="px-5 py-4 text-xs text-card-foreground">
                      {c.openRequests + c.openEstimates > 0 ? `${c.openRequests} req · ${c.openEstimates} est` : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={c.status} label={c.statusLabel} />
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{c.lastActivityLabel}</td>
                    <td className="px-5 py-4 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {model.customers.map((c) => (
              <button
                key={c.id}
                onClick={() => callbacks.onOpenCustomer(c.id)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-card-foreground">{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{c.properties[0]?.name}</div>
                  </div>
                  <StatusPill status={c.status} label={c.statusLabel} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    {c.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    {c.properties.length} {c.properties.length === 1 ? 'property' : 'properties'}
                  </span>
                  {c.openRequests + c.openEstimates > 0 && (
                    <span>
                      {c.openRequests} req · {c.openEstimates} est
                    </span>
                  )}
                  <span>{c.lastActivityLabel}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {c.properties.slice(0, 2).map((p) => (
                    <span key={p.id} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                      {p.type === 'commercial' ? <Building2 className="h-3 w-3" aria-hidden="true" /> : <Home className="h-3 w-3" aria-hidden="true" />}
                      {p.name}
                    </span>
                  ))}
                  {c.properties.length > 2 && <span className="text-[10px] text-muted-foreground">+{c.properties.length - 2} more</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800',
    prospect: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
    inactive: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${styles[status] || styles.inactive}`}>{label}</span>;
}
