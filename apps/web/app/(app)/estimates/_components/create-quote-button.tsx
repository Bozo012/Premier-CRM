'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { createQuoteFromEstimateAction, type CreateQuoteFromEstimateActionState } from '../actions';

interface CreateQuoteButtonProps {
  estimateId: string;
  estimateTitle: string;
}

export function CreateQuoteButton({ estimateId, estimateTitle }: CreateQuoteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CreateQuoteFromEstimateActionState | null,
    FormData
  >(createQuoteFromEstimateAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Draft quote created.');
      router.push(`/quotes/${state.data.quoteId}`);
    } else {
      toast.error(state.error ?? 'Failed to create quote.');
      setConfirming(false);
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
      >
        Approve → create quote
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => !isPending && setConfirming(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-t-lg bg-background p-6 shadow-lg sm:rounded-lg"
          >
            <h2 className="text-base font-semibold text-foreground">Approve this estimate?</h2>
            <p className="text-sm text-muted-foreground">
              This creates a <span className="font-medium text-foreground">draft quote</span> for{' '}
              <span className="font-medium text-foreground">{estimateTitle}</span>, carrying over
              the customer, property, and description, and marks the estimate{' '}
              <span className="font-medium text-foreground">Quoted</span>. Nothing is sent to the
              customer yet — you&apos;ll add line items and pricing before sending.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <form action={formAction}>
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="title" value={estimateTitle} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? 'Creating…' : 'Approve & build quote'}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
