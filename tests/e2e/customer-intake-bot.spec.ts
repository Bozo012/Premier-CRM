/**
 * customer-intake-bot: covers the two public, unauthenticated intake
 * endpoints (Phase 2 of the 2026-07-31 workflow reliability audit).
 *
 * `/api/v1/service-requests` and `/api/v1/quote-requests` are deliberately
 * different by design (confirmed with the product owner during the audit,
 * not a defect): the former is the formal intake form that lands in
 * `service_requests` and feeds the (app)/requests review → estimate/job
 * conversion pipeline, with a confirmation email. The latter is a
 * lighter-weight marketing "quick quote" lead form that lands in `tasks`
 * for manual follow-up, with no email and no connection to the requests
 * pipeline. Both are tested here for their ACTUAL, intended behavior — this
 * file locks in current behavior, it does not propose changing either.
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
import { routes } from './utils/selectors';

const SERVICE_REQUESTS_ENDPOINT = '/api/v1/service-requests';
const QUOTE_REQUESTS_ENDPOINT = '/api/v1/quote-requests';

function buildServiceRequestPayload(marker: string, overrides: Record<string, unknown> = {}) {
  return {
    firstName: marker,
    lastName: 'IntakeBot',
    emailAddress: `${marker.toLowerCase()}@example.com`,
    phoneNumber: '555-010-9911',
    addressLine1: `${marker} Test Fixture Way`,
    city: 'Florence',
    state: 'KY',
    zipCode: '41042',
    customerType: 'residential',
    preferredContactMethod: 'email',
    priorityLevel: 'normal',
    problemDescription: 'E2E intake bot test submission — gutter cleaning inquiry.',
    propertyType: 'single-family',
    serviceCategory: 'Gutter cleaning',
    ...overrides,
  };
}

test.describe('customer intake bot', () => {
  test.describe('POST /api/v1/service-requests', () => {
    test('1. happy path creates a service_requests row and sends a confirmation email', async ({
      request,
    }) => {
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('INTAKE_HAPPY');
      // Resend sandbox address — real delivery, guaranteed accepted
      // regardless of domain verification, matches the pattern already
      // established for the invite flow (employee-onboarding-admin-invite-bot).
      const email = 'delivered+e2e-intake-happy@resend.dev';

      // Unique phone per test run: createServiceRequest() falls back to
      // phone-based dedup, and the shared default phone in
      // buildServiceRequestPayload() will silently match onto any leftover
      // customer (from a prior failed/killed run) sharing that phone,
      // corrupting this test's assertions against the wrong customer.
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: buildServiceRequestPayload(marker, {
          emailAddress: email,
          phoneNumber: `555-020-${Date.now().toString().slice(-4)}`,
        }),
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.ticket_id).toBeTruthy();

      const client = createGuardedServiceClient();
      const { data: serviceRequest } = await client
        .from('service_requests')
        .select('id, status, service_title, customer_id')
        .eq('id', body.data.ticket_id)
        .maybeSingle();

      expect(serviceRequest).toBeTruthy();
      expect(serviceRequest?.status).toBe('new');
      expect(serviceRequest?.service_title).toBe('Gutter cleaning');

      const { data: customer } = await client
        .from('customers')
        .select('display_name, email')
        .eq('id', serviceRequest!.customer_id)
        .maybeSingle();
      expect(customer?.display_name).toContain(marker);

      // Cleanup: service_requests cascade-deletes with the customer via
      // deleteDependentRecords, same as every other E2E-tagged customer.
      await cleanupTestCustomerByMarker({ marker, email });
    });

    test('2. honeypot submission is silently accepted without creating a lead', async ({ request }) => {
      const marker = buildMarker('INTAKE_HONEYPOT');
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: { ...buildServiceRequestPayload(marker), _hp: 'i-am-a-bot' },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.ticket_id).toBeNull();

      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');
      const client = createGuardedServiceClient();
      const { data } = await client
        .from('customers')
        .select('id')
        .ilike('display_name', `%${marker}%`);
      expect(data ?? []).toHaveLength(0);
    });

    test('3. invalid payload is rejected with a 400 and validation issues', async ({ request }) => {
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: { firstName: 'Missing', lastName: 'Fields' },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.length).toBeGreaterThan(0);
    });

  });

  test.describe('POST /api/v1/quote-requests', () => {
    test('5. happy path creates a tasks row (not service_requests) and sends no email — locks in current behavior', async ({
      request,
    }) => {
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('QUOTEREQ');
      const email = `${marker.toLowerCase()}@example.com`;

      const response = await request.post(QUOTE_REQUESTS_ENDPOINT, {
        data: {
          name: marker,
          email,
          description: 'E2E quote-request bot: interested in exterior painting.',
          service_needed: 'Exterior painting',
          timeline: 'flexible',
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.ticket_id).toBeTruthy();

      const client = createGuardedServiceClient();
      const { data: task } = await client
        .from('tasks')
        .select('id, customer_id')
        .eq('id', body.data.ticket_id)
        .maybeSingle();
      expect(task).toBeTruthy();

      // Locks in the documented divergence: no service_requests row at all
      // for this endpoint.
      const { data: matchingServiceRequests } = await client
        .from('service_requests')
        .select('id')
        .eq('customer_id', task!.customer_id);
      expect(matchingServiceRequests ?? []).toHaveLength(0);

      await cleanupTestCustomerByMarker({ marker, email });
    });

    test('6. deduplicates by email on a second submission from the same address', async ({ request }) => {
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('QUOTEREQ_DEDUPE');
      const email = `${marker.toLowerCase()}@example.com`;
      const payload = {
        name: marker,
        email,
        description: 'First submission.',
      };

      const first = await request.post(QUOTE_REQUESTS_ENDPOINT, { data: payload });
      expect(first.status()).toBe(200);
      const firstBody = await first.json();

      const second = await request.post(QUOTE_REQUESTS_ENDPOINT, {
        data: { ...payload, description: 'Second submission, same email.' },
      });
      expect(second.status()).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.data.message).toMatch(/already/i);

      const client = createGuardedServiceClient();
      const { data: customers } = await client
        .from('customers')
        .select('id')
        .ilike('display_name', `%${marker}%`);
      expect(customers ?? []).toHaveLength(1);

      expect(firstBody.data.ticket_id).not.toBe(secondBody.data.ticket_id);

      await cleanupTestCustomerByMarker({ marker, email });
    });
  });

  test.describe('(app)/requests review page', () => {
    test('7. UI + DB: owner marks a new request as reviewing', async ({ page, request }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

      const marker = buildMarker('INTAKE_REVIEW');
      const email = `${marker.toLowerCase()}@example.com`;
      // Unique phone per test run — see the happy-path test above for why
      // the shared default phone number is unsafe here.
      const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
        data: buildServiceRequestPayload(marker, {
          emailAddress: email,
          phoneNumber: `555-021-${Date.now().toString().slice(-4)}`,
        }),
      });
      const body = await response.json();
      const requestId = body.data.ticket_id as string;

      const session = createTestSession(page);
      await loginAsAdmin(session);

      await page.goto(routes.requests);
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
      await page.goto(`/requests/${requestId}`);
      await page.getByRole('button', { name: /mark as reviewed/i }).click();

      const client = createGuardedServiceClient();
      await expect(async () => {
        const { data } = await client
          .from('service_requests')
          .select('status')
          .eq('id', requestId)
          .maybeSingle();
        expect(data?.status).toBe('reviewing');
      }).toPass({ timeout: 10_000 });

      await cleanupTestCustomerByMarker({ marker, email });
      await session.finish();
    });
  });

  // Deliberately last: this exhausts the in-memory, per-IP hourly quota
  // shared by every test in this file that hits /api/v1/service-requests
  // (no x-forwarded-for header from the test runner, so they all share one
  // bucket) — any test declared after this one would itself get 429'd.
  test.describe('POST /api/v1/service-requests rate limiting', () => {
    test('8. exceeding the per-IP rate limit returns 429', async ({ request }) => {
      // Each iteration needs a genuinely distinct customer (unique phone,
      // not just unique email) — createServiceRequest() falls back to
      // phone-based dedup, and a shared phone across iterations collapses
      // them onto one customer, breaking per-marker cleanup below.
      test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify/clean up DB state');

      const createdMarkers: string[] = [];
      let sawRateLimited = false;
      for (let i = 0; i < 15 && !sawRateLimited; i += 1) {
        const marker = buildMarker(`INTAKE_RATE_${i}`);
        const response = await request.post(SERVICE_REQUESTS_ENDPOINT, {
          data: buildServiceRequestPayload(marker, {
            phoneNumber: `555-0${(100 + i).toString().padStart(6, '0')}`,
          }),
        });
        if (response.status() === 429) {
          sawRateLimited = true;
          const body = await response.json();
          expect(body.success).toBe(false);
          expect(body.code).toBe('RATE_LIMITED');
        } else {
          expect(response.status()).toBe(200);
          createdMarkers.push(marker);
        }
      }
      expect(sawRateLimited, 'expected at least one 429 within 15 attempts').toBe(true);

      for (const marker of createdMarkers) {
        await cleanupTestCustomerByMarker({ marker, email: `${marker.toLowerCase()}@example.com` });
      }
    });
  });
});
