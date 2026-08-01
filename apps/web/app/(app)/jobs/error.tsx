'use client'; // Error boundaries in App Router must be client components.

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/report-client-error';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the jobs route, matching the customers route's
 * precedent. Renders when an unhandled error escapes the page or its
 * children — e.g. the final-invoice-generation client-side crash this was
 * added to instrument.
 */
export default function JobsErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Jobs route error:', error);
    reportClientError({ message: error.message, stack: error.stack, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-start gap-4 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Jobs</h1>
        <p className="text-sm text-red-600">Something went wrong loading this page.</p>
      </header>

      {error.message ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error.message}
        </p>
      ) : null}

      <Button onClick={reset} variant="outline" type="button">
        Try again
      </Button>
    </main>
  );
}
