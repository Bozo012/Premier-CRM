'use client';
// Needs useActionState for server action feedback and router.push on success.

import { useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { approveJobAction, type ApproveJobActionState } from '../actions';

export function ApproveJobButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    ApproveJobActionState | null,
    FormData
  >(approveJobAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success('Job marked as approved.');
      router.push(`/jobs/${state.data.jobId}`);
    } else {
      toast.error(state.error ?? 'Could not approve job.');
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Approving…' : 'Approve job'}
      </button>
    </form>
  );
}
