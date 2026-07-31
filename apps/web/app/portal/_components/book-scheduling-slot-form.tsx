'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { bookSchedulingSlotAction, type BookSchedulingSlotActionState } from '../scheduling/actions';

export function BookSchedulingSlotForm({
  jobId,
  slotId,
  label,
}: {
  jobId: string;
  slotId: string;
  label: string;
}) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    BookSchedulingSlotActionState | null,
    FormData
  >(bookSchedulingSlotAction, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('slotId', slotId);
        formData.append('jobId', jobId);
        startTransition(() => formAction(formData));
      }}
      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
    >
      <span className="text-sm">{label}</span>
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? 'Booking…' : 'Book this time'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
