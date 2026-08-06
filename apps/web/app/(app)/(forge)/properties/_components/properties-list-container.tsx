'use client'; // Wires the ported PropertiesList to router navigation (debounced search, filter, row-open).

// Layer 2 adapter — connects the portable, ported PropertiesList
// presentation component to real navigation, matching
// ../../customers/_components/customers-list-container.tsx. The properties
// list page is a server component that re-fetches from `listProperties`
// whenever `?q=`/`?status=`/`?type=` change.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef } from 'react';

import { PropertiesList } from './properties-list';
import type { PropertyListCallbacks, PropertyListModel } from '../_lib/forge-properties-contracts';

const SEARCH_DEBOUNCE_MS = 300;

export function PropertiesListContainer({ model }: { model: PropertyListModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacks = useMemo<PropertyListCallbacks>(
    () => ({
      onOpenProperty: (id) => router.push(`/properties/${id}`),
      onOpenCustomer: (id) => router.push(`/customers/${id}`),
      onSearch: (query) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          if (query) params.set('q', query);
          else params.delete('q');
          router.replace(`/properties?${params.toString()}`);
        }, SEARCH_DEBOUNCE_MS);
      },
      onStatusFilter: (filter) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filter === 'all') params.delete('status');
        else params.set('status', filter);
        router.replace(`/properties?${params.toString()}`);
      },
      onTypeFilter: (filter) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filter === 'all') params.delete('type');
        else params.set('type', filter);
        router.replace(`/properties?${params.toString()}`);
      },
      onOpenAction: (action) => {
        if (action === 'new-property') return; // No real create route at the list level yet — button is disabled (see forge-properties-view-model.ts / gap report).
      },
    }),
    [router, searchParams]
  );

  return <PropertiesList model={model} callbacks={callbacks} />;
}
