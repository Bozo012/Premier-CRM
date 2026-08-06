'use client';
// Client component: needs local state to gate submit behind a soft dedupe
// check (email lookup before the real create), plus useTransition/toast.

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { CustomerEmailMatch } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { checkCustomerEmailAction, createCustomerAction } from '../actions';

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<CustomerEmailMatch | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  async function submitCreate(formData: FormData) {
    const result = await createCustomerAction(null, formData);
    if (result.success) {
      toast.success('Customer created.');
      router.push(`/customers/${result.data.id}`);
    } else {
      const message = result.error ?? 'Could not create the customer. Please try again.';
      setError(message);
      toast.error(message);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();

    // Soft dedupe: only checked once per submit attempt — "Create anyway"
    // resubmits the same captured FormData, skipping the check entirely.
    if (email) {
      startTransition(async () => {
        const result = await checkCustomerEmailAction(email);
        if (result.success && result.data) {
          setDuplicateMatch(result.data);
          setPendingFormData(formData);
          return;
        }
        await submitCreate(formData);
      });
      return;
    }

    startTransition(async () => {
      await submitCreate(formData);
    });
  }

  function handleCreateAnyway() {
    const formData = pendingFormData;
    setDuplicateMatch(null);
    setPendingFormData(null);
    if (!formData) return;
    startTransition(async () => {
      await submitCreate(formData);
    });
  }

  if (duplicateMatch) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-base">A customer with this email already exists</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-background p-3">
            <p className="font-medium text-foreground">{duplicateMatch.displayName}</p>
            <p className="text-sm text-muted-foreground">
              {[duplicateMatch.email, duplicateMatch.phonePrimary].filter(Boolean).join(' · ') ||
                'No additional contact details'}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Creating a new customer anyway will split any future jobs, quotes, and
            invoices across two separate records for this person.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/customers/${duplicateMatch.id}`}>View existing customer</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleCreateAnyway}
              className="text-red-600 hover:text-red-700"
            >
              {isPending ? 'Creating…' : 'Create anyway'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setDuplicateMatch(null);
                setPendingFormData(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </form>
  );
}
