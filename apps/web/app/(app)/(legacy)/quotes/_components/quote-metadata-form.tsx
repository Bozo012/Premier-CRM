// "use client" — needs useActionState for server action feedback
'use client';

import { useActionState } from 'react';
import { toast } from 'sonner';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  updateQuoteMetadataAction,
  type UpdateQuoteMetadataActionState,
} from '../actions';

interface QuoteMetadataFormProps {
  quoteId: string;
  currentTitle: string | null;
  currentValidUntil: string | null;
  currentDiscountAmount: number | null;
  currentTaxPct: number | null;
  currentIntroText: string | null;
  currentOutroText: string | null;
}

export function QuoteMetadataForm({
  quoteId,
  currentTitle,
  currentValidUntil,
  currentDiscountAmount,
  currentTaxPct,
  currentIntroText,
  currentOutroText,
}: QuoteMetadataFormProps) {
  const [state, formAction, isPending] = useActionState<
    UpdateQuoteMetadataActionState | null,
    FormData
  >(updateQuoteMetadataAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success('Quote details saved.');
    } else if (state && !state.success) {
      toast.error(state.error ?? 'Could not save quote details. Please try again.');
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="quoteId" value={quoteId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qm-title">Title</Label>
              <Input
                id="qm-title"
                name="title"
                defaultValue={currentTitle ?? ''}
                placeholder="Quote title (auto-generated if blank)"
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qm-valid-until">Valid until</Label>
              <Input
                id="qm-valid-until"
                name="validUntil"
                type="date"
                defaultValue={currentValidUntil ?? ''}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qm-discount">Discount ($)</Label>
              <Input
                id="qm-discount"
                name="discountAmount"
                type="number"
                min="0"
                max="999999"
                step="0.01"
                defaultValue={currentDiscountAmount ?? 0}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qm-tax">Tax rate (%)</Label>
              <Input
                id="qm-tax"
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
            <Label htmlFor="qm-intro">Intro text</Label>
            <textarea
              id="qm-intro"
              name="introText"
              rows={3}
              maxLength={2000}
              defaultValue={currentIntroText ?? ''}
              placeholder="Optional opening note shown to the customer"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qm-outro">Outro text</Label>
            <textarea
              id="qm-outro"
              name="outroText"
              rows={3}
              maxLength={2000}
              defaultValue={currentOutroText ?? ''}
              placeholder="Optional closing note shown to the customer"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
            {state?.success ? (
              <span className="text-sm text-muted-foreground">Saved.</span>
            ) : null}
            {state && !state.success ? (
              <span className="text-sm text-red-600">{state.error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
