/**
 * working-invoice-protection-bot: proves the vNext stabilization fix for
 * A2 — a working invoice's `kind` can never change to anything else, at
 * the DB layer, even via a direct API write bypassing the UI entirely
 * (matching staff-permissions-bot's "hidden UI is not proof" standard).
 *
 * Root cause this closes: updateInvoiceMetadata() previously allowed
 * changing `kind` with only an app-level `status = 'draft'` check — no DB
 * trigger stopped it. Migration
 * supabase/migrations/20260801000000_lock_working_invoice_kind.sql adds
 * invoices_prevent_working_kind_change, a BEFORE UPDATE OF kind trigger
 * that fires for every role including service_role.
 *
 * This bot creates its own working-invoice row directly via the guarded
 * service-role client rather than driving the full quote-accept-schedule
 * UI flow (already proven end to end by integrated-lifecycle-bot) — the
 * thing under test here is the DB trigger, not the lifecycle that leads to
 * a working invoice existing.
 */

import { test, expect } from '@playwright/test';

import { createTestSession } from './context/session';
import { createScenario } from './context/scenario';
import { loginAsAdmin } from './context/auth';
import { hasAdminCredentials, hasApiTestCredentials } from './utils/auth';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { routes } from './utils/selectors';

const canRun = () => hasAdminCredentials() && hasApiTestCredentials() && hasServiceRoleCleanupCredentials();
const SKIP_REASON =
  'TEST_ADMIN_*, NEXT_PUBLIC_SUPABASE_ANON_KEY, and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('working invoice protection bot', () => {
  test.describe.serial('kind is locked at the DB layer (A2)', () => {
    let session: ReturnType<typeof createTestSession>;
    let jobId: string;
    let orgId: string;
    let workingInvoiceId: string;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);

      const page = await browser.newPage();
      session = createTestSession(page);
      await loginAsAdmin(session);

      const scenario = await createScenario(session, { job: true });
      jobId = scenario.job!.id;

      const client = createGuardedServiceClient();
      const { data: job } = await client.from('jobs').select('org_id').eq('id', jobId).maybeSingle();
      orgId = job!.org_id;

      const { data: invoice, error } = await client
        .from('invoices')
        .insert({
          org_id: orgId,
          job_id: jobId,
          kind: 'working',
          status: 'draft',
          title: 'E2E working invoice protection fixture',
        })
        .select('id')
        .single();

      if (error || !invoice) {
        throw new Error(`Failed to create fixture working invoice: ${error?.message}`);
      }
      workingInvoiceId = invoice.id;
    });

    test.afterAll(async () => {
      if (workingInvoiceId) {
        const client = createGuardedServiceClient();
        await client.from('invoices').delete().eq('id', workingInvoiceId);
      }
      await session?.finish();
    });

    test('1. a direct API kind change is rejected by the DB trigger', async () => {
      const client = createGuardedServiceClient();
      const { error } = await client
        .from('invoices')
        .update({ kind: 'standalone' })
        .eq('id', workingInvoiceId);

      expect(error).toBeTruthy();
      expect(error?.message ?? '').toMatch(/working invoice.*kind cannot be changed/i);

      const { data: unchanged } = await client
        .from('invoices')
        .select('kind')
        .eq('id', workingInvoiceId)
        .maybeSingle();
      expect(unchanged?.kind).toBe('working');
    });

    test('2. the invoice detail page hides edit/send/pay controls for a working invoice', async () => {
      const { page } = session;
      await page.goto(`${routes.invoices}/${workingInvoiceId}`);

      await expect(page.getByText(/this is a working invoice/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /^send invoice$/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^void invoice$/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^record payment$/i })).toHaveCount(0);
    });
  });
});
