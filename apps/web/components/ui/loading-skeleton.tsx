// Shared loading skeleton (Forge V1.1 UX modernization, Batch UX-A).
// Generalizes the existing customers/loading.tsx pattern — a designed
// loading state, not a spinner, per the established CONVENTIONS rule
// ("every list view shows a designed loading state rather than a global
// spinner") — to the ~19 routes that don't have a loading.tsx yet. This
// component itself does not wire into any route's loading.tsx; each
// route's own loading.tsx renders it, so no route's behavior changes
// merely by this component existing.
import { cn } from '@/lib/utils';

export function LoadingSkeleton({
  rows = 3,
  className,
}: {
  /** Number of placeholder rows to render below the title bar. */
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}
