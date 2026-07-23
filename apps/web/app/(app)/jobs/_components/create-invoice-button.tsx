'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import {
  createInvoiceFromJobPageAction,
  type CreateInvoiceFromJobPageActionState,
} from '../actions';

function appendFormValue(formData: FormData, key: string, value: unknown) {
  if (value === null || value === undefined) {
    formData.append(key, '');
    return;
  }

  formData.append(key, String(value));
}

export function CreateInvoiceButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    CreateInvoiceFromJobPageActionState | null,
    FormData
  >(createInvoiceFromJobPageAction, null);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    router.push(`/invoices/${state.data.invoiceId}`);
    router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const nextFormData = new FormData();
        appendFormValue(nextFormData, 'jobId', jobId);
        appendFormValue(nextFormData, 'kind', 'standalone');

        startTransition(() => {
          formAction(nextFormData);
        });
      }}
      className="space-y-2"
    >
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Creating draft…' : 'Create invoice'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
