import { NextResponse } from 'next/server';

/**
 * Diagnostic-only route so the E2E suite can verify which Supabase project
 * the RUNNING SERVER actually resolved at boot, before any test executes.
 *
 * Added after a near-miss (2026-07-31): a dev-server restart picked up
 * apps/web/.env.local's production Supabase URL/keys instead of the
 * intended premier-crm-e2e overrides. Checking the *test runner's own* env
 * vars (see playwright.config.ts) doesn't catch this class of bug — the
 * browser navigates to whatever the already-running server process
 * resolved for itself, independent of the test runner's env. This route
 * closes that gap: it reports the server's own live project ref so
 * tests/e2e/global-setup.ts can compare it against the expected e2e ref
 * and refuse the whole run if they don't match.
 *
 * Returns only the project ref (extracted from the URL host), never any
 * key or the full URL.
 *
 * Not under `_`-prefixed folder: Next.js App Router treats leading-
 * underscore segments as private (excluded from routing), which silently
 * 404'd this route on first attempt.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  const projectRef = match ? match[1] : null;

  return NextResponse.json({ projectRef });
}
