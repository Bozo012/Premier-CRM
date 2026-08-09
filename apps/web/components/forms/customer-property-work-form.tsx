'use client';
// Client component: multi-path customer resolution (search-and-select OR
// type-a-new-customer-inline, with a soft dedupe check on the latter) →
// property resolution (pick existing OR add one inline) → work details →
// server-action dispatch. Shared by the standalone New Quote and New Job
// entry points. (New Estimate uses the same underlying resolution logic via
// useCustomerPropertyResolver(), in its own capture-first layout.)

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { Result } from '@premier/shared';

import { CustomerPropertySection } from './customer-property-section';
import { useCustomerPropertyResolver } from './use-customer-property-resolver';

export type CreateFromCustomerActionState = Result<{ id: string }>;

interface CustomerPropertyWorkFormProps<TState extends Result<{ id: string }>> {
  /** e.g. "/quotes" — the created record's id is appended for the redirect. */
  redirectBasePath: string;
  submitAction: (prevState: TState | null, formData: FormData) => Promise<TState>;
  submitIdleLabel: string;
  submitPendingLabel: string;
  successMessage: string;
  /**
   * Optional extra form fields rendered after "Work details" and before
   * submit, e.g. Job creation's real "Schedule and crew" fields
   * (createJobWithScheduleAction reads scheduledStart/scheduledEnd/
   * crewUserId[]/leadUserId from the same FormData this form submits).
   * Undefined for every other caller — a purely additive slot.
   */
  extraFields?: React.ReactNode;
}

export function CustomerPropertyWorkForm<TState extends Result<{ id: string }> = CreateFromCustomerActionState>({
  redirectBasePath,
  submitAction,
  submitIdleLabel,
  submitPendingLabel,
  successMessage,
  extraFields,
}: CustomerPropertyWorkFormProps<TState>) {
  const router = useRouter();
  const resolver = useCustomerPropertyResolver();
  const [isSubmitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resolver.resolvedCustomer || !resolver.selectedPropertyId) return;
    const fd = new FormData(e.currentTarget);
    fd.set('customerId', resolver.resolvedCustomer.id);
    fd.set('propertyId', resolver.selectedPropertyId);
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
    Boolean(resolver.resolvedCustomer) && Boolean(resolver.selectedPropertyId) && !isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <CustomerPropertySection resolver={resolver} />

      {/* Work details */}
      {resolver.resolvedCustomer && resolver.selectedPropertyId ? (
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

      {resolver.resolvedCustomer && resolver.selectedPropertyId ? extraFields : null}

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
