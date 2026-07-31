/**
 * Runs once before the whole suite. Verifies the ALREADY-RUNNING dev
 * server (not just this test runner's own env vars — see the
 * playwright.config.ts guard for that half) is actually pointed at
 * premier-crm-e2e, not production, before any test can mutate data.
 *
 * See apps/web/app/api/e2e-health/route.ts's doc comment for the
 * near-miss this closes.
 */
import type { FullConfig } from '@playwright/test';

const PROD_SUPABASE_PROJECT_REF = 'apnbpcauqrjvkoleisde';

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';

  let projectRef: string | null = null;
  try {
    const response = await fetch(`${baseURL}/api/e2e-health`, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json()) as { projectRef: string | null };
    projectRef = body.projectRef;
  } catch (error) {
    throw new Error(
      `REFUSING TO RUN: could not reach the dev server's /api/e2e-health check at ${baseURL} ` +
        `(${error instanceof Error ? error.message : String(error)}). Make sure \`pnpm dev\` is running ` +
        'before starting the e2e suite — this check exists specifically so we never silently run ' +
        "against whatever the server happens to be pointed at."
    );
  }

  if (projectRef === PROD_SUPABASE_PROJECT_REF) {
    throw new Error(
      'REFUSING TO RUN: the live dev server is currently serving against premier-crm-prod ' +
        `(project ref ${PROD_SUPABASE_PROJECT_REF}). This suite creates, mutates, and deletes ` +
        'data and must only run against premier-crm-e2e. Check apps/web/.env.local and whatever ' +
        'environment overrides started the dev server, then restart it pointed at e2e before ' +
        'running this suite again.'
    );
  }

  if (!projectRef) {
    throw new Error(
      'REFUSING TO RUN: could not determine which Supabase project the live dev server is using ' +
        '(NEXT_PUBLIC_SUPABASE_URL missing or unrecognized). Fix the dev server\'s environment before ' +
        'running this suite.'
    );
  }
}
