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
      <ForgeBackLink href="/expenses">Back to expenses</ForgeBackLink>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">New expense</h1>
        <p className="text-sm text-muted-foreground">
          Record Premier&apos;s job cost without changing customer invoice totals.
        </p>
      </header>

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
        <form action={createExpenseAction} className="space-y-5">
          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Expense details</ForgeSectionTitle>
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

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}
