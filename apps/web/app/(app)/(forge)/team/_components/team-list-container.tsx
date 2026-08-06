'use client'; // Wires the ported TeamList to router navigation (debounced search, filter, card-open).

// Layer 2 adapter — connects the portable, ported TeamList presentation
// component to real navigation, matching
// ../../customers/_components/customers-list-container.tsx.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef } from 'react';

import { TeamList } from './team-list';
import type { TeamCallbacks, TeamListViewModel } from '../_lib/forge-team-contracts';

const SEARCH_DEBOUNCE_MS = 300;

export function TeamListContainer({ model }: { model: TeamListViewModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacks = useMemo<TeamCallbacks>(
    () => ({
      onOpenMember: (id) => router.push(`/team/${id}`),
      onSearch: (query) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          if (query) params.set('q', query);
          else params.delete('q');
          router.replace(`/team?${params.toString()}`);
        }, SEARCH_DEBOUNCE_MS);
      },
      onFilter: (filter) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filter === 'all') params.delete('filter');
        else params.set('filter', filter);
        router.replace(`/team?${params.toString()}`);
      },
      onOpenAction: (action) => {
        if (action === 'invite-member') {
          const el = document.getElementById('invite-member');
          el?.scrollIntoView({ behavior: 'smooth' });
        }
      },
    }),
    [router, searchParams]
  );

  return <TeamList model={model} callbacks={callbacks} />;
}
