'use client'; // Wires the ported CustomersList to router navigation (debounced search, filter, row-open).

// Layer 2 adapter — connects the portable, ported CustomersList presentation
// component to real navigation. The customers list page itself is a server
// component (apps/web/app/(app)/customers/page.tsx) that re-fetches from
// `listCustomers` whenever `?q=`/`?status=` change; this container's job is
// only to translate CustomersList's callback contract (onSearch/onFilter/
// onOpenCustomer/onOpenAction) into real URL navigation, so search and
// filter genuinely re-query the server — not client-side filtering over a
// fixed fetch.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef } from 'react';

import { CustomersList } from './customers-list';
import type { CustomerCallbacks, CustomersListViewModel } from '../_lib/forge-customers-contracts';

const SEARCH_DEBOUNCE_MS = 300;

export function CustomersListContainer({ model }: { model: CustomersListViewModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacks = useMemo<CustomerCallbacks>(
    () => ({
      onOpenCustomer: (id) => router.push(`/customers/${id}`),
      onSearch: (query) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          if (query) params.set('q', query);
          else params.delete('q');
          router.replace(`/customers?${params.toString()}`);
        }, SEARCH_DEBOUNCE_MS);
      },
      onFilter: (filter) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filter === 'all') params.delete('status');
        else params.set('status', filter);
        router.replace(`/customers?${params.toString()}`);
      },
      onOpenAction: (action) => {
        if (action === 'new-customer') {
          router.push('/customers/new');
          return;
        }
        if (action === 'retry-customers') {
          router.refresh();
          return;
        }
      },
    }),
    [router, searchParams]
  );

  return <CustomersList model={model} callbacks={callbacks} />;
}
