'use client'; // Error boundaries in App Router must be client components.

import { useEffect } from 'react';

import { reportClientError } from '@/lib/report-client-error';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root-level error boundary — catches anything a route-level boundary
 * misses, including layout errors. Must render its own <html>/<body> since
 * it replaces the root layout when it fires.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. This has been reported.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
