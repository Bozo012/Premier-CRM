'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { createChangeOrderDraftAction, type CreateChangeOrderDraftActionState } from '../actions';

export function ChangeOrderDraftForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    CreateChangeOrderDraftActionState | null,
    FormData
  >(createChangeOrderDraftAction, null);

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
        const description = String(formData.get('description') ?? '').trim();
        const quantity = Number(formData.get('quantity') ?? 1);
        const unitPrice = Number(formData.get('unitPrice') ?? 0);
        const kind = String(formData.get('kind') ?? 'labor');

        const submission = new FormData();
        submission.append('jobId', jobId);
        submission.append('reason', String(formData.get('reason') ?? ''));
        submission.append('scopeChangeSummary', String(formData.get('scopeChangeSummary') ?? ''));
        submission.append(
          'lineItemsJson',
          JSON.stringify([{ kind, description, quantity, unitPrice }])
        );

        startTransition(() => formAction(submission));
      }}
      className="space-y-2 rounded-md border p-3"
    >
      <p className="text-sm font-medium text-foreground">Draft a change order</p>
      <label className="block text-xs text-muted-foreground" htmlFor="reason">
        Reason
      </label>
      <input id="reason" name="reason" className="w-full rounded-md border px-3 py-2 text-sm" required />
      <label className="block text-xs text-muted-foreground" htmlFor="scopeChangeSummary">
        Scope change summary
      </label>
      <input id="scopeChangeSummary" name="scopeChangeSummary" className="w-full rounded-md border px-3 py-2 text-sm" />
      <div className="grid grid-cols-4 gap-2">
        <select name="kind" defaultValue="labor" className="rounded-md border px-2 py-2 text-sm" aria-label="Line item kind">
          <option value="labor">Labor</option>
          <option value="material">Material</option>
          <option value="credit">Credit</option>
          <option value="other">Other</option>
        </select>
        <input
          name="description"
          placeholder="Line item description"
          className="col-span-2 rounded-md border px-2 py-2 text-sm"
          required
          aria-label="Line item description"
        />
        <input
          name="quantity"
          type="number"
          step="0.01"
          defaultValue="1"
          className="rounded-md border px-2 py-2 text-sm"
          aria-label="Line item quantity"
        />
      </div>
      <label className="block text-xs text-muted-foreground" htmlFor="unitPrice">
        Unit price ($)
      </label>
      <input
        id="unitPrice"
        name="unitPrice"
        type="number"
        step="0.01"
        min="0"
        defaultValue="0"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Saving draft…' : 'Save draft change order'}
      </Button>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
