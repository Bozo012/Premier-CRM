'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { createSchedulingSlotAction, type CreateSchedulingSlotActionState } from '../actions';

/** Staff-curated slots the customer portal can book — no arbitrary self-picked times. */
export function CreateSchedulingSlotForm() {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    CreateSchedulingSlotActionState | null,
    FormData
  >(createSchedulingSlotAction, null);

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
      className="space-y-2 rounded-md border p-3"
    >
      <p className="text-sm font-medium text-foreground">Publish an available slot</p>
      <label className="block text-xs text-muted-foreground" htmlFor="startsAt">
        Starts
      </label>
      <input
        id="startsAt"
        name="startsAt"
        type="datetime-local"
        required
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <label className="block text-xs text-muted-foreground" htmlFor="endsAt">
        Ends
      </label>
      <input
        id="endsAt"
        name="endsAt"
        type="datetime-local"
        required
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <label className="block text-xs text-muted-foreground" htmlFor="capacity">
        Capacity
      </label>
      <input
        id="capacity"
        name="capacity"
        type="number"
        min="1"
        defaultValue="1"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Publishing…' : 'Publish slot'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
