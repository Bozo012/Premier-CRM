/**
 * invoice-delivery-status-bot: E2E proof for BLOCKER 1 in
 * docs/ops/invoice-cutover-readiness.md — "an invoice can be marked sent
 * even if the email was not delivered, with no signal to staff."
 *
 * This environment's Resend sending domain is genuinely unverified (see
 * transactional-email-bot.spec.ts's documented 403), so every test below
 * exercises the real, live FAILURE path — no email is sent by this file,
 * satisfying "do not send real emails from E2E simply to satisfy the
 * test." The SUCCESS path (Resend actually accepting a send) is proven
 * separately, with the provider mocked, in actions.test.ts (vitest) —
 * mocking is not possible here because the Resend call happens
 * server-side inside the Next.js process, not in the browser Playwright
 * controls.
 */

import { test, expect } from '@playwright/test';
import { hasAdminCredentials } from './utils/auth';
import { createTestSession } from './context/session';
import { loginAsAdmin as loginSessionAsAdmin } from './context/auth';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';

test.describe('invoice delivery status bot', () => {
  test('a failed email delivery is logged truthfully and shown to staff — never as a false success', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();

    const client = createGuardedServiceClient();

    // Financial/business state transition happens regardless of email outcome.
    await expect(async () => {
      const { data } = await client.from('invoices').select('status, share_token').eq('id', invoice.id).maybeSingle();
      expect(data?.status).toBe('sent');
      expect(data?.share_token).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // The real delivery outcome is durably logged — this environment's
    // Resend domain is unverified, so this MUST be invoice_email_failed,
    // never invoice_email_sent (that would be a false positive).
    await expect(async () => {
      const { data } = await client
        .from('activity_log')
        .select('event_type')
        .eq('entity_type', 'invoice')
        .eq('entity_id', invoice.id)
        .in('event_type', ['invoice_email_sent', 'invoice_email_failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(data?.event_type).toBe('invoice_email_failed');
    }).toPass({ timeout: 10_000 });

    // Reload — the durable status indicator (not the ephemeral toast) must
    // still show the true failure state after navigation away and back.
    await page.goto(invoice.url);
    await expect(page.getByText(/could not be sent/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /retry email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy invoice link/i })).toBeVisible();

    await session.finish();
  });

  test('retrying a failed delivery never changes invoice financial state', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginSessionAsAdmin(session);
    const invoice = await session.invoice();

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();

    const client = createGuardedServiceClient();
    await expect(async () => {
      const { data } = await client.from('invoices').select('status').eq('id', invoice.id).maybeSingle();
      expect(data?.status).toBe('sent');
    }).toPass({ timeout: 10_000 });

    const before = (
      await client.from('invoices').select('status, total, amount_paid, amount_due, share_token').eq('id', invoice.id).maybeSingle()
    ).data;

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /retry email/i }).click();
    await expect(page.getByText(/could not be sent/i)).toBeVisible({ timeout: 10_000 });

    const after = (
      await client.from('invoices').select('status, total, amount_paid, amount_due, share_token').eq('id', invoice.id).maybeSingle()
    ).data;

    expect(after).toEqual(before);

    // A second delivery attempt was logged (retry actually ran), and the
    // most recent one is still an honest failure.
    await expect(async () => {
      const { count } = await client
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'invoice')
        .eq('entity_id', invoice.id)
        .in('event_type', ['invoice_email_sent', 'invoice_email_failed']);
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 10_000 });

    await session.finish();
  });

  test('an unrecognized share token does not expose any invoice', async ({ page }) => {
    await page.goto('/i/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText(/could not be found|404/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
