/**
 * request-conversion-bot: covers the two request → work conversion paths
 * from the (app)/requests review page (Phases 3 & 4 of the 2026-07-31
 * workflow reliability audit).
 *
 * Both paths start from a real service_requests row (created via the public
 * intake API, same as customer-intake-bot) and are genuinely separate, not
 * two views of the same flow:
 *
 *  - Inspection-first (createEstimateFromRequestAction): creates a DRAFT
 *    estimate linked back to the request via service_request_id, and flips
 *    the request to 'estimate_created'. No job or quote exists yet — a
 *    human still has to run the estimate → quote → accept → job pipeline.
 *  - Direct work-order (createJobFromRequestAction): creates an APPROVED
 *    job directly, no estimate/quote backing it at all (intentional
 *    "second door" per the code's own comments — skips pricing).
 *
 * Both share getRequestConversionContext()'s double-conversion guard
 * (request.estimate_id / request.job_id already set → rejected), tested
 * here via direct re-submission of the same action.
 */

import { test, expect } from '@playwright/test';

import { buildMarker } from './utils/test-data';
import {
  cleanupTestCustomerByMarker,
  createGuardedServiceClient,
  hasServiceRoleCleanupCredentials,
} from './utils/cleanup';
import { hasAdminCredentials } from './utils/auth';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';

const SERVICE_REQUESTS_ENDPOINT = '/api/v1/service-requests';

function buildServiceRequestPayload(marker: string) {
  return {
    firstName: marker,
    lastName: 'ConversionBot',
    emailAddress: `${marker.toLowerCase()}@example.com`,
    phoneNumber: `555-0${Math.floor(100000 + Math.random() * 899999)}`,
    addressLine1: `${marker} Test Fixture Way`,
    city: 'Florence',
    state: 'KY',
    zipCode: '41042',
    customerType: 'residential',
    preferredContactMethod: 'email',
    priorityLevel: 'normal',
    problemDescription: 'E2E request-conversion bot test submission.',
    propertyType: 'single-family',
    serviceCategory: 'Deck repair',
  };
}

test.describe('request conversion bot', () => {
  test.describe('inspection-first conversion (Phase 3)', () => {
    test('1. UI + DB: "Start inspection flow" creates a draft estimate linked to the request', async ({
      page,
      context,
      request,
    }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('CONV_ESTIMATE');
      const email = `${marker.toLowerCase()}@example.com`;
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: buildServiceRequestPayload(marker),
      });
      const body = await response.json();
      const requestId = body.data.ticket_id as string;

      const session = createTestSession(page);
      await loginAsAdmin(session);

      // A second tab loads the request page BEFORE conversion — its button
      // still exists client-side even after the first tab converts the
      // request, so submitting it proves the SERVER ACTION itself rejects a
      // second conversion (getRequestConversionContext's estimate_id/job_id
      // check), not just that the UI stopped offering the button.
      const staleTab = await context.newPage();
      await staleTab.goto(`/requests/${requestId}`);
      await expect(staleTab.getByRole('button', { name: /start inspection flow/i })).toBeVisible();

      await page.goto(`/requests/${requestId}`);
      await page.getByRole('button', { name: /start inspection flow/i }).click();
      // The request page updates in place with a success state and an
      // "Open estimate →" link — it does not auto-navigate there.
      const openEstimateLink = page.getByRole('link', { name: /open estimate/i });
      await expect(openEstimateLink).toBeVisible({ timeout: 10_000 });
      const estimateHref = await openEstimateLink.getAttribute('href');
      const estimateId = estimateHref!.split('/').pop()!;

      const client = createGuardedServiceClient();
      const { data: estimate } = await client
        .from('estimates')
        .select('status, service_request_id, title')
        .eq('id', estimateId)
        .maybeSingle();
      expect(estimate?.status).toBe('draft');
      expect(estimate?.service_request_id).toBe(requestId);

      const { data: serviceRequest } = await client
        .from('service_requests')
        .select('status, estimate_id, job_id, converted_at')
        .eq('id', requestId)
        .maybeSingle();
      expect(serviceRequest?.status).toBe('estimate_created');
      expect(serviceRequest?.estimate_id).toBe(estimateId);
      expect(serviceRequest?.job_id).toBeNull();
      expect(serviceRequest?.converted_at).toBeTruthy();

      // Double-conversion guard, server-side: the stale tab's button click
      // hits createEstimateFromRequestAction again for a request that now
      // has estimate_id set — must be rejected, not create a second estimate.
      await staleTab.getByRole('button', { name: /start inspection flow/i }).click();
      await expect(staleTab.getByText(/an estimate already exists/i)).toBeVisible({ timeout: 10_000 });

      const { data: estimatesForRequest } = await client
        .from('estimates')
        .select('id')
        .eq('service_request_id', requestId);
      expect(estimatesForRequest ?? []).toHaveLength(1);

      // UI-level confirmation too: a fresh page load no longer offers either button.
      await page.goto(`/requests/${requestId}`);
      await expect(page.getByRole('button', { name: /start inspection flow/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /create work order/i })).toHaveCount(0);

      await cleanupTestCustomerByMarker({ marker, email });
      await session.finish();
    });
  });

  test.describe('direct work-order conversion (Phase 4)', () => {
    test('2. UI + DB: "Create work order" creates an approved job with no estimate/quote backing', async ({
      page,
      request,
    }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('CONV_JOB');
      const email = `${marker.toLowerCase()}@example.com`;
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: buildServiceRequestPayload(marker),
      });
      const body = await response.json();
      const requestId = body.data.ticket_id as string;

      const session = createTestSession(page);
      await loginAsAdmin(session);

      await page.goto(`/requests/${requestId}`);
      await page.getByRole('button', { name: /create work order/i }).click();
      // Same in-place success pattern as the estimate path — no auto-navigation.
      const openJobLink = page.getByRole('link', { name: /open work order/i });
      await expect(openJobLink).toBeVisible({ timeout: 10_000 });
      const jobHref = await openJobLink.getAttribute('href');
      const jobId = jobHref!.split('/').pop()!;

      const client = createGuardedServiceClient();
      const { data: job } = await client
        .from('jobs')
        .select('status, quoted_total')
        .eq('id', jobId)
        .maybeSingle();
      expect(job?.status).toBe('approved');
      // Intentional "second door" per the code's own comments: no pricing
      // exists yet for a directly-converted job.
      expect(job?.quoted_total).toBeNull();

      const { data: quotes } = await client.from('quotes').select('id').eq('job_id', jobId);
      expect(quotes ?? []).toHaveLength(0);

      const { data: serviceRequest } = await client
        .from('service_requests')
        .select('status, job_id, estimate_id, converted_at')
        .eq('id', requestId)
        .maybeSingle();
      expect(serviceRequest?.status).toBe('approved');
      expect(serviceRequest?.job_id).toBe(jobId);
      expect(serviceRequest?.estimate_id).toBeNull();
      expect(serviceRequest?.converted_at).toBeTruthy();

      // Double-conversion guard: both conversion buttons disappear once the
      // request is converted via either path.
      await page.goto(`/requests/${requestId}`);
      await expect(page.getByRole('button', { name: /start inspection flow/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /create work order/i })).toHaveCount(0);

      await cleanupTestCustomerByMarker({ marker, email });
      await session.finish();
    });
  });
});
