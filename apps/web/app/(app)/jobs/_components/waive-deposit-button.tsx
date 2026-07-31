'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { waiveDepositAction, type WaiveDepositActionState } from '../actions';

export function WaiveDepositButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<WaiveDepositActionState | null, FormData>(
    waiveDepositAction,
    null
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('jobId', jobId);
        formData.append('reason', 'Waived by staff');
        startTransition(() => formAction(formData));
      }}
    >
      <Button type="submit" disabled={isPending} variant="ghost" size="sm">
        {isPending ? 'Waiving…' : 'Waive deposit'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
