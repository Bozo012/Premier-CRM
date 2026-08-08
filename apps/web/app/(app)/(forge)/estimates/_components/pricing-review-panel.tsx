'use client';

// Client component: pricing review handoff (submit -> owner reviews ->
// approve/return-for-changes -> resubmit) + gated quote creation.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  approveEstimatePricingAction,
  reopenEstimateForEditAction,
  requestEstimatePricingReviewAction,
  returnEstimatePricingForChangesAction,
  createQuoteFromEstimateWorkflowAction,
} from '@/app/(app)/(forge)/site-visits/actions';

interface PricingReviewPanelProps {
  estimateId: string;
  pricingReviewedAt: string | null;
  pricingReviewStatus: 'pending_review' | 'changes_requested' | null;
  pricingReviewRequestedAt: string | null;
  pricingReviewRequestedByName: string | null;
  pricingReviewChangesRequestedNote: string | null;
  /** owner/admin — can approve pricing directly and return a pending review for changes. */
  canApprovePricing: boolean;
  /** owner/admin/employee/subcontractor — can submit/resubmit for pricing review. */
  canEditEstimate: boolean;
}

export function PricingReviewPanel({
  estimateId,
  pricingReviewedAt,
  pricingReviewStatus,
  pricingReviewRequestedAt,
  pricingReviewRequestedByName,
  pricingReviewChangesRequestedNote,
  canApprovePricing,
  canEditEstimate,
}: PricingReviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnNote, setReturnNote] = useState('');

  const runAction = (
    action: (prevState: null, formData: FormData) => Promise<{ success: boolean; error?: string }>,
    formData: FormData,
    successMessage: string
  ) => {
    startTransition(async () => {
      const result = await action(null, formData);
      if (result.success) {
        toast.success(successMessage);
        setShowReturnForm(false);
        setReturnNote('');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong.');
      }
    });
  };

  const handleApprove = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    runAction(approveEstimatePricingAction, fd, 'Pricing approved.');
  };

  const handleReopen = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    runAction(reopenEstimateForEditAction, fd, 'Estimate reopened for editing.');
  };

  const handleSubmitForReview = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    runAction(requestEstimatePricingReviewAction, fd, 'Submitted for pricing review.');
  };

  const handleReturnForChanges = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    fd.set('note', returnNote);
    runAction(returnEstimatePricingForChangesAction, fd, 'Sent back for changes.');
  };

  const handleCreateQuote = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    startTransition(async () => {
      const result = await createQuoteFromEstimateWorkflowAction(null, fd);
      if (result.success) {
        toast.success('Draft quote created.');
        router.push(`/quotes/${result.data.quoteId}`);
      } else {
        toast.error(result.error ?? 'Failed to create quote.');
      }
    });
  };

  const badge = pricingReviewedAt
    ? { label: 'Approved', className: 'bg-emerald-50 text-emerald-700' }
    : pricingReviewStatus === 'pending_review'
      ? { label: 'Pending review', className: 'bg-amber-50 text-amber-700' }
      : pricingReviewStatus === 'changes_requested'
        ? { label: 'Changes requested', className: 'bg-orange-50 text-orange-700' }
        : { label: 'Draft', className: 'bg-slate-100 text-slate-600' };

  return (
    <section className="space-y-3 rounded-md border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pricing review</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
      </div>

      {pricingReviewedAt ? <p className="text-xs text-muted-foreground">Approved {formatDateTime(pricingReviewedAt)}</p> : null}

      {/* Pending review, owner/admin view: who submitted + Approve/Return controls. */}
      {!pricingReviewedAt && pricingReviewStatus === 'pending_review' && canApprovePricing ? (
        <p className="text-xs text-muted-foreground">
          Submitted for review{pricingReviewRequestedByName ? ` by ${pricingReviewRequestedByName}` : ''}
          {pricingReviewRequestedAt ? ` on ${formatDateTime(pricingReviewRequestedAt)}` : ''}.
        </p>
      ) : null}

      {/* Pending review, employee/subcontractor view: waiting status, no actionable control. */}
      {!pricingReviewedAt && pricingReviewStatus === 'pending_review' && !canApprovePricing ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Submitted for pricing review</p>
          <p className="mt-0.5">
            {pricingReviewRequestedAt ? `Submitted ${formatDateTime(pricingReviewRequestedAt)}. ` : ''}
            Waiting for an owner or administrator to review pricing before a quote can be created.
          </p>
        </div>
      ) : null}

      {/* Draft, no review requested yet, employee/subcontractor without approval rights. */}
      {!pricingReviewedAt && !pricingReviewStatus && !canApprovePricing && canEditEstimate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Waiting for owner approval</p>
          <p className="mt-0.5">
            Pricing must be approved by an owner or administrator before this quote can be created. Submit this
            estimate for review when it&apos;s ready.
          </p>
        </div>
      ) : null}

      {/* Changes requested: show the note to whoever can see it. */}
      {!pricingReviewedAt && pricingReviewStatus === 'changes_requested' ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <p className="font-medium">Changes requested</p>
          {pricingReviewChangesRequestedNote ? <p className="mt-0.5 whitespace-pre-wrap">{pricingReviewChangesRequestedNote}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!pricingReviewedAt && canApprovePricing ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Approve pricing
          </button>
        ) : null}

        {!pricingReviewedAt && pricingReviewStatus === 'pending_review' && canApprovePricing ? (
          <button
            type="button"
            onClick={() => setShowReturnForm((v) => !v)}
            disabled={isPending}
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Return for changes
          </button>
        ) : null}

        {!pricingReviewedAt && !pricingReviewStatus && !canApprovePricing && canEditEstimate ? (
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Submit for pricing review
          </button>
        ) : null}

        {!pricingReviewedAt && pricingReviewStatus === 'changes_requested' && !canApprovePricing && canEditEstimate ? (
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Resubmit for pricing review
          </button>
        ) : null}

        {pricingReviewedAt && canApprovePricing ? (
          <button
            type="button"
            onClick={handleReopen}
            disabled={isPending}
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Reopen for edit
          </button>
        ) : null}
        {pricingReviewedAt ? (
          <button
            type="button"
            onClick={handleCreateQuote}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Create quote
          </button>
        ) : null}
      </div>

      {showReturnForm ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <label htmlFor="returnNote" className="text-xs font-medium text-muted-foreground">
            What needs to change?
          </label>
          <textarea
            id="returnNote"
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="e.g. Labor hours look high for this scope — please double-check before resubmitting."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReturnForChanges}
              disabled={isPending || returnNote.trim().length === 0}
              className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {isPending ? 'Sending…' : 'Send back for changes'}
            </button>
            <button
              type="button"
              onClick={() => setShowReturnForm(false)}
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!pricingReviewedAt && canApprovePricing ? (
        <p className="text-xs text-muted-foreground">A quote cannot be created until pricing is approved.</p>
      ) : null}
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
