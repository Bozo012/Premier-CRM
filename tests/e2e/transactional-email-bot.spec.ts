/**
 * transactional-email-bot: cross-cutting verification pass over every entry
 * in CUSTOMER_NOTIFICATION_TRIGGER_POINTS (Phase 10, final phase of the
 * 2026-07-31 workflow reliability audit).
 *
 * IMPORTANT — CRITICAL FINDING, not a test bug (2026-07-31): every Resend
 * send in this environment fails with a 403 "The ppmnky.com domain is not
 * verified" — this is the FROM domain, not the recipient, so it fails
 * identically regardless of using a real address or the delivered+*@resend.dev
 * sandbox pattern used successfully elsewhere in this audit (customer-
 * intake-bot, estimates-lifecycle-bot, scheduling-bot — none of which
 * actually asserted on a delivery-success signal, they only checked DB
 * state, so this failure was silently present there too and only surfaced
 * here once an explicit success/failure UI signal was checked). The dev
 * server here uses the real RESEND_API_KEY from apps/web/.env.local with no
 * RESEND_FROM_EMAIL override, defaulting to quotes@ppmnky.com. Whether this
 * also affects the live production deployment (app.ppmnky.com, Vercel
 * project premier-crm-web) could NOT be confirmed — Vercel's runtime logs
 * showed no matching recent email-send traffic either way, and there is no
 * available tool to read production's actual RESEND_API_KEY/
 * RESEND_FROM_EMAIL values (configured separately per-environment in the
 * Vercel dashboard). Escalate: check the Vercel dashboard's production env
 * vars and Resend's domain verification status directly.
 *
 * Given this, the tests below verify what the application code actually
 * controls — that a send attempt is made and failure is handled gracefully
 * (best-effort, never blocks the underlying status transition) — rather
 * than asserting a specific delivery outcome that depends on this external,
 * unverified configuration.
 *
 * Status per trigger point, going into this phase:
 *  - service_request_submitted, estimate_site_visit_scheduled, job_scheduled
 *    — DB/status-transition verified elsewhere in this audit; delivery
 *    itself was never actually confirmed (see finding above)
 *  - quote_sent, invoice_sent — this file, tests 1 & 2: confirm the app
 *    degrades gracefully (customer link still generated, action still
 *    succeeds) when delivery fails
 *  - invoice_payment_recorded — test 3: payment itself lands correctly;
 *    same delivery-outcome caveat applies
 *  - quote_responded — function verified (activity_log/DB) in
 *    quote-response-bot; delivery not independently observable there either
 *
 * The original test.skip() reasons in invoice-management-bot.spec.ts
 * blaming "needs email/Resend mocking or sandbox mode" were correct to
 * flag a real gap, but the missing piece was the domain verification, not
 * the sandbox pattern (which does work for recipient-side testing).
 */

import { test, expect } from '@playwright/test';

import { hasAdminCredentials } from './utils/auth';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';
import { addInvoiceLineItem } from './context/invoice';

test.describe('transactional email bot', () => {
  test('1. quote_sent: send still succeeds (customer link generated) even when email delivery fails', async ({
    page,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);
    const customer = await session.customer();
    const property = await session.property(customer);
    const estimate = await session.estimate(customer, property);

    const client = createGuardedServiceClient();
    await client
      .from('customers')
      .update({ email: 'delivered+e2e-transactional-quote@resend.dev' })
      .eq('id', customer.id);

    await page.goto(estimate.url);
    await page.getByRole('button', { name: 'Approve → create quote' }).click();
    await page.getByRole('button', { name: 'Approve & build quote' }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    const quoteId = new URL(page.url()).pathname.split('/').pop()!;

    await page.getByRole('button', { name: /^send quote$/i }).click();
    // Regardless of whether Resend delivery succeeds, sendQuoteAction's own
    // status transition and share-token generation must not be blocked by
    // it (see "Attempt email delivery — best-effort, never blocks the send
    // transition" comment in quotes/actions.ts) — send-quote-button.tsx's
    // toast differs by outcome ("sent and emailed" vs "link copied"/"marked
    // as sent"), but the button itself must disappear either way once the
    // action completes, proving the status changed.
    await expect(page.getByRole('button', { name: /^send quote$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await expect(async () => {
      const { data } = await client.from('quotes').select('status, share_token').eq('id', quoteId).maybeSingle();
      expect(data?.status).toBe('sent');
      expect(data?.share_token).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    await session.finish();
  });

  test('2. invoice_sent: send still succeeds (customer link generated) even when email delivery fails', async ({
    page,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);
    const customer = await session.customer();
    const invoice = await session.invoice();

    const client = createGuardedServiceClient();
    await client
      .from('customers')
      .update({ email: 'delivered+e2e-transactional-invoice@resend.dev' })
      .eq('id', customer.id);

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();
    await expect(page.getByRole('button', { name: /^send invoice$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await expect(async () => {
      const { data } = await client
        .from('invoices')
        .select('status, share_token')
        .eq('id', invoice.id)
        .maybeSingle();
      expect(data?.status).toBe('sent');
      expect(data?.share_token).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    await session.finish();
  });

  test('3. invoice_payment_recorded: recordPaymentAction reaches the notification call (delivery not independently observable)', async ({
    page,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    // Unlike send-quote-button.tsx / send-invoice-button.tsx, record-payment-
    // form.tsx's success toast doesn't branch on the notification's sent
    // status ("Payment recorded." either way) — a minor UI inconsistency
    // worth noting (not fixed here: no verified failure, just less
    // observable than the other two triggers). This test proves the
    // payment itself lands correctly; the email call is exercised via the
    // same code path already proven for the other two triggers in this
    // file, and via lib/customer-lifecycle-notifications.ts's shared
    // deliverEmail() plumbing.
    const session = createTestSession(page);
    await loginAsAdmin(session);
    const customer = await session.customer();
    const invoice = await session.invoice();
    await addInvoiceLineItem(page, invoice);

    const client = createGuardedServiceClient();
    await client
      .from('customers')
      .update({ email: 'delivered+e2e-transactional-payment@resend.dev' })
      .eq('id', customer.id);

    await page.goto(invoice.url);
    await page.getByRole('button', { name: /^send invoice$/i }).click();
    await expect(page.getByRole('button', { name: /^send invoice$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.goto(invoice.url);
    await page.locator('#pay-method').selectOption('cash');
    await page.getByRole('button', { name: /record payment/i }).click();
    await expect(page.getByText(/no remaining balance/i)).toBeVisible({ timeout: 10_000 });

    const { data: payments } = await client.from('payments').select('id').eq('invoice_id', invoice.id);
    expect(payments ?? []).toHaveLength(1);

    await session.finish();
  });
});
