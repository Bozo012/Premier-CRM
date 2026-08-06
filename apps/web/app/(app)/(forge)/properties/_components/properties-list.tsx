'use client'; // Search input, filter tabs, and row clicks are all interactive handlers.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/properties/PropertiesList.tsx,
// PropertiesTable.tsx, and PropertyCard.tsx, merged into one file
// following the same single-component-with-responsive-classes pattern as
// CustomersList (see ../../customers/_components/customers-list.tsx) rather
// than three separate files — markup, spacing, and the desktop-table /
// mobile-card split are preserved. `forge-*` Tailwind classes swapped for
// the existing equivalent tokens. Props-driven, no data/auth/fixture
// imports — real wiring lives in properties-list-container.tsx.
import { AlertTriangle, Building2, ChevronRight, Home, Plus, Search } from 'lucide-react';

import { DetailStatusBadge } from '@/components/forge-shell/DetailStatusBadge';

import type { PropertyListCallbacks, PropertyListModel, PropertySummary } from '../_lib/forge-properties-contracts';

const chip = (active: boolean) =>
  `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-card-foreground hover:bg-muted/40'
  }`;

export function PropertiesList({ model, callbacks }: { model: PropertyListModel; callbacks: PropertyListCallbacks }) {
  const hasFilters = model.activeStatus !== 'all' || model.activeType !== 'all' || model.searchQuery.trim() !== '';

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Properties</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every serviced address, its customer, its access notes and the work open there.</p>
        </div>
        <button
          type="button"
          disabled={!model.canCreate}
          title={model.canCreate ? undefined : 'Property creation needs a real route before this can write.'}
          onClick={() => callbacks.onOpenAction('new-property')}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New property
        </button>
      </div>

      <label className="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search properties</span>
        <input
          defaultValue={model.searchQuery}
          onChange={(e) => callbacks.onSearch(e.target.value)}
          placeholder="Search by property, address, or customer…"
          className="min-w-0 flex-1 bg-transparent text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>

      <div className="mt-3 space-y-2">
        <div role="group" aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
          {model.statusFilters.map((f) => (
            <button key={f.id} type="button" aria-pressed={model.activeStatus === f.id} onClick={() => callbacks.onStatusFilter(f.id)} className={chip(model.activeStatus === f.id)}>
              {f.label}
              {typeof f.count === 'number' && <span className="rounded-full bg-black/10 px-1.5 py-0.5">{f.count}</span>}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Filter by property type" className="flex gap-2 overflow-x-auto pb-1">
          {model.typeFilters.map((f) => (
            <button key={f.id} type="button" aria-pressed={model.activeType === f.id} onClick={() => callbacks.onTypeFilter(f.id)} className={chip(model.activeType === f.id)}>
              {f.label}
              {typeof f.count === 'number' && <span className="rounded-full bg-black/10 px-1.5 py-0.5">{f.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <p role="status" className="mt-3 text-xs font-semibold text-muted-foreground">
        {model.totalLabel}
      </p>

      {model.isLoading && (
        <div className="mt-3 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {!model.isLoading && model.error && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          <h2 className="mt-1 text-sm font-bold">Properties could not be loaded</h2>
          <p className="mt-1 text-sm">{model.error}</p>
        </div>
      )}

      {!model.isLoading && !model.error && model.properties.length === 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="text-sm font-bold text-card-foreground">{hasFilters ? 'No properties match these filters' : 'No properties yet'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters ? 'Clear the search or filters to see the full property directory.' : 'Add a property to a customer to start tracking work at an address.'}
          </p>
        </div>
      )}

      {!model.isLoading && !model.error && model.properties.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="mt-3 hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full">
              <caption className="sr-only">Properties in this workspace</caption>
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5">Property</th>
                  <th scope="col" className="px-4 py-2.5">Customer</th>
                  <th scope="col" className="px-4 py-2.5">Type</th>
                  <th scope="col" className="px-4 py-2.5">Open work</th>
                  <th scope="col" className="px-4 py-2.5">Next visit</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="px-4 py-2.5">Updated</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {model.properties.map((p) => (
                  <tr
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open property ${p.name}, ${p.customerName}, ${p.statusLabel}`}
                    onClick={() => callbacks.onOpenProperty(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        callbacks.onOpenProperty(p.id);
                      }
                    }}
                    className="cursor-pointer border-t border-border transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <td className="max-w-0 break-words px-4 py-3">
                      <span className="block text-sm font-bold text-card-foreground">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.address}</span>
                      {p.attentionLabel && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--st-warning-fg))]">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {p.attentionLabel}
                        </span>
                      )}
                    </td>
                    <td className="max-w-0 break-words px-4 py-3">
                      <PropertyCustomerLink property={p} onOpenCustomer={callbacks.onOpenCustomer} />
                    </td>
                    <td className="px-4 py-3 text-sm text-card-foreground">{p.typeLabel}</td>
                    <td className="px-4 py-3 text-sm text-card-foreground">
                      {p.openRequests} requests · {p.activeJobs} jobs
                    </td>
                    <td className="px-4 py-3 text-sm text-card-foreground">{p.upcomingVisitLabel}</td>
                    <td className="px-4 py-3"><DetailStatusBadge label={p.statusLabel} tone={p.statusTone} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.updatedLabel}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-3 space-y-3 lg:hidden">
            {model.properties.map((p) => {
              const Icon = p.type === 'commercial' ? Building2 : Home;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open property ${p.name}, ${p.customerName}, ${p.statusLabel}`}
                  onClick={() => callbacks.onOpenProperty(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      callbacks.onOpenProperty(p.id);
                    }
                  }}
                  className="w-full cursor-pointer rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-card-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.address}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <DetailStatusBadge label={p.statusLabel} tone={p.statusTone} />
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{p.typeLabel}</span>
                  </div>

                  <PropertyCustomerLink property={p} onOpenCustomer={callbacks.onOpenCustomer} mobile />

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                    <div>
                      <dt className="text-[11px] font-bold uppercase text-muted-foreground">Requests</dt>
                      <dd className="text-sm font-bold text-card-foreground">{p.openRequests}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase text-muted-foreground">Jobs</dt>
                      <dd className="text-sm font-bold text-card-foreground">{p.activeJobs}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase text-muted-foreground">Updated</dt>
                      <dd className="text-sm font-bold text-card-foreground">{p.updatedLabel}</dd>
                    </div>
                  </dl>

                  <p className="mt-2 text-xs text-muted-foreground">Next visit: {p.upcomingVisitLabel}</p>

                  {p.attentionLabel && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {p.attentionLabel}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

/** Nested customer link that stops propagation so it doesn't also trigger the row/card's own onOpen. */
function PropertyCustomerLink({ property, onOpenCustomer, mobile }: { property: PropertySummary; onOpenCustomer: (id: string) => void; mobile?: boolean }) {
  if (!property.customerId) {
    return <span className="text-sm text-muted-foreground">{property.customerName}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenCustomer(property.customerId!);
      }}
      aria-label={`Open customer ${property.customerName}`}
      className={
        mobile
          ? 'mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg text-xs font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      }
    >
      {property.customerName}
      {mobile && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}
