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

import { test, expect, type Page } from '@playwright/test';
import { hasAdminCredentials } from './utils/auth';
import { loginAsAdmin } from './context/auth';
import { createTestSession } from './context/session';
import { gotoCustomers, gotoDashboard } from './context/navigation';
import { createTestCustomer } from './context/customer';
import { customers as customersSelectors, today } from './utils/selectors';

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
    const jobsCountBefore = await readJobsCount(page);

    // A customer needs to exist before the owner can "find" them — created
    // here via the real /customers/new flow (context/customer.ts), standing
    // in for a customer already on file from a previous day.
    const customer = await session.metrics.measure('Seed: Create Customer', () =>
      createTestCustomer(page)
    );

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
    const property = await session.metrics.measure('Create Property', () =>
      session.property(customer)
    );
    await session.metrics.measure('Open Property', async () => {
      // session.property() left us on the customer detail page after
      // creating it (properties-card.tsx uses router.refresh(), not
      // navigation) — the new property's link is already on screen.
      await page.getByRole('link', { name: new RegExp(property.addressLine1) }).click();
      await expect(page.getByText(property.addressLine1)).toBeVisible();
    });

    // ---- Review history ----
    // Real, on the property detail page itself (apps/web/app/(app)/properties/[propertyId]/page.tsx
    // renders job history) — no separate navigation needed.
    await expect(page.getByText(/job history/i)).toBeVisible();

    // ---- Create job ----
    const job = await session.metrics.measure('Create Job', () =>
      session.job(customer, property)
    );
    await expect(page.getByRole('heading', { name: job.title })).toBeVisible();

    // ---- Create estimate ----
    const estimate = await session.metrics.measure('Create Estimate', () =>
      session.estimate(customer, property)
    );
    await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();

    // ---- Create invoice (from the job) ----
    const invoice = await session.metrics.measure('Create Invoice', () => session.invoice(job));
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}$`));

    // ---- Record note ---- NOT IMPLEMENTED, see README "Notes"
    // ---- Upload document/photo ---- NOT IMPLEMENTED, see README "Documents"

    // ---- Return to dashboard ----
    await session.metrics.measure('Return to Dashboard', () => gotoDashboard(page));

    // ---- Verify dashboard reflects changes ----
    // The "Business snapshot" Jobs count is the one dashboard number this
    // workflow can actually move (see tests/e2e/README.md "Dashboard" — the
    // "Today's work" list only shows jobs scheduled for today, and our test
    // job has no scheduled_start, so it won't appear there).
    const jobsCountAfter = await readJobsCount(page);
    expect(jobsCountAfter).toBeGreaterThan(jobsCountBefore);

    await session.finish();
  });
});

async function readJobsCount(page: Page): Promise<number> {
  const text = await today.jobsCount(page).innerText();
  return Number(text.replace(/[^0-9]/g, ''));
}
