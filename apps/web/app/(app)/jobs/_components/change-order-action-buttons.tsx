'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import {
  proposeChangeOrderAction,
  withdrawChangeOrderAction,
  type ProposeChangeOrderActionState,
  type WithdrawChangeOrderActionState,
} from '../actions';

export function ProposeChangeOrderButton({ jobId, revisionId }: { jobId: string; revisionId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    ProposeChangeOrderActionState | null,
    FormData
  >(proposeChangeOrderAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('revisionId', revisionId);
        formData.append('jobId', jobId);
        startTransition(() => formAction(formData));
      }}
      className="inline"
    >
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? 'Proposing…' : 'Propose to customer'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function WithdrawChangeOrderButton({ jobId, revisionId }: { jobId: string; revisionId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    WithdrawChangeOrderActionState | null,
    FormData
  >(withdrawChangeOrderAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('revisionId', revisionId);
        formData.append('jobId', jobId);
        startTransition(() => formAction(formData));
      }}
      className="inline"
    >
      <Button type="submit" disabled={isPending} variant="ghost" size="sm">
        {isPending ? 'Withdrawing…' : 'Withdraw'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
