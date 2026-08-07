'use client';
// Client component: local open/close state, server action dispatch, and
// router.refresh() after a successful create — the same real
// createPropertyForCustomerAction the pre-existing (now-unreferenced)
// properties-card.tsx used, just triggered from Customer Detail's
// Base44-ported secondaryActions slot instead of an inline toggle button.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createPropertyForCustomerAction } from '../actions';

const PROPERTY_TYPE_OPTIONS = [
  { label: 'Not set', value: '' },
  { label: 'Single family', value: 'single_family' },
  { label: 'Rental house', value: 'rental_house' },
  { label: 'Rental unit', value: 'rental_unit' },
  { label: 'Multi-family', value: 'multi_family' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Other', value: 'other' },
];

export function AddPropertyDialog({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('customerId', customerId);

    startTransition(async () => {
      const result = await createPropertyForCustomerAction(null, formData);
      if (result.success) {
        toast.success('Property added.');
        onOpenChange(false);
        router.refresh();
      } else {
        const message = result.error ?? 'Could not add the property. Please try again.';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-property-dialog-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-property-dialog-title" className="text-lg font-bold text-foreground">
            Add property
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="new-property-addressLine1">Street address</Label>
            <Input id="new-property-addressLine1" name="addressLine1" required maxLength={200} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-property-addressLine2">Unit / suite</Label>
            <Input id="new-property-addressLine2" name="addressLine2" maxLength={200} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-property-city">City</Label>
              <Input id="new-property-city" name="city" required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-property-state">State</Label>
              <Input id="new-property-state" name="state" required maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-property-zip">ZIP</Label>
              <Input id="new-property-zip" name="zip" required maxLength={20} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-property-propertyType">Property type</Label>
            <select
              id="new-property-propertyType"
              name="propertyType"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PROPERTY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-property-accessNotes">Access notes</Label>
            <textarea
              id="new-property-accessNotes"
              name="accessNotes"
              rows={2}
              maxLength={2000}
              placeholder="e.g. side gate, watch for dog"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add property'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
