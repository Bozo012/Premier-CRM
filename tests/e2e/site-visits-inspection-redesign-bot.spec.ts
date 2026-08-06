/**
 * site-visits-inspection-redesign-bot: UI-click coverage for the Site
 * Visit detail and Inspection routes, added in Base44 UX Batch 8
 * (docs/ux/forge-base44-batch-8-requests-site-visits-inspection-report.md),
 * updated for the Base44-exact 5-step inspection wizard (Arrival/Findings/
 * Measurements & Photos/Recommendations/Review) that replaced the flat
 * single-page InspectionForm — see
 * docs/ux/base44-exact-requests-site-visits-report.md.
 *
 * request-site-visit-workflow-bot already proves the full lifecycle at the
 * RPC/service-role level (schedule → start → save → complete, including the
 * `save_site_visit_inspection` authenticated-vs-service-role boundary) — not
 * duplicated here. This bot proves the InspectionWorkflow UI itself: step
 * navigation, field rendering per type/step, the autosave indicator,
 * completing through the real "Complete inspection" button (only reachable
 * from the final Review step), and — the one behavior no RPC-level test can
 * prove — that the completed-inspection summary is read from PERSISTED data
 * and survives a hard page refresh, not just in-memory form state.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { hasApiTestCredentials } from './utils/auth';
import { viewportProfiles } from './utils/mobile';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(account.email);
  await page.getByPlaceholder('Enter your password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today');
}

test.describe('site visits + inspection redesign bot', () => {
  test.describe.serial('start, fill, complete, and reload', () => {
    let admin: SupabaseClient<Database>;
    let orgId: string;
    let customerId: string;
    let propertyId: string;
    let requestId: string;
    let siteVisitId: string;
    const owner = { email: '', password: '', userId: '' };

    test.beforeAll(async () => {
      test.skip(!canRun(), SKIP_REASON);

      admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      orgId = crypto.randomUUID();
      await admin.from('organizations').insert({ id: orgId, name: 'E2E_SV_REDESIGN_ORG', slug: `e2e-sv-redesign-${Date.now()}` });

      const { data: customer } = await admin
        .from('customers')
        .insert({ org_id: orgId, type: 'residential', first_name: 'SVRedesign', last_name: 'Fixture', source: 'manual_staff_entry' })
        .select('id')
        .single();
      customerId = customer!.id;

      const { data: property } = await admin
        .from('properties')
        .insert({ org_id: orgId, address_line_1: '1 SV Redesign Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
        .select('id')
        .single();
      propertyId = property!.id;
      await admin.from('customer_properties').insert({ customer_id: customerId, property_id: propertyId, relationship: 'owner', is_primary: true });

      const { data: request } = await admin
        .from('service_requests')
        .insert({
          org_id: orgId, request_number: `E2E-SVR-${Date.now()}`, source: 'manual', status: 'reviewing', priority: 'normal',
          customer_id: customerId, property_id: propertyId, contact_name: 'SV Redesign Fixture',
          service_title: 'SV redesign bot test request', service_description: 'Testing the inspection UI', submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      requestId = request!.id;

      const email = `e2e-sv-redesign-owner-${Date.now()}@example.com`;
      const password = `SvRedesign_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(owner) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role: 'owner', status: 'active' });
      Object.assign(owner, { email, password, userId: created.user.id });

      const ownerClient = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await ownerClient.auth.signInWithPassword({ email, password });

      const { data: triageData, error: triageErr } = await ownerClient.rpc('record_request_triage', {
        p_request_id: requestId,
        p_decision: 'site_visit_required',
        p_reason: 'E2E: site-visits-inspection-redesign-bot fixture',
      });
      if (triageErr) throw new Error(`record_request_triage failed: ${triageErr.message}`);
      siteVisitId = (triageData as { siteVisitId: string }).siteVisitId;

      const start = new Date(Date.now() + 86_400_000).toISOString();
      const end = new Date(Date.now() + 90_000_000).toISOString();
      const { error: schedErr } = await ownerClient.rpc('schedule_site_visit', {
        p_site_visit_id: siteVisitId, p_start: start, p_end: end, p_assigned_user_id: owner.userId,
      });
      if (schedErr) throw new Error(`schedule_site_visit failed: ${schedErr.message}`);

      const { error: startErr } = await ownerClient.rpc('start_site_visit', { p_site_visit_id: siteVisitId });
      if (startErr) throw new Error(`start_site_visit failed: ${startErr.message}`);
    });

    test.afterAll(async () => {
      if (!admin) return;
      if (siteVisitId) {
        await admin.from('site_visit_appointments').delete().eq('site_visit_id', siteVisitId);
        await admin.from('site_visits').delete().eq('id', siteVisitId);
      }
      if (requestId) {
        await admin.from('activity_log').delete().eq('entity_id', requestId);
        await admin.from('service_requests').delete().eq('id', requestId);
      }
      if (customerId) {
        await admin.from('customer_properties').delete().eq('customer_id', customerId);
        await admin.from('customers').delete().eq('id', customerId);
      }
      if (propertyId) await admin.from('properties').delete().eq('id', propertyId);
      if (owner.userId) {
        await admin.from('org_members').delete().eq('user_id', owner.userId);
        await admin.auth.admin.deleteUser(owner.userId);
      }
      if (orgId) await admin.from('organizations').delete().eq('id', orgId);
    });

    test('1. inspection route renders as a 5-step wizard, starting on Arrival', async ({ page }) => {
      await login(page, owner);
      await page.goto(`/site-visits/${siteVisitId}/inspection`);

      // Step rail shows all 5 Base44-exact steps.
      await expect(page.getByRole('button', { name: /Arrival/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Findings/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Measurements & Photos/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Recommendations/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Review/ })).toBeVisible();

      // Arrival step's real field is visible immediately; the Complete
      // button is NOT — it only appears on the final Review step.
      await expect(page.getByLabel('Customer concerns')).toBeVisible();
      await expect(page.getByRole('button', { name: /complete inspection/i })).toHaveCount(0);
    });

    test('2. filling required fields across steps triggers autosave, then completing on Review persists the responses', async ({
      page,
    }) => {
      await login(page, owner);
      await page.goto(`/site-visits/${siteVisitId}/inspection`);

      // Step 1 — Arrival.
      await page.getByLabel('Customer concerns').fill('Gutter leaking near garage.');
      await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /^Continue$/ }).click();

      // Step 2 — Findings.
      await expect(page.getByLabel('Observed conditions')).toBeVisible();
      await page.getByLabel('Observed conditions').fill('Sagging gutter section, minor rust.');
      await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /^Continue$/ }).click();

      // Step 3 — Measurements & Photos (no required fields — just advance).
      await page.getByRole('button', { name: /^Continue$/ }).click();

      // Step 4 — Recommendations.
      await expect(page.getByLabel('Proposed scope')).toBeVisible();
      await page.getByLabel('Proposed scope').fill('Replace 12ft gutter run.');
      await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /^Continue$/ }).click();

      // Step 5 — Review: the real Complete inspection button only lives here.
      await expect(page.getByText(/ready to complete/i)).toBeVisible();
      await page.getByRole('button', { name: /complete inspection/i }).click();
      await expect(page.getByText(/findings locked/i)).toBeVisible({ timeout: 10_000 });

      const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: visit } = await client.from('site_visits').select('status, inspection_responses').eq('id', siteVisitId).maybeSingle();
      expect(visit?.status).toBe('completed');
      expect((visit?.inspection_responses as Record<string, unknown>)?.proposedScope).toBe('Replace 12ft gutter run.');
    });

    test('3. completed-inspection summary is read from persisted data — survives a hard refresh and a direct detail-route load', async ({
      page,
    }) => {
      await login(page, owner);

      // Direct load of the detail route (not navigated to from the
      // inspection page) — proves the summary comes from a server query,
      // not client-side navigation state.
      await page.goto(`/site-visits/${siteVisitId}`);
      await expect(page.getByText(/replace 12ft gutter run/i)).toBeVisible({ timeout: 10_000 });

      await page.reload();
      await expect(page.getByText(/replace 12ft gutter run/i)).toBeVisible({ timeout: 10_000 });

      // The inspection route itself is now read-only, still showing the
      // persisted values, not a blank form.
      await page.goto(`/site-visits/${siteVisitId}/inspection`);
      await expect(page.getByText(/findings locked/i)).toBeVisible();
      await expect(page.getByText(/replace 12ft gutter run/i)).toBeVisible();
    });

    for (const vp of viewportProfiles) {
      test.describe(`${vp.name} viewport (${vp.width}x${vp.height})`, () => {
        test.use({ viewport: { width: vp.width, height: vp.height } });

        test(`inspection form renders without horizontal overflow at ${vp.name}`, async ({ page }) => {
          await login(page, owner);
          await page.goto(`/site-visits/${siteVisitId}/inspection`);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          expect(overflow).toBeLessThanOrEqual(1);
        });
      });
    }
  });
});
