'use client'; // Wires the ported JobsList to router navigation (debounced search, filter, row-open, new-job).

// Layer 2 adapter — connects the portable, ported JobsList presentation
// component to real navigation, matching customers/_components/
// customers-list-container.tsx exactly: search and filter genuinely
// re-query the server (via URL params consumed by page.tsx's real
// listJobs() call), never client-side filtering over a fixed fetch.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef } from 'react';

import { JobsList, type JobsListCallbacks } from './jobs-list';
import type { JobsListFilter, JobRowModel } from '../_lib/forge-jobs-view-model';

const SEARCH_DEBOUNCE_MS = 300;

export function JobsListContainer({
  jobs,
  filters,
  activeFilter,
  searchQuery,
}: {
  jobs: JobRowModel[];
  filters: JobsListFilter[];
  activeFilter: string;
  searchQuery: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacks = useMemo<JobsListCallbacks>(
    () => ({
      onOpenJob: (id) => router.push(`/jobs/${id}`),
      onSearch: (query) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          if (query) params.set('q', query);
          else params.delete('q');
          router.replace(`/jobs?${params.toString()}`);
        }, SEARCH_DEBOUNCE_MS);
      },
      onFilter: (filterId) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filterId === 'all') params.delete('filter');
        else params.set('filter', filterId);
        router.replace(`/jobs?${params.toString()}`);
      },
      onNewJob: () => router.push('/jobs/new'),
    }),
    [router, searchParams]
  );

  return <JobsList jobs={jobs} filters={filters} activeFilter={activeFilter} searchQuery={searchQuery} callbacks={callbacks} />;
}
