import { ErrorCode } from './errors/error-code';

/**
 * Standard return shape for server actions and query module functions.
 *
 * Per CONVENTIONS rule #1, server actions never throw — they return one of
 * these discriminated-union variants. Callers narrow on `success`:
 *
 * ```ts
 * const result = await listCustomers({ orgId });
 * if (!result.success) {
 *   // handle error: result.error (string), result.code (ErrorCode)
 *   return;
 * }
 * // success: result.data is T
 * ```
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode };

/**
 * Construct a success result.
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Construct a failure result.
 *
 * `code` first because it categorizes the failure; `message` second because
 * it's user/operator-facing prose. Matches the order in CONVENTIONS examples.
 */
export function err(code: ErrorCode, message: string): Result<never> {
  return { success: false, error: message, code };
}
