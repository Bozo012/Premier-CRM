'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { createDepositInvoiceAction, type CreateDepositInvoiceActionState } from '../actions';

export function CreateDepositInvoiceButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<CreateDepositInvoiceActionState | null, FormData>(
    createDepositInvoiceAction,
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
        startTransition(() => formAction(formData));
      }}
    >
      <Button type="submit" disabled={isPending} variant="outline" size="sm">
        {isPending ? 'Creating…' : 'Create deposit invoice'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state && state.success ? (
        <p className="text-sm text-muted-foreground">
          Deposit invoice created —{' '}
          <a className="underline" href={`/invoices/${state.data.invoiceId}`}>
            view it
          </a>
          .
        </p>
      ) : null}
    </form>
  );
}
