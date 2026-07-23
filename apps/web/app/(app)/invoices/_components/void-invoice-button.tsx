// "use client" — needs useActionState + confirmation before an irreversible-feeling action
'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { voidInvoiceAction, type VoidInvoiceActionState } from '../actions';

interface VoidInvoiceButtonProps {
  invoiceId: string;
  status: string;
}

const VOIDABLE_STATUSES = new Set(['draft', 'sent', 'viewed', 'partially_paid', 'overdue']);

export function VoidInvoiceButton({ invoiceId, status }: VoidInvoiceButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const [state, formAction, isPending] = useActionState<
    VoidInvoiceActionState | null,
    FormData
  >(async (prev, formData) => {
    const result = await voidInvoiceAction(prev, formData);
    if (result.success) {
      toast.success('Invoice voided.');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Could not void invoice. Please try again.');
    }
    return result;
  }, null);

  if (!VOIDABLE_STATUSES.has(status)) {
    return null;
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => setConfirming(true)}
      >
        Void invoice
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-sm text-muted-foreground">
        Voiding blocks any further payments against this invoice. This cannot be undone. Are
        you sure?
      </p>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending}
          className="text-red-600 hover:text-red-700"
        >
          {isPending ? 'Voiding…' : 'Confirm void'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {state && !state.success ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
