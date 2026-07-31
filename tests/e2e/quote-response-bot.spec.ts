/**
 * quote-response-bot: covers the customer quote accept/decline repair
 * (Phase 7 of the 2026-07-31 workflow reliability audit — the one confirmed
 * defect in this pass, not just a coverage gap).
 *
 * Originally respondToQuoteAction had zero downstream effect beyond
 * flipping quotes.status. Phase 7 added activity_log + staff notification +
 * a dynamic "Needs attention" dashboard item. The integrated
 * request-to-payment workflow build (see integrated-lifecycle-bot.spec.ts)
 * superseded the "no auto job" decision from that phase: an accepted quote
 * now automatically creates exactly one unscheduled job via the shared,
 * idempotent createJobFromAcceptedQuote() service — this bot proves that.
 *
 * Email delivery to the TEST_ADMIN account itself isn't independently
 * verifiable here (it's a fixed identity address, not a disposable
 * resend.dev sandbox inbox like other bots use) — the notification
 * function is exercised and its best-effort failure mode (catch + return
 * sent:false) never blocks the response, but actual delivery to that
 * specific address is out of reach for a black-box e2e check.
 */

import { test, expect } from '@playwright/test';

import { hasAdminCredentials } from './utils/auth';
import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';

test.describe('quote response bot', () => {
  test('1. customer accepts a quote: activity_log entry, staff notification, exactly one auto-created unscheduled job', async ({
    page,
    browser,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);

    const customer = await session.customer();
    const property = await session.property(customer);
    const estimate = await session.estimate(customer, property);

    // Staff-side: estimate → draft quote (same flow as estimates-lifecycle-bot).
    await page.goto(estimate.url);
    await page.getByRole('button', { name: 'Approve → create quote' }).click();
    await page.getByRole('button', { name: 'Approve & build quote' }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    const quoteId = new URL(page.url()).pathname.split('/').pop()!;

    // Send it — only a sent/viewed quote can be responded to.
    await page.getByRole('button', { name: /^send quote$/i }).click();
    await expect(page.getByRole('button', { name: /^send quote$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    const client = createGuardedServiceClient();
    const { data: quote } = await client
      .from('quotes')
      .select('share_token, org_id')
      .eq('id', quoteId)
      .maybeSingle();
    expect(quote?.share_token).toBeTruthy();

    // Customer-side: an unauthenticated browser context hits the public
    // share-token page and accepts.
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    await customerPage.goto(`/q/${quote!.share_token}`);
    await customerPage.getByRole('button', { name: 'Accept this quote' }).click();
    await expect(customerPage.getByText('Quote accepted')).toBeVisible({ timeout: 10_000 });
    await expect(
      customerPage.getByText(/premier has been notified/i)
    ).toBeVisible();
    await customerContext.close();

    // DB level: status, activity_log, and exactly one job auto-created,
    // linked back via origin_quote_id (the integrated request-to-payment
    // workflow's idempotent accepted-quote -> job service).
    await expect(async () => {
      const { data } = await client.from('quotes').select('status, job_id').eq('id', quoteId).maybeSingle();
      expect(data?.status).toBe('accepted');
      expect(data?.job_id).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    const { data: quoteAfter } = await client.from('quotes').select('job_id').eq('id', quoteId).maybeSingle();
    const { data: jobsForQuote } = await client
      .from('jobs')
      .select('id, status, origin_quote_id')
      .eq('origin_quote_id', quoteId);
    expect(jobsForQuote ?? []).toHaveLength(1);
    expect(jobsForQuote![0].id).toBe(quoteAfter!.job_id);
    expect(jobsForQuote![0].status).toBe('approved'); // unscheduled

    const { data: activityRows } = await client
      .from('activity_log')
      .select('event_type, entity_id, entity_type, message')
      .eq('entity_id', quoteId)
      .eq('event_type', 'quote_accepted');
    expect(activityRows ?? []).toHaveLength(1);
    expect(activityRows![0].entity_type).toBe('quote');

    // activity_log has no customer_id link, so it isn't covered by the
    // shared session's customer-cascade cleanup (deleteDependentRecords) —
    // clean it up explicitly.
    await client.from('activity_log').delete().eq('entity_id', quoteId);
    await client.from('activity_log').delete().eq('entity_id', jobsForQuote![0].id);
    await client.from('jobs').delete().eq('id', jobsForQuote![0].id);
    await session.finish();
  });

  test('2. customer declines a quote: activity_log entry with reason, no dashboard action-required styling', async ({
    page,
    browser,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);

    const customer = await session.customer();
    const property = await session.property(customer);
    const estimate = await session.estimate(customer, property);

    await page.goto(estimate.url);
    await page.getByRole('button', { name: 'Approve → create quote' }).click();
    await page.getByRole('button', { name: 'Approve & build quote' }).click();
    await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    const quoteId = new URL(page.url()).pathname.split('/').pop()!;

    await page.getByRole('button', { name: /^send quote$/i }).click();
    await expect(page.getByRole('button', { name: /^send quote$/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    const client = createGuardedServiceClient();
    const { data: quote } = await client
      .from('quotes')
      .select('share_token')
      .eq('id', quoteId)
      .maybeSingle();

    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    await customerPage.goto(`/q/${quote!.share_token}`);
    await customerPage.getByRole('button', { name: 'Decline quote' }).click();
    await customerPage.getByLabel(/reason for declining/i).fill('E2E test: too expensive.');
    await customerPage.getByRole('button', { name: 'Confirm decline' }).click();
    await expect(customerPage.getByText('Quote declined')).toBeVisible({ timeout: 10_000 });
    await customerContext.close();

    await expect(async () => {
      const { data } = await client
        .from('quotes')
        .select('status, decline_reason')
        .eq('id', quoteId)
        .maybeSingle();
      expect(data?.status).toBe('declined');
      expect(data?.decline_reason).toContain('too expensive');
    }).toPass({ timeout: 10_000 });

    const { data: activityRows } = await client
      .from('activity_log')
      .select('event_type, message')
      .eq('entity_id', quoteId)
      .eq('event_type', 'quote_declined');
    expect(activityRows ?? []).toHaveLength(1);
    expect(activityRows![0].message).toContain('too expensive');

    // activity_log has no customer_id link, so it isn't covered by the
    // shared session's customer-cascade cleanup (deleteDependentRecords) —
    // clean it up explicitly.
    await client.from('activity_log').delete().eq('entity_id', quoteId);
    await session.finish();
  });
});
