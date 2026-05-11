'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { createQuoteFromEstimateAction, type CreateQuoteFromEstimateActionState } from '../actions';

interface CreateQuoteButtonProps {
  estimateId: string;
  estimateTitle: string;
}

export function CreateQuoteButton({ estimateId, estimateTitle }: CreateQuoteButtonProps) {
  const router = useRouter();
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
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="estimateId" value={estimateId} />
      <input type="hidden" name="title" value={estimateTitle} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create quote'}
      </button>
    </form>
  );
}
