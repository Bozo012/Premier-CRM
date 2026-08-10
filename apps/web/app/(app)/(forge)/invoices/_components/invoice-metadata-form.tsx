// "use client" — needs useActionState for server action feedback
'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { updateInvoiceMetadataAction, type UpdateInvoiceMetadataActionState } from '../actions';

interface InvoiceMetadataFormProps {
  invoiceId: string;
  currentTitle: string | null;
  currentKind: string;
  currentIssuedDate: string;
  currentDueDate: string | null;
  currentDiscountAmount: number | null;
  currentTaxPct: number | null;
  currentNotes: string | null;
  currentTerms: string | null;
}

const KIND_OPTIONS = [
  { label: 'Standalone', value: 'standalone' },
  { label: 'Deposit', value: 'deposit' },
  { label: 'Progress', value: 'progress' },
  { label: 'Final', value: 'final' },
];

export function InvoiceMetadataForm({
  invoiceId,
  currentTitle,
  currentKind,
  currentIssuedDate,
  currentDueDate,
  currentDiscountAmount,
  currentTaxPct,
  currentNotes,
  currentTerms,
}: InvoiceMetadataFormProps) {
  const [state, formAction, isPending] = useActionState<
    UpdateInvoiceMetadataActionState | null,
    FormData
  >(updateInvoiceMetadataAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success('Invoice details saved.');
    } else if (state && !state.success) {
      toast.error(state.error ?? 'Could not save invoice details. Please try again.');
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="im-title">Title</Label>
              <Input
                id="im-title"
                name="title"
                defaultValue={currentTitle ?? ''}
                placeholder="Invoice title (auto-generated if blank)"
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="im-kind">Kind</Label>
              <select
                id="im-kind"
                name="kind"
                defaultValue={currentKind}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="im-issued-date">Issued date</Label>
              <Input id="im-issued-date" name="issuedDate" type="date" defaultValue={currentIssuedDate} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="im-due-date">Due date</Label>
              <Input id="im-due-date" name="dueDate" type="date" defaultValue={currentDueDate ?? ''} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="im-discount">Discount ($)</Label>
              <Input
                id="im-discount"
                name="discountAmount"
                type="number"
                min="0"
                max="999999"
                step="0.01"
                defaultValue={currentDiscountAmount ?? 0}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="im-tax">Tax rate (%)</Label>
              <Input
                id="im-tax"
                name="taxPct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={currentTaxPct ?? 0}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im-notes">Notes</Label>
            <textarea
              id="im-notes"
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={currentNotes ?? ''}
              placeholder="Optional note shown to the customer"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im-terms">Terms</Label>
            <textarea
              id="im-terms"
              name="terms"
              rows={3}
              maxLength={2000}
              defaultValue={currentTerms ?? ''}
              placeholder="Optional payment terms shown to the customer"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
            {state?.success ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
            {state && !state.success ? (
              <span className="text-sm text-red-600">{state.error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
