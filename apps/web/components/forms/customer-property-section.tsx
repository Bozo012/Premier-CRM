'use client';
// Presentational "Customer" + "Property" sections shared by every standalone
// creation flow (New Estimate, New Quote, New Job). Renders whatever state
// useCustomerPropertyResolver() produces — search-and-select, dedupe-on-manual-entry,
// and property pick/add — so each flow can place this block wherever its own
// layout wants it without re-implementing the underlying logic.

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  PROPERTY_TYPE_OPTIONS,
  type CustomerPropertyResolver,
} from './use-customer-property-resolver';

interface CustomerPropertySectionProps {
  resolver: CustomerPropertyResolver;
  /** Section heading text — callers vary this ("1. Customer" vs "2. Property"). Ignored when `mergedHeading` is set. */
  customerHeading?: string;
  propertyHeading?: string;
  /**
   * When set, renders customer + property as one bordered card under this
   * single heading instead of two separate boxes — used by the capture-first
   * New Estimate layout's "Who & where" section. Business logic is identical
   * either way; this only changes the wrapping chrome.
   */
  mergedHeading?: string;
}

export function CustomerPropertySection({
  resolver,
  customerHeading = '1. Customer',
  propertyHeading = '2. Property',
  mergedHeading,
}: CustomerPropertySectionProps) {
  const r = resolver;
  const showPropertyBlock = Boolean(r.resolvedCustomer) && !r.selectedPropertyId;

  const customerBlock = r.resolvedCustomer ? (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
      <p className="text-sm font-medium text-foreground">{r.resolvedCustomer.displayName}</p>
      <button
        type="button"
        onClick={r.resetCustomer}
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
          onClick={() => r.setCustomerMode('search')}
          className={[
            'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            r.customerMode === 'search'
              ? 'bg-slate-900 text-white'
              : 'text-muted-foreground hover:bg-muted',
          ].join(' ')}
        >
          Search existing
        </button>
        <button
          type="button"
          onClick={() => r.setCustomerMode('manual')}
          className={[
            'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            r.customerMode === 'manual'
              ? 'bg-slate-900 text-white'
              : 'text-muted-foreground hover:bg-muted',
          ].join(' ')}
        >
          Enter new customer
        </button>
      </div>

      {r.customerMode === 'search' ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by name…"
              value={r.query}
              onChange={(e) => r.setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  r.handleSearch();
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={r.handleSearch}
              disabled={r.isSearching}
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {r.isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {r.searchAttempted && r.customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers found. Try{' '}
              <button
                type="button"
                onClick={() => r.setCustomerMode('manual')}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                entering a new customer
              </button>{' '}
              instead.
            </p>
          ) : null}

          {r.customers.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {r.customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => r.handleSelectCustomer(c)}
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
      ) : r.manualDuplicateMatch ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              A customer with this email already exists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-sm font-medium text-foreground">
                {r.manualDuplicateMatch.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {[r.manualDuplicateMatch.email, r.manualDuplicateMatch.phonePrimary]
                  .filter(Boolean)
                  .join(' · ') || 'No additional contact details'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={r.isResolvingManual}
                onClick={r.handleUseExistingFromDuplicate}
              >
                Use existing customer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={r.isResolvingManual}
                onClick={r.handleCreateAnywayFromDuplicate}
                className="text-red-600 hover:text-red-700"
              >
                {r.isResolvingManual ? 'Creating…' : 'Create new anyway'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={r.isResolvingManual}
                onClick={r.cancelDuplicateMatch}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          ref={r.manualContainerRef}
          className="space-y-3 rounded-md border p-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
              r.handleManualContinue();
            }
          }}
        >
          {r.manualError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {r.manualError}
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
            disabled={r.isResolvingManual}
            onClick={r.handleManualContinue}
          >
            {r.isResolvingManual ? 'Checking…' : 'Continue'}
          </Button>
        </div>
      )}
    </div>
  );

  const propertyBlock = (
    <>
      {r.isLoadingProps ? (
        <p className="text-sm text-muted-foreground">Loading properties…</p>
      ) : r.properties.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {r.properties.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => r.setSelectedPropertyId(p.id)}
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
      ) : !r.isAddingProperty ? (
        <p className="text-sm text-muted-foreground">
          No properties on file for this customer yet.
        </p>
      ) : null}

      {r.isAddingProperty ? (
        <div
          ref={r.addPropertyContainerRef}
          className="space-y-3 rounded-md border p-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
              r.handleAddProperty();
            }
          }}
        >
          {r.addPropertyError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {r.addPropertyError}
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
              disabled={r.isAddingPropertySubmit}
              onClick={r.handleAddProperty}
            >
              {r.isAddingPropertySubmit ? 'Adding…' : 'Add property'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={r.isAddingPropertySubmit}
              onClick={r.cancelAddProperty}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => r.setIsAddingProperty(true)}>
          + Add a property
        </Button>
      )}
    </>
  );

  if (mergedHeading) {
    return (
      <section className="space-y-4 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">{mergedHeading}</h2>
        {customerBlock}
        {showPropertyBlock ? (
          <div className="space-y-3 border-t pt-4">{propertyBlock}</div>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <section className="space-y-3 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">{customerHeading}</h2>
        {customerBlock}
      </section>

      {showPropertyBlock ? (
        <section className="space-y-3 rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">{propertyHeading}</h2>
          {propertyBlock}
        </section>
      ) : null}
    </>
  );
}
