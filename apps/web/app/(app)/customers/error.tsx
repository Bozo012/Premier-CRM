'use client'; // Error boundaries in App Router must be client components.

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the customers route. Renders when an unhandled error
 * escapes the page or its children. The page itself is responsible for
 * graceful handling of expected failure modes (DB error, no org membership)
 * via Result<T> — this boundary is the safety net for the unexpected.
 */
export default function CustomersErrorBoundary({
  error,
  reset,
}: ErrorBoundaryProps) {
  useEffect(() => {
    // Surface to the browser console for debugging in dev. Production
    // monitoring (Sentry, etc.) lands in a later phase.
    console.error('Customers route error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-start gap-4 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Customers
        </h1>
        <p className="text-sm text-red-600">
          Something went wrong loading your customers.
        </p>
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
