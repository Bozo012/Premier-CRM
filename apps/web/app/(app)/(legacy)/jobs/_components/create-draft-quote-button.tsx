'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import {
  createDraftQuoteAction,
  type CreateDraftQuoteActionState,
} from '../actions';

function appendFormValue(formData: FormData, key: string, value: unknown) {
  if (value === null || value === undefined) {
    formData.append(key, '');
    return;
  }

  formData.append(key, String(value));
}

export function CreateDraftQuoteButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    CreateDraftQuoteActionState | null,
    FormData
  >(createDraftQuoteAction, null);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    router.push(`/quotes/${state.data.quoteId}`);
    router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const nextFormData = new FormData();
        appendFormValue(nextFormData, 'jobId', jobId);

        startTransition(() => {
          formAction(nextFormData);
        });
      }}
      className="space-y-2"
    >
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating draft…' : 'Create draft quote'}
      </Button>
      {state && !state.success ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
