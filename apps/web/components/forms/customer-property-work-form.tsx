'use client';
// Client component: multi-path customer resolution (search-and-select OR
// type-a-new-customer-inline, with a soft dedupe check on the latter) →
// property resolution (pick existing OR add one inline) → work details →
// server-action dispatch. Shared by the standalone New Estimate, New Quote,
// and New Job entry points.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { CustomerEmailMatch } from '@premier/db';
import type { Result } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  checkCustomerEmailAction,
  createCustomerAction,
  createPropertyForCustomerAction,
} from '@/app/(app)/customers/actions';
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

interface ResolvedCustomer {
  displayName: string;
  id: string;
}

const PROPERTY_TYPE_OPTIONS = [
  { label: 'Not set', value: '' },
  { label: 'Single family', value: 'single_family' },
  { label: 'Rental house', value: 'rental_house' },
  { label: 'Rental unit', value: 'rental_unit' },
  { label: 'Multi-family', value: 'multi_family' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Other', value: 'other' },
];

/**
 * Builds a FormData from a plain container's named inputs. Used instead of
 * `new FormData(formElement)` for the manual-entry and add-property
 * sections, which are `<div>`s (not `<form>`s) — nesting a real `<form>`
 * inside the page's outer work-details `<form>` is invalid HTML, and
 * browsers resolve it by falling back to a native top-level submission
 * (a full page GET with every field serialized into the URL), silently
 * wiping all React state instead of running the submit handler.
 */
function formDataFromContainer(container: HTMLElement): FormData {
  const formData = new FormData();
  const elements = container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input[name], select[name], textarea[name]'
  );
  elements.forEach((element) => {
    formData.set(element.name, element.value);
  });
  return formData;
}

function computeDisplayName(formData: FormData): string {
  const companyName = String(formData.get('companyName') ?? '').trim();
  if (companyName) return companyName;
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
}

export function CustomerPropertyWorkForm({
  redirectBasePath,
  submitAction,
  submitIdleLabel,
  submitPendingLabel,
  successMessage,
}: CustomerPropertyWorkFormProps) {
  const router = useRouter();

  // Which way staff is resolving the customer, and the end result once resolved.
  const [customerMode, setCustomerMode] = useState<'search' | 'manual'>('search');
  const [resolvedCustomer, setResolvedCustomer] = useState<ResolvedCustomer | null>(null);

  // Search-mode state
  const [isSearching, startSearch] = useTransition();
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerPickerItem[]>([]);
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Manual-mode state
  const manualContainerRef = useRef<HTMLDivElement>(null);
  const [isResolvingManual, startResolveManual] = useTransition();
  const [manualDuplicateMatch, setManualDuplicateMatch] = useState<CustomerEmailMatch | null>(null);
  const [manualPendingFormData, setManualPendingFormData] = useState<FormData | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  // Property resolution — used whenever the resolved customer already
  // existed (via search, or "use existing" from a dedupe match) and we need
  // to pick or add a property for them. Skipped entirely when a brand-new
  // customer+property were just created together in manual mode.
  const [properties, setProperties] = useState<PropertyPickerItem[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [isLoadingProps, startLoadProps] = useTransition();
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const addPropertyContainerRef = useRef<HTMLDivElement>(null);
  const [isAddingPropertySubmit, startAddProperty] = useTransition();
  const [addPropertyError, setAddPropertyError] = useState<string | null>(null);

  // Final submit
  const [isSubmitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadPropertiesFor(customerId: string) {
    const fd = new FormData();
    fd.set('customerId', customerId);
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
  }

  function resetCustomer() {
    setResolvedCustomer(null);
    setSelectedPropertyId('');
    setProperties([]);
    setIsAddingProperty(false);
    setSearchAttempted(false);
    setCustomers([]);
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    setManualError(null);
  }

  // ---- Search mode ----

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
    setResolvedCustomer({ id: customer.id, displayName: customer.displayName });
    setSelectedPropertyId('');
    setProperties([]);
    loadPropertiesFor(customer.id);
  };

  // ---- Manual mode: create the customer (+ its property) inline ----

  async function createCustomerAndProperty(formData: FormData) {
    const customerResult = await createCustomerAction(null, formData);
    if (!customerResult.success) {
      const message = customerResult.error ?? 'Could not create the customer.';
      setManualError(message);
      toast.error(message);
      return;
    }

    const propertyFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      propertyFormData.append(key, value);
    }
    propertyFormData.set('customerId', customerResult.data.id);

    const propertyResult = await createPropertyForCustomerAction(null, propertyFormData);
    if (!propertyResult.success) {
      const message = `Customer created, but the property could not be added: ${propertyResult.error ?? 'unknown error'}.`;
      setManualError(message);
      toast.error(message);
      return;
    }

    setResolvedCustomer({ id: customerResult.data.id, displayName: computeDisplayName(formData) });
    setSelectedPropertyId(propertyResult.data.id);
    toast.success('Customer and property created.');
  }

  function handleManualContinue() {
    if (!manualContainerRef.current) return;
    setManualError(null);
    const formData = formDataFromContainer(manualContainerRef.current);
    const email = String(formData.get('email') ?? '').trim();

    if (email) {
      startResolveManual(async () => {
        const result = await checkCustomerEmailAction(email);
        if (result.success && result.data) {
          setManualDuplicateMatch(result.data);
          setManualPendingFormData(formData);
          return;
        }
        await createCustomerAndProperty(formData);
      });
      return;
    }

    startResolveManual(async () => {
      await createCustomerAndProperty(formData);
    });
  }

  function handleUseExistingFromDuplicate() {
    const match = manualDuplicateMatch;
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    if (!match) return;
    setResolvedCustomer({ id: match.id, displayName: match.displayName });
    setSelectedPropertyId('');
    setProperties([]);
    loadPropertiesFor(match.id);
  }

  function handleCreateAnywayFromDuplicate() {
    const formData = manualPendingFormData;
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    if (!formData) return;
    startResolveManual(async () => {
      await createCustomerAndProperty(formData);
    });
  }

  // ---- Add a property inline for an already-resolved (existing) customer ----

  function handleAddProperty() {
    setAddPropertyError(null);
    if (!resolvedCustomer || !addPropertyContainerRef.current) return;
    const formData = formDataFromContainer(addPropertyContainerRef.current);
    formData.set('customerId', resolvedCustomer.id);

    startAddProperty(async () => {
      const result = await createPropertyForCustomerAction(null, formData);
      if (result.success) {
        toast.success('Property added.');
        setIsAddingProperty(false);
        setSelectedPropertyId(result.data.id);
        loadPropertiesFor(resolvedCustomer.id);
      } else {
        const message = result.error ?? 'Could not add the property. Please try again.';
        setAddPropertyError(message);
        toast.error(message);
      }
    });
  }

  // ---- Final submit ----

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resolvedCustomer || !selectedPropertyId) return;
    const fd = new FormData(e.currentTarget);
    fd.set('customerId', resolvedCustomer.id);
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
    Boolean(resolvedCustomer) && Boolean(selectedPropertyId) && !isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: Customer */}
      <section className="space-y-3 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">1. Customer</h2>

        {resolvedCustomer ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{resolvedCustomer.displayName}</p>
            <button
              type="button"
              onClick={resetCustomer}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-md border p-1">
              <button
                type="button"
                onClick={() => setCustomerMode('search')}
                className={[
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  customerMode === 'search'
                    ? 'bg-slate-900 text-white'
                    : 'text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                Search existing
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode('manual')}
                className={[
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  customerMode === 'manual'
                    ? 'bg-slate-900 text-white'
                    : 'text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                Enter new customer
              </button>
            </div>

            {customerMode === 'search' ? (
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
                    No customers found. Try{' '}
                    <button
                      type="button"
                      onClick={() => setCustomerMode('manual')}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      entering a new customer
                    </button>{' '}
                    instead.
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
                          <p className="text-sm font-medium text-foreground">{c.displayName}</p>
                          {c.email ? (
                            <p className="text-xs text-muted-foreground">{c.email}</p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : manualDuplicateMatch ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    A customer with this email already exists
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-sm font-medium text-foreground">
                      {manualDuplicateMatch.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[manualDuplicateMatch.email, manualDuplicateMatch.phonePrimary]
                        .filter(Boolean)
                        .join(' · ') || 'No additional contact details'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isResolvingManual}
                      onClick={handleUseExistingFromDuplicate}
                    >
                      Use existing customer
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isResolvingManual}
                      onClick={handleCreateAnywayFromDuplicate}
                      className="text-red-600 hover:text-red-700"
                    >
                      {isResolvingManual ? 'Creating…' : 'Create new anyway'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isResolvingManual}
                      onClick={() => {
                        setManualDuplicateMatch(null);
                        setManualPendingFormData(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div
                ref={manualContainerRef}
                className="space-y-3 rounded-md border p-3"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    handleManualContinue();
                  }
                }}
              >
                {manualError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {manualError}
                  </p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="manual-firstName">First name</Label>
                    <Input id="manual-firstName" name="firstName" maxLength={120} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-lastName">Last name</Label>
                    <Input id="manual-lastName" name="lastName" maxLength={120} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="manual-companyName">Company name</Label>
                  <Input id="manual-companyName" name="companyName" maxLength={200} />
                </div>

                <p className="text-xs text-muted-foreground">
                  Enter a person&apos;s name, a company name, or both.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="manual-email">Email</Label>
                    <Input id="manual-email" name="email" type="email" placeholder="jane@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-phonePrimary">Phone</Label>
                    <Input id="manual-phonePrimary" name="phonePrimary" type="tel" maxLength={30} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="manual-addressLine1">Street address</Label>
                  <Input id="manual-addressLine1" name="addressLine1" required maxLength={200} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="manual-addressLine2">Unit / suite</Label>
                  <Input id="manual-addressLine2" name="addressLine2" maxLength={200} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="manual-city">City</Label>
                    <Input id="manual-city" name="city" required maxLength={120} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-state">State</Label>
                    <Input id="manual-state" name="state" required maxLength={40} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-zip">ZIP</Label>
                    <Input id="manual-zip" name="zip" required maxLength={20} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="manual-propertyType">Property type</Label>
                  <select
                    id="manual-propertyType"
                    name="propertyType"
                    defaultValue=""
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {PROPERTY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={isResolvingManual}
                  onClick={handleManualContinue}
                >
                  {isResolvingManual ? 'Checking…' : 'Continue'}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 2: Property — only shown when the resolved customer already
          existed (search, or "use existing" from a dedupe match) and still
          needs a property picked or added. A brand-new customer created via
          manual mode already has its property resolved in step 1. */}
      {resolvedCustomer && !selectedPropertyId ? (
        <section className="space-y-3 rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">2. Property</h2>

          {isLoadingProps ? (
            <p className="text-sm text-muted-foreground">Loading properties…</p>
          ) : properties.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {properties.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPropertyId(p.id)}
                    className="w-full px-3 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <p className="text-sm font-medium text-foreground">{p.addressLine1}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.city}, {p.state} {p.zip}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : !isAddingProperty ? (
            <p className="text-sm text-muted-foreground">
              No properties on file for this customer yet.
            </p>
          ) : null}

          {isAddingProperty ? (
            <div
              ref={addPropertyContainerRef}
              className="space-y-3 rounded-md border p-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                  e.preventDefault();
                  handleAddProperty();
                }
              }}
            >
              {addPropertyError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {addPropertyError}
                </p>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor="prop-addressLine1">Street address</Label>
                <Input id="prop-addressLine1" name="addressLine1" required maxLength={200} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prop-addressLine2">Unit / suite</Label>
                <Input id="prop-addressLine2" name="addressLine2" maxLength={200} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="prop-city">City</Label>
                  <Input id="prop-city" name="city" required maxLength={120} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prop-state">State</Label>
                  <Input id="prop-state" name="state" required maxLength={40} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="prop-zip">ZIP</Label>
                  <Input id="prop-zip" name="zip" required maxLength={20} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="prop-propertyType">Property type</Label>
                <select
                  id="prop-propertyType"
                  name="propertyType"
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isAddingPropertySubmit}
                  onClick={handleAddProperty}
                >
                  {isAddingPropertySubmit ? 'Adding…' : 'Add property'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isAddingPropertySubmit}
                  onClick={() => {
                    setIsAddingProperty(false);
                    setAddPropertyError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingProperty(true)}>
              + Add a property
            </Button>
          )}
        </section>
      ) : null}

      {/* Step 3: Work details */}
      {resolvedCustomer && selectedPropertyId ? (
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
