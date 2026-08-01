/**
 * Reports a client-side error to /api/client-error-log so it becomes
 * visible in Vercel's runtime logs (queryable via get_runtime_logs) —
 * server-side logs never see browser console output, which is why the
 * final-invoice-generation crash left no trace in a prior investigation.
 *
 * Uses sendBeacon when available so the report survives page unload during
 * a crash; falls back to a keepalive fetch otherwise.
 */
export function reportClientError(args: {
  message: string;
  stack?: string;
  digest?: string;
  componentStack?: string;
}): void {
  const payload = JSON.stringify({
    message: args.message,
    stack: args.stack,
    digest: args.digest,
    componentStack: args.componentStack,
    url: typeof window !== 'undefined' ? window.location.pathname : undefined,
  });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    const sent = navigator.sendBeacon('/api/client-error-log', blob);
    if (sent) return;
  }

  void fetch('/api/client-error-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Best-effort only — a failed error report must never itself throw.
  });
}
