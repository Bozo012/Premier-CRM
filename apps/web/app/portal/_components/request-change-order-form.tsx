'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { requestChangeOrderAction, type RequestChangeOrderActionState } from '../change-orders/actions';

export function RequestChangeOrderForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    RequestChangeOrderActionState | null,
    FormData
  >(requestChangeOrderAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-2"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <label className="block text-xs text-muted-foreground" htmlFor={`reason-${jobId}`}>
        Request additional or different work
      </label>
      <input
        id={`reason-${jobId}`}
        name="reason"
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Describe what you'd like changed…"
        required
      />
      <p className="text-xs text-muted-foreground">
        This is a request only — it has no effect until Premier formally proposes it back to you for approval.
      </p>
      <Button type="submit" disabled={isPending} variant="outline" size="sm">
        {isPending ? 'Sending…' : 'Send request'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
