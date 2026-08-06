/**
 * request-conversion-bot: covers the two request → work conversion paths
 * from the (app)/requests review page (Phases 3 & 4 of the 2026-07-31
 * workflow reliability audit).
 *
 * Rewritten for Base44 UX Batch 8's triage consolidation
 * (docs/ux/forge-base44-batch-8-requests-site-visits-inspection-report.md):
 * the two legacy conversion buttons this bot used to click ("Start
 * inspection flow" → createEstimateFromRequestAction, "Create work order"
 * → createJobFromRequestAction) were removed from Request Detail because
 * they were not safe, fully-equivalent substitutes for the authoritative
 * `record_request_triage` RPC path (see the batch report's triage-equivalence
 * findings) — TriagePanel is now the only visible trigger. This bot now
 * drives TriagePanel's decision form instead, which exercises the SAME
 * downstream outcomes (draft estimate / approved job with no quote/estimate
 * backing) through the RPC that is now the sole production path, plus the
 * RPC's own "already triaged" duplicate-prevention rule (previously proven
 * via the legacy actions' getRequestConversionContext guard, now proven via
 * record_request_triage's `triage_decision is not null` check).
 *
 * Both paths still start from a real service_requests row (created via the
 * public intake API, same as customer-intake-bot).
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
  test.describe('remote-estimate triage (Phase 3, via TriagePanel)', () => {
    test('1. UI + DB: triaging "Remote estimate" creates a draft estimate linked to the request', async ({
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

      // A second tab loads the request page BEFORE triage — its decision
      // form still exists client-side even after the first tab triages the
      // request, so submitting it proves the RPC itself rejects a second
      // triage (record_request_triage's `triage_decision is not null`
      // check), not just that the UI stopped offering the form.
      const staleTab = await context.newPage();
      await staleTab.goto(`/requests/${requestId}`);
      await expect(staleTab.getByLabel(/^decision$/i)).toBeVisible();

      await page.goto(`/requests/${requestId}`);
      await page.getByLabel(/^decision$/i).selectOption('remote_estimate');
      await page.getByLabel(/^reason$/i).fill('Needs pricing before scheduling.');
      await page.getByRole('button', { name: /record decision/i }).click();

      // DecisionForm auto-navigates to the created record on success.
      await page.waitForURL(/\/estimates\/[0-9a-f-]+$/i, { timeout: 10_000 });
      const estimateId = page.url().split('/').pop()!;

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
        .select('status, estimate_id, job_id, converted_at, triage_decision')
        .eq('id', requestId)
        .maybeSingle();
      expect(serviceRequest?.status).toBe('estimate_created');
      expect(serviceRequest?.estimate_id).toBe(estimateId);
      expect(serviceRequest?.job_id).toBeNull();
      expect(serviceRequest?.converted_at).toBeTruthy();
      expect(serviceRequest?.triage_decision).toBe('remote_estimate');

      // Double-triage guard, server-side: the stale tab's form submission
      // hits record_request_triage again for a request that's already been
      // triaged — must be rejected, not create a second estimate.
      await staleTab.getByLabel(/^decision$/i).selectOption('remote_estimate');
      await staleTab.getByLabel(/^reason$/i).fill('Duplicate submission attempt.');
      await staleTab.getByRole('button', { name: /record decision/i }).click();
      await expect(staleTab.getByText(/already been triaged/i)).toBeVisible({ timeout: 10_000 });

      const { data: estimatesForRequest } = await client
        .from('estimates')
        .select('id')
        .eq('service_request_id', requestId);
      expect(estimatesForRequest ?? []).toHaveLength(1);

      // UI-level confirmation too: a fresh page load shows the recorded
      // decision, not a re-openable decision form.
      await page.goto(`/requests/${requestId}`);
      await expect(page.getByText(/decision:\s*remote estimate/i)).toBeVisible();
      await expect(page.getByLabel(/^decision$/i)).toHaveCount(0);

      await cleanupTestCustomerByMarker({ marker, email });
      await session.finish();
    });
  });

  test.describe('direct work-order triage (Phase 4, via TriagePanel)', () => {
    test('2. UI + DB: triaging "Direct work order" creates an approved job with no estimate/quote backing', async ({
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
      await page.getByLabel(/^decision$/i).selectOption('direct_work_order');
      await page.getByLabel(/^reason$/i).fill('Emergency leak, authorized on the spot.');
      await page.getByLabel(/authorization type/i).selectOption('internal');
      await page.getByRole('button', { name: /record decision/i }).click();

      await page.waitForURL(/\/jobs\/[0-9a-f-]+$/i, { timeout: 10_000 });
      const jobId = page.url().split('/').pop()!;

      const client = createGuardedServiceClient();
      const { data: job } = await client
        .from('jobs')
        .select('status, quoted_total, authorization_type')
        .eq('id', jobId)
        .maybeSingle();
      expect(job?.status).toBe('approved');
      // Intentional "second door" per the code's own comments: no pricing
      // exists yet for a directly-converted job.
      expect(job?.quoted_total).toBeNull();
      expect(job?.authorization_type).toBe('internal');

      const { data: quotes } = await client.from('quotes').select('id').eq('job_id', jobId);
      expect(quotes ?? []).toHaveLength(0);

      const { data: serviceRequest } = await client
        .from('service_requests')
        .select('status, job_id, estimate_id, converted_at, triage_decision')
        .eq('id', requestId)
        .maybeSingle();
      expect(serviceRequest?.status).toBe('approved');
      expect(serviceRequest?.job_id).toBe(jobId);
      expect(serviceRequest?.estimate_id).toBeNull();
      expect(serviceRequest?.converted_at).toBeTruthy();
      expect(serviceRequest?.triage_decision).toBe('direct_work_order');

      // Double-triage guard: the decision form disappears once the request
      // has been triaged via either path.
      await page.goto(`/requests/${requestId}`);
      await expect(page.getByLabel(/^decision$/i)).toHaveCount(0);
      await expect(page.getByText(/decision:\s*direct work order/i)).toBeVisible();

      await cleanupTestCustomerByMarker({ marker, email });
      await session.finish();
    });
  });
});
