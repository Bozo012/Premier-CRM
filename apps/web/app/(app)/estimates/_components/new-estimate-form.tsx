'use client';
// Capture-first layout (per the Claude Design "CRM Creation Flows" redesign):
// the job description is the primary input, "Who & where" is resolved after
// describing the work rather than gating the form up front. Dictate and Add
// photo are optional aids alongside the description — both are disabled here
// since no voice-to-text or photo-upload pipeline exists in the app yet (see
// packages/ai and supabase/migrations/0003_vault_and_comms.sql: the schema
// anticipates recordings/photos, but nothing produces them yet). Customer and
// property resolution reuses the exact same search/dedupe logic as New Job
// and New Quote via useCustomerPropertyResolver() — only the layout differs.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Mic } from 'lucide-react';
import { toast } from 'sonner';

import { CustomerPropertySection } from '@/components/forms/customer-property-section';
import { useCustomerPropertyResolver } from '@/components/forms/use-customer-property-resolver';

import { createManualEstimateAction } from '../actions';

function derivedTitle(description: string): string {
  const firstLine = description.trim().split(/[\n.]/)[0]?.trim() ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  if (!words) return 'New estimate';
  return words.length > 48 ? `${words.slice(0, 48).trim()}…` : words;
}

export function NewEstimateForm() {
  const router = useRouter();
  const resolver = useCustomerPropertyResolver();

  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const canSubmit =
    Boolean(resolver.resolvedCustomer) && Boolean(resolver.selectedPropertyId) && !isSubmitting;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setDescriptionError("Describe the job — that's the one thing an estimate can't be created without.");
      return;
    }
    setDescriptionError(null);

    if (!resolver.resolvedCustomer || !resolver.selectedPropertyId) return;

    const fd = new FormData();
    fd.set('customerId', resolver.resolvedCustomer.id);
    fd.set('propertyId', resolver.selectedPropertyId);
    fd.set('title', title.trim() || derivedTitle(trimmedDescription));
    fd.set('description', trimmedDescription);

    setSubmitError(null);
    startSubmit(async () => {
      const result = await createManualEstimateAction(null, fd);
      if (result.success) {
        toast.success('Estimate created.');
        router.push(`/estimates/${result.data.estimateId}`);
      } else {
        const msg = result.error ?? 'Something went wrong. Please try again.';
        setSubmitError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* What's the job? — primary, capture-first input */}
      <section className="space-y-3 rounded-md border bg-background p-4">
        <label htmlFor="description" className="text-sm font-semibold text-foreground">
          What&apos;s the job? <span className="text-red-600">*</span>
        </label>
        <textarea
          id="description"
          autoFocus
          rows={7}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (descriptionError) setDescriptionError(null);
          }}
          placeholder="Describe it like you'd tell the crew — scope, materials, measurements, what the customer said…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {descriptionError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {descriptionError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="Voice dictation isn't wired up yet"
            aria-disabled="true"
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground opacity-50"
          >
            <Mic className="h-3.5 w-3.5" />
            Dictate
          </button>
          <button
            type="button"
            disabled
            title="Photo capture isn't wired up yet"
            aria-disabled="true"
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            Add photo
          </button>
          <span className="text-xs text-muted-foreground">
            Both optional — the description is the estimate.
          </span>
        </div>
      </section>

      {/* Who & where — resolved after the description, not gating it */}
      <CustomerPropertySection resolver={resolver} mergedHeading="Who & where" />

      {/* Optional title override */}
      <section className="space-y-1.5 rounded-md border bg-background p-4">
        <label htmlFor="title" className="text-sm font-medium text-foreground">
          Title <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={description.trim() ? derivedTitle(description) : 'Filled in from your description'}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Used on the estimates list. Leave blank and we&apos;ll take the first line of the description.
        </p>
      </section>

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
        {isSubmitting ? 'Creating…' : 'Create estimate'}
      </button>
    </form>
  );
}
