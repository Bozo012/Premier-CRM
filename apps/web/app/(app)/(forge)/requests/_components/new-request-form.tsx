'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createManualRequestAction } from '../actions';

const PROPERTY_TYPE_OPTIONS = [
  { label: 'Single-family', value: 'single_family' },
  { label: 'Rental house', value: 'rental_house' },
  { label: 'Rental unit', value: 'rental_unit' },
  { label: 'Multi-family', value: 'multi_family' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Other', value: 'other' },
];

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Emergency', value: 'emergency' },
];

const CHANNEL_OPTIONS = [
  { label: 'Text (SMS)', value: 'sms' },
  { label: 'Email', value: 'email' },
  { label: 'Phone call', value: 'call' },
  { label: 'Portal', value: 'portal' },
];

export function NewRequestForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createManualRequestAction(null, formData);
      if (result.success) {
        toast.success('Request created.');
        router.push(`/requests/${result.data.requestId}`);
        return;
      }

      const message = result.error ?? 'Could not create the request. Please try again.';
      setError(message);
      toast.error(message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Customer</h2>
          <p className="text-sm text-muted-foreground">
            Enter the contact details supplied by the caller or staff member.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-request-name">Name</Label>
            <Input id="new-request-name" name="name" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-preferredChannel">Preferred contact</Label>
            <select
              id="new-request-preferredChannel"
              name="preferredChannel"
              defaultValue="sms"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-email">Email</Label>
            <Input id="new-request-email" name="email" type="email" maxLength={320} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-phone">Phone</Label>
            <Input id="new-request-phone" name="phone" type="tel" maxLength={40} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Email or phone is required.</p>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Property</h2>
          <p className="text-sm text-muted-foreground">
            Forge will link to an existing matching property or create one from this address.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="new-request-addressLine1">Address</Label>
            <Input id="new-request-addressLine1" name="addressLine1" required maxLength={200} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="new-request-addressLine2">Address line 2</Label>
            <Input id="new-request-addressLine2" name="addressLine2" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-city">City</Label>
            <Input id="new-request-city" name="city" required maxLength={120} />
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-request-state">State</Label>
              <Input id="new-request-state" name="state" required maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-request-zip">ZIP</Label>
              <Input id="new-request-zip" name="zip" required maxLength={20} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-propertyType">Property type</Label>
            <select
              id="new-request-propertyType"
              name="propertyType"
              defaultValue="single_family"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PROPERTY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="country" value="US" />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Request</h2>
          <p className="text-sm text-muted-foreground">
            Capture the concern exactly enough for triage and follow-up.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-request-serviceTitle">Request title</Label>
            <Input id="new-request-serviceTitle" name="serviceTitle" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-serviceCategory">Service category</Label>
            <Input id="new-request-serviceCategory" name="serviceCategory" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-priority">Priority</Label>
            <select
              id="new-request-priority"
              name="priority"
              defaultValue="normal"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-request-preferredDate">Preferred date</Label>
            <Input id="new-request-preferredDate" name="preferredDate" type="date" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-request-preferredTime">Preferred time/window</Label>
          <Input id="new-request-preferredTime" name="preferredTime" maxLength={120} placeholder="Morning, after 2 PM, etc." />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-request-serviceDescription">Description</Label>
          <textarea
            id="new-request-serviceDescription"
            name="serviceDescription"
            required
            rows={5}
            maxLength={5000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-request-accessNotes">Access notes</Label>
          <textarea
            id="new-request-accessNotes"
            name="accessNotes"
            rows={3}
            maxLength={2000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending} className="rounded-xl font-bold">
          {isPending ? 'Creating…' : 'Create request'}
        </Button>
        {error ? <span className="text-sm font-medium text-red-600">{error}</span> : null}
      </div>
    </form>
  );
}
