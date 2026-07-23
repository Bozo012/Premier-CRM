'use client';
// Client component: multi-step customer search → property select → work
// details, with server-action dispatch. Shared by the standalone New Quote
// and New Job entry points; mirrors the manual New Estimate form exactly.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { Result } from '@premier/shared';

import {
  listPropertiesForCustomerAction,
  searchCustomersForPickerAction,
  type CustomerPickerItem,
  type PropertyPickerItem,
} from '@/app/(app)/estimates/actions';

export type CreateFromCustomerActionState = Result<{ id: string }>;

interface CustomerPropertyWorkFormProps {
  /** e.g. "/quotes" — the created record's id is appended for the redirect. */
  redirectBasePath: string;
  submitAction: (
    prevState: CreateFromCustomerActionState | null,
    formData: FormData
  ) => Promise<CreateFromCustomerActionState>;
  submitIdleLabel: string;
  submitPendingLabel: string;
  successMessage: string;
}

export function CustomerPropertyWorkForm({
  redirectBasePath,
  submitAction,
  submitIdleLabel,
  submitPendingLabel,
  successMessage,
}: CustomerPropertyWorkFormProps) {
  const router = useRouter();

  const [isSearching, startSearch] = useTransition();
  const [isLoadingProps, startLoadProps] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Customer search
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerPickerItem[]>([]);
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Selections
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPickerItem | null>(null);
  const [properties, setProperties] = useState<PropertyPickerItem[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  // Submit
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSearch = () => {
    const fd = new FormData();
    fd.set('q', query);
    startSearch(async () => {
      const result = await searchCustomersForPickerAction(null, fd);
      setSearchAttempted(true);
      if (result.success) {
        setCustomers(result.data);
      } else {
        toast.error(result.error ?? 'Customer search failed.');
      }
    });
  };

  const handleSelectCustomer = (customer: CustomerPickerItem) => {
    setSelectedCustomer(customer);
    setSelectedPropertyId('');
    setProperties([]);
    const fd = new FormData();
    fd.set('customerId', customer.id);
    startLoadProps(async () => {
      const result = await listPropertiesForCustomerAction(null, fd);
      if (result.success) {
        setProperties(result.data);
        if (result.data.length === 1 && result.data[0]) {
          setSelectedPropertyId(result.data[0].id);
        }
      } else {
        toast.error(result.error ?? 'Could not load properties.');
      }
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedPropertyId) return;
    const fd = new FormData(e.currentTarget);
    fd.set('customerId', selectedCustomer.id);
    fd.set('propertyId', selectedPropertyId);
    setSubmitError(null);
    startSubmit(async () => {
      const result = await submitAction(null, fd);
      if (result.success) {
        toast.success(successMessage);
        router.push(`${redirectBasePath}/${result.data.id}`);
      } else {
        const msg = result.error ?? 'Something went wrong. Please try again.';
        setSubmitError(msg);
        toast.error(msg);
      }
    });
  };

  const canSubmit =
    Boolean(selectedCustomer) && Boolean(selectedPropertyId) && !isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: Customer */}
      <section className="space-y-3 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">1. Customer</h2>

        {selectedCustomer ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                {selectedCustomer.displayName}
              </p>
              {selectedCustomer.email ? (
                <p className="text-xs text-muted-foreground">{selectedCustomer.email}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCustomer(null);
                setSelectedPropertyId('');
                setProperties([]);
                setSearchAttempted(false);
                setCustomers([]);
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchAttempted && customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No customers found.{' '}
                <Link
                  href="/customers"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Add a customer first →
                </Link>
              </p>
            ) : null}

            {customers.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full px-3 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {c.displayName}
                      </p>
                      {c.email ? (
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {/* Step 2: Property */}
      {selectedCustomer ? (
        <section className="space-y-3 rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">2. Property</h2>

          {isLoadingProps ? (
            <p className="text-sm text-muted-foreground">Loading properties…</p>
          ) : properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No properties on file for this customer.{' '}
              <Link
                href="/customers"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Add a property first →
              </Link>
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {properties.map((p) => {
                const isSelected = p.id === selectedPropertyId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPropertyId(p.id)}
                      className={[
                        'w-full px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-foreground'}`}>
                        {p.addressLine1}
                      </p>
                      <p className={`text-xs ${isSelected ? 'text-slate-300' : 'text-muted-foreground'}`}>
                        {p.city}, {p.state} {p.zip}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* Step 3: Work details */}
      {selectedCustomer && selectedPropertyId ? (
        <section className="space-y-4 rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">3. Work details</h2>

          <div className="space-y-1.5">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title <span className="text-muted-foreground font-normal">(required)</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Gutter cleaning, Fence repair…"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Any additional scope notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </section>
      ) : null}

      {submitError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? submitPendingLabel : submitIdleLabel}
      </button>
    </form>
  );
}
