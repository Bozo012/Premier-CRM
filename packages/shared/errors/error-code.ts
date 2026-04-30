/**
 * Canonical error codes used across server actions and query modules.
 *
 * Per CONVENTIONS, server actions return discriminated unions of the form
 * `{ success: false, error: string, code: ErrorCode }` — never throw raw
 * errors to callers. New codes should be added here rather than introducing
 * ad-hoc string identifiers at call sites.
 */
export enum ErrorCode {
  /** Requested entity does not exist or is not visible to the caller. */
  NOT_FOUND = 'NOT_FOUND',
  /** Caller is authenticated but lacks permission for the requested action. */
  FORBIDDEN = 'FORBIDDEN',
  /** Input failed Zod or other schema validation. */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Database returned an error (constraint violation, RLS denial, etc.). */
  DB_ERROR = 'DB_ERROR',
  /** Catch-all for unexpected failures. Prefer a more specific code when possible. */
  UNKNOWN = 'UNKNOWN',
}
