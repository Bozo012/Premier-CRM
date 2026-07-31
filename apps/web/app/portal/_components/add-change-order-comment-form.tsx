'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import {
  addChangeOrderCommentAction,
  type AddChangeOrderCommentActionState,
} from '../change-orders/actions';

export function AddChangeOrderCommentForm({ changeOrderId }: { changeOrderId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    AddChangeOrderCommentActionState | null,
    FormData
  >(addChangeOrderCommentAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const submission = new FormData();
        submission.append('changeOrderId', changeOrderId);
        submission.append('body', String(formData.get('body') ?? ''));
        startTransition(() => formAction(submission));
        form.reset();
      }}
      className="flex gap-2"
    >
      <input
        name="body"
        placeholder="Add a comment…"
        className="flex-1 rounded-md border px-3 py-2 text-sm"
        aria-label="Comment"
        required
      />
      <Button type="submit" disabled={isPending} variant="outline" size="sm">
        {isPending ? 'Posting…' : 'Post'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
