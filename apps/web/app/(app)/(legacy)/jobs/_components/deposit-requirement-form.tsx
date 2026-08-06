'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { setDepositRequirementAction, type SetDepositRequirementActionState } from '../actions';

export function DepositRequirementForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    SetDepositRequirementActionState | null,
    FormData
  >(setDepositRequirementAction, null);

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
      <label className="block text-sm font-medium text-foreground" htmlFor="requiredAmount">
        Required deposit amount ($)
      </label>
      <input
        id="requiredAmount"
        name="requiredAmount"
        type="number"
        step="0.01"
        min="0"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Saving…' : 'Require deposit'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
