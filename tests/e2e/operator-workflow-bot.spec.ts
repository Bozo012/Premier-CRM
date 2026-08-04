/**
 * operator-workflow-bot: simulates how Premier Property Maintenance's owner
 * actually uses the CRM during a workday — login, check the dashboard, find
 * a customer, review their property/history, create some work, jot a note,
 * and get back to the dashboard. One realistic script, not exhaustive
 * per-feature coverage (that's what the other bots are for).
 *
 * Every step below is a real, driven UI action except where marked TODO —
 * those are workflow steps the app doesn't support yet, documented rather
 * than faked. See tests/e2e/README.md "Operator Workflow Bot" for the full
 * list and why.
 */

import { test, expect } from '@playwright/test';
import { hasAdminCredentials } from './utils/auth';
import { loginAsAdmin } from './context/auth';
import { createTestSession } from './context/session';
import { gotoCustomers, gotoDashboard } from './context/navigation';
import { customers as customersSelectors } from './utils/selectors';

test.describe('operator workflow bot', () => {
  test('a realistic workday: dashboard, find customer, review, create work, back to dashboard', async ({
    page,
  }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');

    const session = createTestSession(page);

    // ---- Login ----
    await loginAsAdmin(session);

    // ---- Dashboard ----
    await session.metrics.measure('Open Dashboard', () => gotoDashboard(page));

    // A customer needs to exist before the owner can "find" them — created
    // here via session.customer() (the real /customers/new flow under the
    // hood, context/customer.ts), standing in for a customer already on file
    // from a previous day. Must go through session.customer() rather than
    // calling createTestCustomer() directly — only the session method
    // registers the customer for cleanup; a direct call leaves it orphaned
    // (found live: a customer + job created this way survived session.finish()
    // untouched, since cleanup only ever removes what was registered).
    const customer = await session.customer();

    // ---- Locate customer (real search, not a direct id lookup) ----
    await session.metrics.measure('Search Customer', async () => {
      await gotoCustomers(page);
      await customersSelectors.searchInput(page).fill(customer.marker);
      await page.waitForURL(new RegExp(`[?&]q=${encodeURIComponent(customer.marker)}`), {
        timeout: 5_000,
      });
    });
    await expect(page.getByRole('link', { name: customer.marker })).toBeVisible();

    // ---- Open customer ----
    await session.metrics.measure('Open Customer', async () => {
      await page.getByRole('link', { name: customer.marker }).click();
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
    });

    // ---- Open property ----
    // session.property() already times itself as "Create Property" — don't
    // wrap it again here, or the metrics report double-counts it.
    const property = await session.property(customer);
    await session.metrics.measure('Open Property', async () => {
      // session.property() left us on the customer detail page after
      // creating it (properties-card.tsx uses router.refresh(), not
      // navigation) — the new property's link is already on screen.
      await page.getByRole('link', { name: new RegExp(property.addressLine1) }).click();
      // Scoped to the heading — the property detail page's <h1> and its own
      // address text both contain this string (strict-mode violation
      // otherwise; see customer-command-center-bot.spec.ts's same fix).
      await expect(
        page.getByRole('heading', { name: new RegExp(property.addressLine1) })
      ).toBeVisible();
    });

    // ---- Review history ----
    // Real, on the property detail page itself (apps/web/app/(app)/properties/[propertyId]/page.tsx
    // renders job history) — no separate navigation needed.
    await expect(page.getByText(/job history/i)).toBeVisible();

    // ---- Create job ----
    // Same as above — session.job()/.estimate()/.invoice() each time
    // themselves internally (see context/session.ts).
    const job = await session.job(customer, property);
    await expect(page.getByRole('heading', { name: job.title })).toBeVisible();

    // ---- Create estimate ----
    const estimate = await session.estimate(customer, property);
    await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();

    // ---- Create invoice (from the job) ----
    const invoice = await session.invoice(job);
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}$`));

    // ---- Record note ---- NOT IMPLEMENTED, see README "Notes"
    // ---- Upload document/photo ---- NOT IMPLEMENTED, see README "Documents"

    // ---- Return to dashboard ----
    await session.metrics.measure('Return to Dashboard', () => gotoDashboard(page));

    // ---- Verify the created job is real and findable ----
    // Forge V1.1 Today redesign (docs/ux/forge-v1.1-today-redesign.md)
    // deliberately removed Today's total-count snapshot cards (Kevin
    // decision: actionable operational counts only, never vanity totals —
    // a freshly-created, unscheduled job no longer moves any number on
    // Today, by design, since it isn't scheduled for today and Today no
    // longer shows a running total). The job's existence is instead
    // verified where it actually belongs: the jobs list itself.
    await page.goto('/jobs');
    await page.getByPlaceholder('Search by title, description, or job number...').fill(job.title);
    await page.getByPlaceholder('Search by title, description, or job number...').press('Enter');
    await page.waitForURL(new RegExp(`[?&]q=${encodeURIComponent(job.title)}`));
    await expect(page.getByRole('link', { name: job.title })).toBeVisible();

    await session.finish();
  });
});
