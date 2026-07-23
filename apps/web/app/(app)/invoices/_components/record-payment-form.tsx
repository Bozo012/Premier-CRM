// "use client" — needs useActionState + local form state for the payment method select
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { recordPaymentAction, type RecordPaymentActionState } from '../actions';

interface RecordPaymentFormProps {
  invoiceId: string;
  amountDue: number;
}

const METHOD_OPTIONS = [
  { label: 'Card', value: 'card' },
  { label: 'ACH', value: 'ach' },
  { label: 'Check', value: 'check' },
  { label: 'Cash', value: 'cash' },
  { label: 'Venmo', value: 'venmo' },
  { label: 'Other', value: 'other' },
];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentForm({ invoiceId, amountDue }: RecordPaymentFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    RecordPaymentActionState | null,
    FormData
  >(recordPaymentAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success('Payment recorded.');
      router.refresh();
    } else if (state && !state.success) {
      toast.error(state.error ?? 'Could not record payment. Please try again.');
    }
  }, [state, router]);

  if (amountDue <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This invoice has no remaining balance.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount ($)</Label>
              <Input
                id="pay-amount"
                name="amount"
                type="number"
                min="0.01"
                max={amountDue}
                step="0.01"
                defaultValue={amountDue}
                required
              />
              <p className="text-xs text-muted-foreground">
                Amount due: {formatMoney(amountDue)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                name="method"
                defaultValue="card"
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Paid date</Label>
              <Input id="pay-date" name="paidAt" type="date" defaultValue={todayIsoDate()} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-reference">Reference (optional)</Label>
              <Input id="pay-reference" name="reference" maxLength={200} placeholder="Check #, transaction ID…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <textarea
              id="pay-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? 'Recording…' : 'Record payment'}
            </Button>
            {state && !state.success ? (
              <span className="text-sm text-red-600">{state.error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}
