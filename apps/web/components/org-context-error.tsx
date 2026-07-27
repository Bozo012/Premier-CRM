import { ErrorCode } from '@premier/shared';

/**
 * Renders the failure branch of `getActiveOrgContext()` consistently across
 * every page that needs an org context (PR C0). `NOT_FOUND` (no active
 * membership yet) is an expected, non-alarming state — amber. `CONFLICT`
 * (more than one active membership — unsupported today) and `DB_ERROR` are
 * real problems — red.
 */
export function OrgContextError({ code, message }: { code: ErrorCode; message: string }) {
  const isExpectedNoOrgState = code === ErrorCode.NOT_FOUND;
  const className = isExpectedNoOrgState
    ? 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700'
    : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700';

  return <p className={className}>{message}</p>;
}
