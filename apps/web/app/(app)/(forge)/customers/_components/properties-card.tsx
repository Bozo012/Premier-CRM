'use client';
// Client component: needs local state to toggle the inline "add property"
// form and router.refresh() after a successful create.

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { Property } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface PropertiesCardProps {
  customerId: string;
  properties: Property[];
}

export function PropertiesCard({ customerId, properties }: PropertiesCardProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('customerId', customerId);

    startTransition(async () => {
      const result = await createPropertyForCustomerAction(null, formData);
      if (result.success) {
        toast.success('Property added.');
        setIsAdding(false);
        router.refresh();
      } else {
        const message = result.error ?? 'Could not add the property. Please try again.';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Properties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked properties yet.</p>
        ) : (
          <ul className="space-y-3">
            {properties.map((property) => (
              <li key={property.id} className="rounded-md border p-3">
                <Link
                  href={`/properties/${property.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {formatAddress(property)}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[property.property_type, formatGeofence(property.geofence_radius_m)]
                    .filter(Boolean)
                    .join(' · ') || 'No additional details'}
                </p>
              </li>
            ))}
          </ul>
        )}

        {isAdding ? (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3">
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="new-property-addressLine1">Street address</Label>
              <Input id="new-property-addressLine1" name="addressLine1" required maxLength={200} />
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

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? 'Adding…' : 'Add property'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setIsAdding(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            + Add property
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatAddress(property: Property): string {
  return `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`;
}

function formatGeofence(value: number | null | undefined): string {
  if (!value) return '';
  return `${Math.round(value)}m geofence`;
}
