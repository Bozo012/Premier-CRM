import { ErrorCode } from './error-code';

/**
 * Typed application error.
 *
 * Use this when *throwing* makes sense — typically internal/programmer errors
 * that should bubble up rather than be returned. User-facing failures from
 * server actions should be returned as `Result<T>` failures, not thrown.
 *
 * Example:
 * ```ts
 * if (!supabase) {
 *   throw new AppError('Supabase client not initialized', ErrorCode.UNKNOWN);
 * }
 * ```
 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
