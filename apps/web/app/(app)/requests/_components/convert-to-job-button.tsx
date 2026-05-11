'use client';

import { useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  convertRequestToJobAction,
  type ConvertRequestToJobActionState,
} from '../actions';

interface ConvertToJobButtonProps {
  taskId: string;
}

export function ConvertToJobButton({ taskId }: ConvertToJobButtonProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    ConvertRequestToJobActionState | null,
    FormData
  >(convertRequestToJobAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Job created successfully.');
      router.push(`/jobs/${state.data.jobId}`);
    } else {
      toast.error(state.error ?? 'Could not convert request to job.');
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Creating job…' : 'Convert to job'}
      </button>
    </form>
  );
}
