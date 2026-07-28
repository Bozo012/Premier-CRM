'use client';

import { useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  createJobFromRequestAction,
  type CreateJobFromRequestActionState,
} from '../actions';

interface CreateJobButtonProps {
  requestId: string;
}

export function CreateJobButton({ requestId }: CreateJobButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    CreateJobFromRequestActionState | null,
    FormData
  >(createJobFromRequestAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Work order created.');
      router.push(`/jobs/${state.data.jobId}`);
    } else {
      toast.error(state.error ?? 'Could not create work order.');
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Creating work order…' : 'Create work order'}
      </button>
    </form>
  );
}
