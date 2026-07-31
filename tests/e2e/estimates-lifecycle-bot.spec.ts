/**
 * estimates-lifecycle-bot: covers updateEstimateStatusAction's explicit
 * transitions and the implicit site_visit_complete → quoted transition
 * (Phase 6 of the 2026-07-31 workflow reliability audit).
 *
 * Confirmed findings, documented rather than "fixed" (not proven defects —
 * see plan): `estimate_status` has three enum values — accepted, declined,
 * expired — that no traced action ever writes onto `estimates` (only onto
 * `quotes`). `site_visit_complete → quoted` has no explicit action; it only
 * happens as a side effect of createQuoteFromEstimateAction. This file locks
 * in the real transitions rather than proposing new ones.
 */

import { test, expect } from '@playwright/test';

import {
  createGuardedServiceClient,
  hasServiceRoleCleanupCredentials,
} from './utils/cleanup';
import { hasAdminCredentials } from './utils/auth';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';

test.describe('estimates lifecycle bot', () => {
  test('1. UI + DB: draft → site_visit_scheduled → site_visit_complete → quoted, with the site-visit email firing', async ({
    page,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);

    // Build a real draft estimate via the manual-estimate flow (session's
    // shared fixture), which needs a customer + property first.
    const customer = await session.customer();
    const property = await session.property(customer);
    const estimate = await session.estimate(customer, property);

    const client = createGuardedServiceClient();
    // Give the estimate's customer a real, verifiable inbox for the
    // site-visit-scheduled email, matching this suite's sandbox convention.
    await client
      .from('customers')
      .update({ email: 'delivered+e2e-estimates-lifecycle@resend.dev' })
      .eq('id', customer.id);

    await page.goto(estimate.url);
    await expect(page.getByRole('button', { name: 'Schedule site visit' })).toBeVisible();
    await page.getByRole('button', { name: 'Schedule site visit' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(async () => {
      const { data } = await client
        .from('estimates')
        .select('status')
        .eq('id', estimate.id)
        .maybeSingle();
      expect(data?.status).toBe('site_visit_scheduled');
    }).toPass({ timeout: 10_000 });

    // draft → site_visit_scheduled → site_visit_complete
    await page.goto(estimate.url);
    await expect(page.getByRole('button', { name: 'Mark site visit complete' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark site visit complete' }).click();

    await expect(async () => {
      const { data } = await client
        .from('estimates')
        .select('status')
        .eq('id', estimate.id)
        .maybeSingle();
      expect(data?.status).toBe('site_visit_complete');
    }).toPass({ timeout: 10_000 });

    // No explicit action exists for site_visit_complete — confirmed by the
    // advance-status button having no TRANSITIONS entry for it. The only
    // way forward from here is creating a quote, which flips the estimate
    // to 'quoted' as a side effect (estimates/actions.ts's
    // createQuoteFromEstimateAction), not an explicit status transition.
    await page.goto(estimate.url);
    await expect(page.getByRole('button', { name: /schedule site visit/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /mark site visit complete/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Approve → create quote' }).click();
    await page.getByRole('button', { name: 'Approve & build quote' }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });

    await expect(async () => {
      const { data } = await client
        .from('estimates')
        .select('status')
        .eq('id', estimate.id)
        .maybeSingle();
      expect(data?.status).toBe('quoted');
    }).toPass({ timeout: 10_000 });

    await session.finish();
  });
});
