import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, listJobs } from '@premier/db';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeSectionTitle } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { createExpenseAction } from '../actions';
import { getBillingTreatmentLabel, getCategoryLabel } from '../_lib/forge-expense-view-model';

export const metadata: Metadata = { title: 'New expense' };

const CATEGORIES = ['materials', 'labor', 'equipment', 'subcontractor', 'travel', 'permit', 'other'] as const;
const BILLING_TREATMENTS = [
  'pending_review',
  'internal_cost_only',
  'included_fixed_price',
  'included_accepted_quote',
  'reimbursable_at_cost',
  'billable_with_markup',
  'customer_approved_pass_through',
  'non_billable',
] as const;
const PAYMENT_METHODS = ['card', 'ach', 'check', 'cash', 'venmo', 'other'] as const;
const FIELD_INPUT_CLASS =
  'min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

const EXPENSE_ORIGIN_OPTIONS = [
  {
    available: true,
    carriedForward: ['Nothing prefilled', 'You choose job, customer, and property', 'Origin recorded as Manual entry'],
    description: 'Log a cost that was not captured by another workflow.',
    title: 'Manual entry',
  },
  {
    available: true,
    carriedForward: ['Job number and title', 'Customer and property', 'Supplied job cost context'],
    description: 'Add a cost against an existing job.',
    title: 'From a job',
  },
  {
    available: false,
    carriedForward: ['Visit property and customer', 'Linked job when the visit has one', 'Visit date'],
    description: 'Capture a cost noted during a visit.',
    title: 'From a site visit',
  },
  {
    available: false,
    carriedForward: ['Receipt attachment placeholder', 'Vendor when supplied', 'Receipt visibility'],
    description: 'Start from a receipt captured in the field.',
    title: 'From a receipt',
  },
];

interface NewExpensePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewExpensePage({ searchParams }: NewExpensePageProps) {
  const params = await searchParams;
  const error = readStringParam(params.error);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/expenses/new');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return (
      <ForgePage className="max-w-4xl gap-5 md:gap-6">
        <ForgeBackLink href="/expenses">Back to expenses</ForgeBackLink>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </ForgePage>
    );
  }

  const jobsResult = await listJobs(supabase, {
    limit: 100,
    offset: 0,
    orgId: orgContextResult.data.orgId,
    statuses: ['approved', 'scheduled', 'in_progress', 'completed', 'invoiced'],
  });

  return (
    <ForgePage className="max-w-4xl gap-5 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <ForgeBackLink href="/expenses">Cancel</ForgeBackLink>
        <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 sm:inline-flex">
          Manual entry
        </span>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Log an expense</h1>
        <p className="text-sm text-muted-foreground">
          Expenses track Premier&apos;s cost. What the customer owes is decided separately by Forge.
        </p>
        <div className="grid grid-cols-5 gap-1.5 pt-3" aria-label="Log expense progress">
          <span className="h-1 rounded-full bg-primary" />
          <span className="h-1 rounded-full bg-muted" />
          <span className="h-1 rounded-full bg-muted" />
          <span className="h-1 rounded-full bg-muted" />
          <span className="h-1 rounded-full bg-muted" />
        </div>
        <p className="text-sm font-semibold text-foreground">Step 1 of 5: Origin</p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-foreground">How should this expense begin?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Forge carries forward only the context the origin actually provides.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {EXPENSE_ORIGIN_OPTIONS.map((option) => (
            <OriginOptionCard key={option.title} {...option} />
          ))}
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {!jobsResult.success ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          Failed to load jobs: {jobsResult.error}
        </p>
      ) : jobsResult.data.jobs.length === 0 ? (
        <ForgeCard className="space-y-3 text-center">
          <h2 className="text-lg font-bold text-foreground">No eligible jobs yet</h2>
          <p className="text-sm text-muted-foreground">
            Expenses are attached to real jobs so customer, property, and invoice handoffs stay traceable.
          </p>
          <Button asChild variant="outline">
            <Link href="/jobs">Review jobs</Link>
          </Button>
        </ForgeCard>
      ) : (
        <form id="manual-expense-form" action={createExpenseAction} className="space-y-5">
          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Manual expense details</ForgeSectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-bold text-foreground">Description</span>
                <input name="description" required maxLength={200} className={FIELD_INPUT_CLASS} placeholder="Materials for drainage repair" />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Category</span>
                <select name="category" required className={FIELD_INPUT_CLASS}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {getCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Vendor</span>
                <input name="vendor" maxLength={120} className={FIELD_INPUT_CLASS} placeholder="Supplier or vendor" />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Purchase date</span>
                <input name="purchaseDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={FIELD_INPUT_CLASS} />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Payment method</span>
                <select name="paymentMethod" defaultValue="other" className={FIELD_INPUT_CLASS}>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method === 'ach' ? 'ACH' : method.charAt(0).toUpperCase() + method.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Amount</span>
                <input name="amount" required type="number" min="0" step="0.01" className={FIELD_INPUT_CLASS} placeholder="0.00" />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Tax</span>
                <input name="tax" type="number" min="0" step="0.01" defaultValue="0" className={FIELD_INPUT_CLASS} />
              </label>
            </div>
          </ForgeCard>

          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Job and billing</ForgeSectionTitle>
            <label className="space-y-1.5">
              <span className="text-sm font-bold text-foreground">Job</span>
              <select name="jobId" required className={FIELD_INPUT_CLASS}>
                <option value="">Select a job</option>
                {jobsResult.data.jobs.map((item) => (
                  <option key={item.job.id} value={item.job.id}>
                    {(item.job.job_number ?? item.job.title) || 'Untitled job'} · {item.customer?.displayName ?? 'Unknown customer'}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Billing treatment</span>
                <select name="billingTreatment" defaultValue="pending_review" className={FIELD_INPUT_CLASS}>
                  {BILLING_TREATMENTS.map((treatment) => (
                    <option key={treatment} value={treatment}>
                      {getBillingTreatmentLabel(treatment)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-bold text-foreground">Customer charge</span>
                <input name="customerChargeAmount" type="number" min="0" step="0.01" className={FIELD_INPUT_CLASS} placeholder="Reviewed amount" />
              </label>
            </div>

            <p className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700">
              This records cost only. A future invoice line must use an explicit reviewed snapshot.
            </p>
          </ForgeCard>

          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Notes and visibility</ForgeSectionTitle>
            <label className="space-y-1.5">
              <span className="text-sm font-bold text-foreground">Customer-visible description</span>
              <textarea name="customerVisibleDescription" rows={3} maxLength={1000} className={FIELD_INPUT_CLASS} placeholder="Only used for reviewed billable/pass-through treatment." />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-bold text-foreground">Internal notes</span>
              <textarea name="internalNotes" rows={4} maxLength={2000} className={FIELD_INPUT_CLASS} placeholder="Supplier notes, receipt context, internal approval details…" />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-bold text-foreground">Receipt visibility</span>
              <select name="receiptVisibility" defaultValue="internal" className={FIELD_INPUT_CLASS}>
                <option value="internal">Internal only</option>
                <option value="customer_visible">Customer visible after review</option>
              </select>
            </label>
          </ForgeCard>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 rounded-xl font-bold">Create expense</Button>
            <Button asChild variant="outline" className="min-h-11 rounded-xl font-bold">
              <Link href="/expenses">Cancel</Link>
            </Button>
          </div>
        </form>
      )}
    </ForgePage>
  );
}

function OriginOptionCard({
  available,
  carriedForward,
  description,
  title,
}: {
  available: boolean;
  carriedForward: string[];
  description: string;
  title: string;
}) {
  return (
    <article
      aria-disabled={!available}
      className={[
        'rounded-xl border bg-card p-4 text-card-foreground shadow-sm',
        available ? 'border-primary/60' : 'opacity-80',
        title === 'Manual entry' ? 'ring-1 ring-primary/40' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {title === 'Manual entry' ? <span className="text-primary">✓</span> : null}
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Carried forward
        </p>
        <ul className="space-y-0.5 text-sm font-semibold text-foreground">
          {carriedForward.map((item) => (
            <li key={item}>
              <span className="text-primary">•</span> {item}
            </li>
          ))}
        </ul>
      </div>
      {!available ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Requires a real source record and handoff action before this origin can prefill expenses.
        </p>
      ) : null}
    </article>
  );
}

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}
