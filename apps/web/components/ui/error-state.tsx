// Shared error state for EXPECTED failures (Forge V1.1 UX modernization,
// Batch UX-A) — a DB error, a failed query, a failed org-context
// resolution. This is distinct from and does not replace a route's
// error.tsx boundary (App Router's safety net for UNEXPECTED errors,
// already correctly implemented on customers/invoices/jobs) — see
// docs/ux/forge-v1.1-ux-modernization-plan.md §4 for the distinction.
//
// `OrgContextError` (components/org-context-error.tsx) remains the
// specific component for its one call site (getActiveOrgContext failures)
// and is not changed by this component's introduction — a future pass may
// rebuild it as a thin wrapper around this one, not done here.
import { cn } from '@/lib/utils';

export function ErrorState({
  message,
  tone = 'error',
  className,
}: {
  message: string;
  /** 'error' (red) for real failures; 'expected' (amber) for a normal,
   *  non-alarming state like "no active org yet" — mirrors the existing
   *  OrgContextError severity split. */
  tone?: 'error' | 'expected';
  className?: string;
}) {
  const toneClass =
    tone === 'expected'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-red-200 bg-red-50 text-red-700';

  return <p className={cn('rounded-md border px-3 py-2 text-sm', toneClass, className)}>{message}</p>;
}
