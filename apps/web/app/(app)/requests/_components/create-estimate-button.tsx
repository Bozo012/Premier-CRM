'use client';

import { useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  createEstimateFromRequestAction,
  type CreateEstimateFromRequestActionState,
} from '../actions';

interface CreateEstimateButtonProps {
  requestId: string;
}

export function CreateEstimateButton({ requestId }: CreateEstimateButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    CreateEstimateFromRequestActionState | null,
    FormData
  >(createEstimateFromRequestAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Inspection flow started.');
      router.push(`/estimates/${state.data.estimateId}`);
    } else {
      toast.error(state.error ?? 'Could not start inspection flow.');
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Starting flow…' : 'Start inspection flow'}
      </button>
    </form>
  );
}
