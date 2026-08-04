// Shared access-denied state (Forge V1.1 UX modernization, Batch UX-A).
// Closes the confirmed historical gap where a capability-check failure
// surfaced as a raw error string (Kevin's UI-observation finding #1,
// docs/implementation/kevin-demo-ui-observation.md — that specific
// instance was fixed in PR #86; this component exists so no future one
// repeats the pattern). Never renders the raw server/RPC error message —
// always a fixed, sanitized copy plus an optional caller-supplied reason.
export function AccessDeniedState({ reason }: { reason?: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <p className="font-medium">You don&apos;t have access to do this.</p>
      {reason ? <p className="mt-0.5 text-amber-700">{reason}</p> : null}
    </div>
  );
}
