/**
 * requests-redesign-bot: UI-click coverage for the Requests list/detail
 * routes, added in Base44 UX Batch 8
 * (docs/ux/forge-base44-batch-8-requests-site-visits-inspection-report.md).
 *
 * Prior to this batch there was zero UI-click coverage for Requests — the
 * existing bots (authorization-service-requests-bot, customer-intake-bot,
 * request-conversion-bot, request-site-visit-workflow-bot) are API/RPC-level
 * or (for request-conversion-bot, since this batch) click through
 * TriagePanel specifically, not the list/detail shell itself. This bot
 * covers what those don't: list navigation, the single-triage-UI
 * consolidation, and responsive/accessibility behavior.
 *
 * Financial/permission logic is intentionally NOT re-verified here — that's
 * request-conversion-bot's and authorization-service-requests-bot's job.
 * This bot only asserts what a real user sees and clicks.
 */

import { test, expect } from '@playwright/test';

import { buildMarker } from './utils/test-data';
import { cleanupTestCustomerByMarker, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { hasAdminCredentials } from './utils/auth';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';
import { viewportProfiles } from './utils/mobile';

const SERVICE_REQUESTS_ENDPOINT = '/api/v1/service-requests';

function buildServiceRequestPayload(marker: string) {
  return {
    firstName: marker,
    lastName: 'RequestsRedesignBot',
    emailAddress: `${marker.toLowerCase()}@example.com`,
    phoneNumber: `555-0${Math.floor(100000 + Math.random() * 899999)}`,
    addressLine1: `${marker} Redesign Way`,
    city: 'Florence',
    state: 'KY',
    zipCode: '41042',
    customerType: 'residential',
    preferredContactMethod: 'email',
    priorityLevel: 'normal',
    problemDescription: 'E2E requests-redesign bot fixture request.',
    propertyType: 'single-family',
    serviceCategory: 'Deck repair',
  };
}

test.describe('requests redesign bot', () => {
  test('1. list renders a real request and links to its detail page', async ({ page, request }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const marker = buildMarker('REQ_LIST');
    const email = `${marker.toLowerCase()}@example.com`;
    const response = await request.post(SERVICE_REQUESTS_ENDPOINT, { data: buildServiceRequestPayload(marker) });
    const body = await response.json();
    const requestId = body.data.ticket_id as string;

    const session = createTestSession(page);
    await loginAsAdmin(session);

    await page.goto('/requests');
    const link = page.getByRole('link', { name: new RegExp(marker, 'i') });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/requests/${requestId}$`));

    await cleanupTestCustomerByMarker({ marker, email });
    await session.finish();
  });

  test('2. request detail shows exactly one triage decision UI, no legacy conversion buttons', async ({
    page,
    request,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const marker = buildMarker('REQ_SINGLE');
    const email = `${marker.toLowerCase()}@example.com`;
    const response = await request.post(SERVICE_REQUESTS_ENDPOINT, { data: buildServiceRequestPayload(marker) });
    const body = await response.json();
    const requestId = body.data.ticket_id as string;

    const session = createTestSession(page);
    await loginAsAdmin(session);

    await page.goto(`/requests/${requestId}`);

    // The one authoritative triage UI: TriagePanel's decision <select>.
    await expect(page.getByLabel(/^decision$/i)).toBeVisible();

    // The two removed legacy triggers must not be reachable by any label —
    // this is the actual UI-level proof of the triage consolidation, not
    // just "the file no longer imports the component."
    await expect(page.getByRole('button', { name: /start inspection flow/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /create work order/i })).toHaveCount(0);

    // Mark-as-reviewed is a genuinely distinct, retained action.
    await expect(page.getByRole('button', { name: /mark as reviewed/i })).toBeVisible();

    await cleanupTestCustomerByMarker({ marker, email });
    await session.finish();
  });

  test('3. direct-work-order option requires an authorization type before the RPC call', async ({
    page,
    request,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const marker = buildMarker('REQ_AUTHFIELDS');
    const email = `${marker.toLowerCase()}@example.com`;
    const response = await request.post(SERVICE_REQUESTS_ENDPOINT, { data: buildServiceRequestPayload(marker) });
    const body = await response.json();
    const requestId = body.data.ticket_id as string;

    const session = createTestSession(page);
    await loginAsAdmin(session);

    await page.goto(`/requests/${requestId}`);
    await page.getByLabel(/^decision$/i).selectOption('direct_work_order');
    await expect(page.getByLabel(/authorization type/i)).toBeVisible();
    // HTML-required field blocks submission before any network call.
    await expect(page.getByLabel(/authorization type/i)).toHaveAttribute('required', '');

    await cleanupTestCustomerByMarker({ marker, email });
    await session.finish();
  });

  for (const vp of viewportProfiles) {
    test.describe(`${vp.name} viewport (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test(`request detail renders without horizontal overflow at ${vp.name}`, async ({ page, request }) => {
        test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
        test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

        const marker = buildMarker(`REQ_${vp.name.toUpperCase()}`);
        const email = `${marker.toLowerCase()}@example.com`;
        const response = await request.post(SERVICE_REQUESTS_ENDPOINT, { data: buildServiceRequestPayload(marker) });
        const body = await response.json();
        const requestId = body.data.ticket_id as string;

        const session = createTestSession(page);
        await loginAsAdmin(session);

        await page.goto(`/requests/${requestId}`);
        await expect(page.getByLabel(/^decision$/i)).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(1);

        await cleanupTestCustomerByMarker({ marker, email });
        await session.finish();
      });
    });
  }
});
