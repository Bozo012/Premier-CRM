/**
 * Kept out of actions.ts because Next.js requires every export from a
 * 'use server' file to be an async function — a plain synchronous helper
 * there fails the build (same class of issue as apps/web/lib's redact.ts
 * split, documented in docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md).
 */

/**
 * Translates raw RPC exception text (e.g. "Role does not have
 * canApproveEstimatePricing") into a plain-language message before it ever
 * reaches the client — defense in depth for actions whose UI now hides the
 * triggering control entirely (see PricingReviewPanel), in case this action
 * is ever invoked directly. The RPC's own capability check remains the real
 * enforcement; this only controls what a caller sees.
 */
export function toUserFacingError(message: string): string {
  if (/does not have can[A-Z]/.test(message)) {
    return "You don't have permission to do this. Ask an owner or administrator.";
  }
  return message;
}
