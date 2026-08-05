import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Briefcase, Eye, EyeOff, Info, Paperclip, Receipt } from 'lucide-react';

import { getActiveOrgContext, getExpenseById } from '@premier/db';
import { ErrorCode, hasCapability, type ExpenseBillingTreatment, type OrgRole } from '@premier/shared';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeSectionTitle, ForgeStatusPill } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { approveExpenseAction, rejectExpenseAction, submitExpenseAction, voidExpenseAction } from '../actions';
import {
  formatMoney,
  getBillingTreatmentLabel,
  toForgeExpenseDetail,
} from '../_lib/forge-expense-view-model';

export const metadata: Metadata = { title: 'Expense detail' };

const BILLING_TREATMENTS: ExpenseBillingTreatment[] = [
  'internal_cost_only',
  'included_fixed_price',
  'included_accepted_quote',
  'reimbursable_at_cost',
  'billable_with_markup',
  'customer_approved_pass_through',
  'non_billable',
];

interface ExpenseDetailPageProps {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExpenseDetailPage({ params, searchParams }: ExpenseDetailPageProps) {
  const { expenseId } = await params;
  const query = await searchParams;
  const message = readStringParam(query.message);
  const error = readStringParam(query.error);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/expenses/${expenseId}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return (
      <ForgePage className="max-w-6xl gap-5 md:gap-6">
        <ForgeBackLink href="/expenses">Back to expenses</ForgeBackLink>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </ForgePage>
    );
  }

  const result = await getExpenseById(supabase, {
    expenseId,
    orgId: orgContextResult.data.orgId,
  });
  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) notFound();
    return (
      <ForgePage className="max-w-6xl gap-5 md:gap-6">
        <ForgeBackLink href="/expenses">Back to expenses</ForgeBackLink>
        <ErrorPanel>Failed to load expense: {result.error}</ErrorPanel>
      </ForgePage>
    );
  }

  const role = orgContextResult.data.role as OrgRole;
  const canSubmit = hasCapability(role, 'canCreateInvoices') && result.data.expense.status === 'draft';
  const canReview =
    hasCapability(role, 'canRecordPayments') &&
    ['submitted', 'needs_receipt', 'needs_review'].includes(result.data.expense.status);
  const canVoid =
    hasCapability(role, 'canVoidInvoices') &&
    !['rejected', 'internal_only', 'invoiced', 'reimbursed', 'voided'].includes(result.data.expense.status);
  const model = toForgeExpenseDetail(result.data);

  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <ForgeBackLink href="/expenses">Back to expenses</ForgeBackLink>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{model.expenseNumber}</h1>
          <ForgeStatusPill tone={model.statusTone}>{model.statusLabel}</ForgeStatusPill>
          <BillingBadge label={model.billingTreatmentLabel} />
        </div>
        <p className="text-base font-semibold text-foreground">{model.description}</p>
        <p className="text-sm text-muted-foreground">{model.statusDescription}</p>
      </header>

      {message ? <SuccessPanel>{message}</SuccessPanel> : null}
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Cost and context</ForgeSectionTitle>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <DetailRow label="Category" value={model.categoryLabel} />
              <DetailRow label="Amount" value={model.amountLabel} />
              <DetailRow label="Tax" value={model.taxLabel} />
              <DetailRow label="Total cost" value={model.totalCostLabel} />
              <DetailRow label="Purchase date" value={model.dateLabel} />
              <DetailRow label="Vendor" value={model.vendor} />
              <DetailRow label="Payment method" value={model.paymentMethodLabel} />
              <DetailRow label="Customer" value={model.customerName} />
              <DetailRow label="Property" value={model.propertyLabel} />
            </dl>
            <Button asChild variant="outline" className="min-h-11 rounded-xl font-bold">
              <Link href={model.jobHref}>
                <Briefcase className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Open {model.jobLabel}
              </Link>
            </Button>
          </ForgeCard>

          <ForgeCard className="space-y-3">
            <ForgeSectionTitle>Billing treatment</ForgeSectionTitle>
            <BillingBadge label={model.billingTreatmentLabel} />
            <p className="text-sm text-muted-foreground">{model.billingTreatmentNote}</p>
            <p className="flex items-start gap-1.5 rounded-lg bg-blue-500/10 px-2.5 py-2 text-xs font-semibold text-blue-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Expenses track cost. Invoices track customer charges. This page never copies cost into customer billing automatically.
            </p>
            {model.approvalComment ? (
              <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-foreground">
                <span className="font-bold">Review comment: </span>
                {model.approvalComment}
              </p>
            ) : null}
          </ForgeCard>

          <ForgeCard className="space-y-3">
            <ForgeSectionTitle>Customer-visible vs internal</ForgeSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  Customer-visible
                </p>
                <p className="mt-1.5 text-sm text-foreground">{model.customerVisibleDescription || 'Not projected to the customer.'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  Internal notes
                </p>
                <p className="mt-1.5 text-sm text-foreground">{model.internalNotes}</p>
              </div>
            </div>
          </ForgeCard>

          <ForgeCard className="space-y-3">
            <ForgeSectionTitle>Receipt</ForgeSectionTitle>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                {model.hasReceipt ? <Paperclip className="h-5 w-5" aria-hidden="true" /> : <Receipt className="h-5 w-5" aria-hidden="true" />}
              </div>
              <div>
                <p className="font-bold text-foreground">{model.receiptLabel}</p>
                <p className="text-sm text-muted-foreground">
                  Receipt upload remains tied to Premier Vault. This batch links existing vault receipt IDs but does not add upload UI.
                </p>
              </div>
            </div>
          </ForgeCard>

          <ForgeCard className="space-y-3">
            <ForgeSectionTitle>Activity</ForgeSectionTitle>
            {result.data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {result.data.activity.map((entry) => (
                  <li key={entry.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">{entry.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatActivityDate(entry.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </ForgeCard>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
          <ForgeCard className="space-y-4">
            <ForgeSectionTitle>Actions</ForgeSectionTitle>
            {canSubmit ? (
              <form action={submitExpenseAction}>
                <input type="hidden" name="expenseId" value={expenseId} />
                <Button type="submit" className="w-full min-h-11 rounded-xl font-bold">Submit for review</Button>
              </form>
            ) : null}

            {canReview ? (
              <form action={approveExpenseAction} className="space-y-3 rounded-xl border bg-muted/30 p-3">
                <input type="hidden" name="expenseId" value={expenseId} />
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Billing treatment</span>
                  <select name="billingTreatment" defaultValue={result.data.expense.billing_treatment} className={FIELD_INPUT_CLASS}>
                    {BILLING_TREATMENTS.map((treatment) => (
                      <option key={treatment} value={treatment}>
                        {getBillingTreatmentLabel(treatment)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Customer charge</span>
                  <input name="customerChargeAmount" type="number" min="0" step="0.01" defaultValue={result.data.expense.customer_charge_amount ?? ''} className={FIELD_INPUT_CLASS} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Approval comment</span>
                  <textarea name="approvalComment" rows={3} className={FIELD_INPUT_CLASS} />
                </label>
                <Button type="submit" className="w-full min-h-11 rounded-xl font-bold">Approve expense</Button>
              </form>
            ) : null}

            {canReview ? (
              <form action={rejectExpenseAction} className="space-y-3 rounded-xl border bg-muted/30 p-3">
                <input type="hidden" name="expenseId" value={expenseId} />
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rejection comment</span>
                  <textarea name="rejectionComment" rows={3} required className={FIELD_INPUT_CLASS} />
                </label>
                <Button type="submit" variant="outline" className="w-full min-h-11 rounded-xl font-bold">Reject expense</Button>
              </form>
            ) : null}

            {canVoid ? (
              <form action={voidExpenseAction}>
                <input type="hidden" name="expenseId" value={expenseId} />
                <Button type="submit" variant="outline" className="w-full min-h-11 rounded-xl font-bold text-red-700">Void expense</Button>
              </form>
            ) : null}

            {!canSubmit && !canReview && !canVoid ? (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                No actions are available for this expense state and role.
              </p>
            ) : null}
          </ForgeCard>

          <ForgeCard className="space-y-3">
            <ForgeSectionTitle>Invoice readiness</ForgeSectionTitle>
            <p className="text-2xl font-bold text-foreground">
              {result.data.expense.customer_charge_amount ? formatMoney(result.data.expense.customer_charge_amount) : '$0.00'}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.data.invoice
                ? `Linked to ${result.data.invoice.invoiceNumber}.`
                : model.status === 'ready_to_invoice'
                  ? 'Ready for a future invoice builder handoff.'
                  : 'Not ready for invoicing.'}
            </p>
            {model.invoiceHref ? (
              <Button asChild variant="outline" className="w-full min-h-11 rounded-xl font-bold">
                <Link href={model.invoiceHref}>Open invoice</Link>
              </Button>
            ) : null}
          </ForgeCard>
        </aside>
      </div>
    </ForgePage>
  );
}

const FIELD_INPUT_CLASS =
  'min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function BillingBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      {label}
    </span>
  );
}

function SuccessPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
      {children}
    </p>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
      {children}
    </p>
  );
}

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
