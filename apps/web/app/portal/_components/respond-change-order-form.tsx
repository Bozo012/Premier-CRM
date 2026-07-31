'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import {
  respondToChangeOrderAction,
  type RespondToChangeOrderActionState,
} from '../change-orders/actions';

export function RespondToChangeOrderForm({
  revisionId,
  acknowledgmentVersion,
}: {
  revisionId: string;
  acknowledgmentVersion: string | null;
}) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    RespondToChangeOrderActionState | null,
    FormData
  >(respondToChangeOrderAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  function respond(response: 'approved' | 'declined' | 'revision_requested', note: string) {
    const formData = new FormData();
    formData.append('revisionId', revisionId);
    formData.append('response', response);
    formData.append('decisionNote', note);
    if (acknowledgmentVersion) formData.append('acknowledgmentVersion', acknowledgmentVersion);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => respond('approved', '')}
        >
          {isPending ? 'Submitting…' : 'Approve'}
        </Button>
        <Button
          type="button"
          disabled={isPending}
          variant="outline"
          onClick={() => respond('declined', '')}
        >
          Decline
        </Button>
        <Button
          type="button"
          disabled={isPending}
          variant="ghost"
          onClick={() => respond('revision_requested', 'Please revise and resend.')}
        >
          Request a revision
        </Button>
      </div>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}
