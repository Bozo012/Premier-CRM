'use client';

import { useEffect, useActionState } from 'react';
import { toast } from 'sonner';

import {
  markRequestReviewedAction,
  type MarkRequestReviewedActionState,
} from '../actions';

interface MarkReviewedButtonProps {
  taskId: string;
}

export function MarkReviewedButton({ taskId }: MarkReviewedButtonProps) {
  const [state, formAction, isPending] = useActionState<
    MarkRequestReviewedActionState | null,
    FormData
  >(markRequestReviewedAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Marked as reviewed.');
    } else {
      toast.error(state.error ?? 'Could not mark as reviewed.');
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Mark as reviewed'}
      </button>
    </form>
  );
}
