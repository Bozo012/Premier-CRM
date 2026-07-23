'use client';
// Client component: needs useActionState for the create-customer form and toast feedback.

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createCustomerAction, type CreateCustomerActionState } from '../actions';

const TYPE_OPTIONS = [
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Property manager', value: 'property_manager' },
];

const CHANNEL_OPTIONS = [
  { label: 'Text (SMS)', value: 'sms' },
  { label: 'Email', value: 'email' },
  { label: 'Phone call', value: 'call' },
];

export function NewCustomerForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    CreateCustomerActionState | null,
    FormData
  >(createCustomerAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success('Customer created.');
      router.push(`/customers/${state.data.id}`);
    } else if (state && !state.success) {
      toast.error(state.error ?? 'Could not create the customer. Please try again.');
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Type</h2>
        <div className="space-y-1.5">
          <Label htmlFor="new-customer-type">Customer type</Label>
          <select
            id="new-customer-type"
            name="type"
            defaultValue="residential"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Name</h2>
        <p className="text-xs text-muted-foreground">
          Enter a person&apos;s name, a company name, or both.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-customer-firstName">First name</Label>
            <Input id="new-customer-firstName" name="firstName" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-customer-lastName">Last name</Label>
            <Input id="new-customer-lastName" name="lastName" maxLength={120} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-customer-companyName">Company name</Label>
          <Input id="new-customer-companyName" name="companyName" maxLength={200} />
        </div>
      </section>

      <section className="space-y-4 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Contact</h2>

        <div className="space-y-1.5">
          <Label htmlFor="new-customer-email">Email</Label>
          <Input id="new-customer-email" name="email" type="email" placeholder="jane@example.com" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-customer-phonePrimary">Primary phone</Label>
            <Input id="new-customer-phonePrimary" name="phonePrimary" type="tel" maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-customer-phoneSecondary">Secondary phone</Label>
            <Input id="new-customer-phoneSecondary" name="phoneSecondary" type="tel" maxLength={30} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-customer-preferredChannel">Preferred contact method</Label>
          <select
            id="new-customer-preferredChannel"
            name="preferredChannel"
            defaultValue="sms"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-1.5 rounded-md border bg-background p-4">
        <Label htmlFor="new-customer-notes">Notes</Label>
        <textarea
          id="new-customer-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="Optional internal notes"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create customer'}
        </Button>
        {state && !state.success ? (
          <span className="text-sm text-red-600">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
