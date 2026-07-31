/**
 * data-consistency-bot: checks that numbers shown across screens agree with
 * each other — e.g. an invoice total matches the sum of its line items, and
 * revenue/reporting figures match the invoices that back them.
 *
 * Phase 9 of the 2026-07-31 workflow reliability audit: invoice-management-
 * bot is now fully implemented (create/send/pay/void), so the two tests
 * below that only needed a known test invoice are now reachable. The
 * remaining three still need a product decision (an undefined revenue-
 * reporting surface, dependency on customer-command-center-bot TODOs that
 * are themselves blocked on UI that doesn't exist yet, and commercial-vs-
 * residential pricing logic with no defined UI surface) — left skipped.
 */

import { test, expect } from '@playwright/test';

import { hasAdminCredentials } from './utils/auth';
import { hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';
import { addInvoiceLineItem } from './context/invoice';
import { routes } from './utils/selectors';

test.describe('data consistency bot', () => {
  test('invoice total equals the sum of its line items', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);
    const invoice = await session.invoice();

    await addInvoiceLineItem(page, invoice); // qty 1 * $100 = $100
    await addInvoiceLineItem(page, invoice); // + qty 1 * $100 = $200 total

    await page.goto(invoice.url);
    // "Amount due" appears in a DetailRow — the invoice has no tax/discount
    // set, so total === subtotal === sum of the two $100 line items.
    await expect(page.getByText('$200.00').first()).toBeVisible({ timeout: 10_000 });

    await session.finish();
  });

  test('invoice list totals match invoice detail totals', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_* not set in .env.test');
    test.skip(!hasServiceRoleCleanupCredentials(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot verify DB state');

    const session = createTestSession(page);
    await loginAsAdmin(session);
    const invoice = await session.invoice();
    await addInvoiceLineItem(page, invoice);

    await page.goto(invoice.url);
    await expect(page.getByText(/\$100\.00/).first()).toBeVisible({ timeout: 10_000 });

    await page.goto(routes.invoices);
    const row = page.locator(`li:has(a[href="/invoices/${invoice.id}"])`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Both surfaces show the same $100.00 total for this invoice — the
    // detail page's DetailRow text ("Total: $100.00") and the list row's
    // bare amount both contain the same dollar figure.
    await expect(row.getByText(/\$100\.00/).first()).toBeVisible();

    await session.finish();
  });

  test.skip('revenue summary matches sum of paid invoices in the period', async () => {
    // TODO: needs a defined reporting/dashboard surface for revenue — flag
    // for a product decision on where this lives before implementing.
  });

  test.skip('customer command center invoice count matches invoices list filtered by customer', async () => {
    // TODO: depends on customer-command-center-bot fixtures.
  });

  test.skip('material pass-through and markup totals reconcile for a commercial vs residential job', async () => {
    // TODO: exercises the business-model-specific pricing logic (flat trip
    // fees, materials at cost for residential vs. markup for commercial) —
    // needs a product decision on which UI surfaces this before writing
    // assertions.
  });
});
