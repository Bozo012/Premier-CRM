'use client';
// Client component: needs local dialog-open state, a controlled form, and
// useActionState/useTransition to submit createPortalServiceRequestAction
// and react to its Result<T> — matches the same modal + useActionState
// pattern PortalContactSheet (../../_components/portal-contact-sheet.tsx)
// already established for portal-submitted forms.

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { createPortalServiceRequestAction, type CreatePortalServiceRequestActionState } from '../actions';

export interface PortalNewRequestProperty {
  id: string;
  label: string;
}

export function PortalNewRequestSheet({ properties }: { properties: PortalNewRequestProperty[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<CreatePortalServiceRequestActionState | null, FormData>(
    createPortalServiceRequestAction,
    null
  );
  const isPending = isActionPending || isTransitionPending;

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  function openSheet() {
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={openSheet}>
        New request
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
          <section
            aria-labelledby="portal-new-request-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-5"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="portal-new-request-title" className="text-lg font-semibold tracking-tight">
                  {state?.success ? 'Request submitted' : 'New request'}
                </h2>
                {!state?.success ? (
                  <p className="mt-1 text-sm text-muted-foreground">Tell us what you need done.</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close new request form"
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={closeSheet}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!state?.success ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  startTransition(() => formAction(formData));
                }}
              >
                <div>
                  <label
                    htmlFor="portal-new-request-property"
                    className="block text-xs font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Property
                  </label>
                  <select
                    id="portal-new-request-property"
                    name="propertyId"
                    defaultValue=""
                    className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">No specific property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Only properties linked to your account appear here.</p>
                </div>

                <div>
                  <label
                    htmlFor="portal-new-request-service-title"
                    className="block text-xs font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Title <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="portal-new-request-service-title"
                    name="serviceTitle"
                    type="text"
                    required
                    maxLength={200}
                    placeholder="A short summary of what you need"
                    className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label
                    htmlFor="portal-new-request-description"
                    className="block text-xs font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Description <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="portal-new-request-description"
                    name="serviceDescription"
                    required
                    maxLength={5000}
                    rows={4}
                    placeholder="Give us the details"
                    className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {state && !state.success ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" disabled={isPending} className="min-h-11 flex-1">
                    {isPending ? 'Submitting…' : 'Submit request'}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeSheet} className="min-h-11 flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-foreground">Request received</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {state.data.requestNumber ? `Reference ${state.data.requestNumber}. ` : ''}
                      We&apos;ll review it and follow up.
                    </p>
                  </div>
                </div>
                <Button type="button" onClick={closeSheet} className="min-h-11 w-full">
                  Close
                </Button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
