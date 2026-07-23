// "use client" — needs local state for open/close, server action dispatch for search and creation
'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import {
  createDraftQuoteAction,
  searchJobsForPickerAction,
  type CreateDraftQuoteActionState,
  type JobPickerItem,
  type SearchJobsForPickerActionState,
} from '../actions';

export function NewQuoteDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [, startTransition] = useTransition();

  const [searchState, searchFormAction, isSearching] = useActionState<
    SearchJobsForPickerActionState | null,
    FormData
  >(searchJobsForPickerAction, null);

  const [createState, createFormAction, isCreating] = useActionState<
    CreateDraftQuoteActionState | null,
    FormData
  >(createDraftQuoteAction, null);

  // Redirect to the new quote on successful creation.
  useEffect(() => {
    if (createState?.success) {
      router.push(`/quotes/${createState.data.quoteId}`);
    }
  }, [createState, router]);

  // Surface creation errors via toast (non-blocking).
  useEffect(() => {
    if (createState && !createState.success) {
      toast.error(createState.error ?? 'Could not create quote. Please try again.');
    }
  }, [createState]);

  function handleOpen() {
    setIsOpen(true);
    // Load the initial job list (no search term).
    const fd = new FormData();
    startTransition(() => {
      searchFormAction(fd);
    });
  }

  const jobs: JobPickerItem[] = searchState?.success ? searchState.data : [];

  if (!isOpen) {
    return (
      <Button onClick={handleOpen} size="sm" variant="outline">
        Quote an existing job
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Select a job</CardTitle>
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={searchFormAction} className="flex gap-2">
          <Input
            name="q"
            placeholder="Search by title or job number…"
            className="flex-1"
          />
          <Button type="submit" variant="outline" size="sm" disabled={isSearching}>
            {isSearching ? 'Searching…' : 'Search'}
          </Button>
        </form>

        {searchState && !searchState.success ? (
          <p className="text-sm text-red-600">{searchState.error}</p>
        ) : isSearching ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {searchState === null ? 'Loading jobs…' : 'No jobs found.'}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {job.title.trim() || job.jobNumber || 'Untitled job'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[job.customerName, job.jobNumber, formatJobStatus(job.status)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <form action={createFormAction} className="shrink-0">
                  <input type="hidden" name="jobId" value={job.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isCreating}
                  >
                    {isCreating ? 'Creating…' : 'Select'}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {createState && !createState.success ? (
          <p className="text-sm text-red-600">{createState.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatJobStatus(status: string): string {
  return status
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
