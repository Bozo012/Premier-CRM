'use client';

// Client component: pricing approval/reopen buttons + gated quote creation.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  approveEstimatePricingAction,
  reopenEstimateForEditAction,
  createQuoteFromEstimateWorkflowAction,
} from '../../site-visits/actions';

interface PricingReviewPanelProps {
  estimateId: string;
  pricingReviewedAt: string | null;
}

export function PricingReviewPanel({ estimateId, pricingReviewedAt }: PricingReviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    startTransition(async () => {
      const result = await approveEstimatePricingAction(null, fd);
      if (result.success) {
        toast.success('Pricing approved.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to approve pricing.');
      }
    });
  };

  const handleReopen = () => {
    const fd = new FormData();
    fd.set('estimateId', estimateId);
    startTransition(async () => {
      const result = await reopenEstimateForEditAction(null, fd);
      if (result.success) {
        toast.success('Estimate reopened for editing.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to reopen estimate.');
      }
    });
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

  return (
    <section className="space-y-3 rounded-md border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pricing review</h2>
        {pricingReviewedAt ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Approved</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending approval</span>
        )}
      </div>

      {pricingReviewedAt ? (
        <p className="text-xs text-muted-foreground">Approved {formatDateTime(pricingReviewedAt)}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!pricingReviewedAt ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Approve pricing
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReopen}
            disabled={isPending}
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Reopen for edit
          </button>
        )}
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
      {!pricingReviewedAt ? (
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
