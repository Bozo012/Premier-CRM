/**
 * customer-command-center-bot: the customer detail page — the "command
 * center" view of a single customer's stats, properties, jobs, and quotes.
 *
 * Scope for this pass, verified directly against
 * apps/web/app/(app)/customers/[customerId]/page.tsx:
 *
 *  - ACTIVE: statistics visible (4 StatCards: total revenue, last contact,
 *    last completed job, outstanding invoices), Contact card, Account notes
 *    card, Properties tile (real link → its own detail page → back).
 *  - NOT IMPLEMENTED (documented, not invented):
 *    - "Recent jobs" and "Open quotes" list items render as plain text, not
 *      links (`ListCard`'s `item.href` is never set for either on this page)
 *      — there is no "navigate to filtered jobs/quotes for this customer"
 *      flow to test. Neither `/jobs` nor `/quotes` accepts a customer-scoping
 *      query param either (only free-text `q` + `status`).
 *    - There is no "Estimates" tile/section on this page at all.
 *    - There is no "Invoices" tile/list — "Outstanding invoices" is a bare
 *      stat number, not a link.
 *    - There is no Payments section anywhere on this page (payments are only
 *      recordable per-invoice, on the invoice detail page).
 *    - "Account notes" is read-only (`customer.notes` rendered as plain
 *      text) — no add/edit-note UI exists.
 *    - There is no Documents section or upload UI anywhere in the app.
 *
 * The "active surfaces" block shares ONE TestSession (and one page) across
 * both tests via `test.beforeAll`/`test.afterAll` — not one session per test.
 * Calling `session.finish()` per test would flush cleanup (deleting the
 * customer) before the next test in the same serial block still needed it.
 * This is the standard Playwright pattern for sharing state across a
 * `describe.serial` block: `test.beforeAll(({ browser }) => ...)` opens one
 * page manually since the `page` fixture itself is per-test, not per-file.
 */

import { test, expect } from '@playwright/test';
import { hasAdminCredentials } from './utils/auth';
import { loginAsAdmin } from './context/auth';
import { createTestSession, type TestSession } from './context/session';
import { gotoCustomer } from './context/navigation';
import type { CustomerFixture } from './context/customer';
import type { PropertyFixture } from './context/property';

test.describe('customer command center bot', () => {
  test.describe.serial('command center — active surfaces', () => {
    let session: TestSession;
    let customer: CustomerFixture;
    let property: PropertyFixture;

    test.beforeAll(async ({ browser }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      const page = await browser.newPage();
      session = createTestSession(page);
      await loginAsAdmin(session);
    });

    test.afterAll(async () => {
      if (!session) return;
      await session.finish();
      await session.page.close();
    });

    test('opens a customer and sees stats, contact, and notes', async () => {
      customer = await session.customer();
      await gotoCustomer(session.page, customer);

      const page = session.page;
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Total revenue' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Last contact' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Last completed job' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Outstanding invoices' })).toBeVisible();
      // exact: true — "Contact" is otherwise a substring match of the
      // "Last contact" StatCard heading above (Playwright's default name
      // match is substring, not exact).
      await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Account notes' })).toBeVisible();
      await expect(page.getByText(customer.email)).toBeVisible();
    });

    test('properties tile: navigate to a property and back', async () => {
      property = await session.property(customer);
      const page = session.page;
      await gotoCustomer(page, customer);

      const propertyLink = page.getByRole('link', { name: new RegExp(property.addressLine1) });
      await expect(propertyLink).toBeVisible();
      await propertyLink.click();

      await expect(page).toHaveURL(new RegExp(`/properties/${property.id}$`));
      // Property detail page's <h1> and its own address text both contain
      // this string — scope to the heading to avoid a strict-mode violation.
      await expect(
        page.getByRole('heading', { name: new RegExp(property.addressLine1) })
      ).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
    });

    test('session fixtures are reused, not recreated, on a second call', async () => {
      // Core Phase 2 guarantee: session.customer()/.property() create once and
      // return the cached fixture on every later call in the same session —
      // "create if missing, reuse if already created" (see context/session.ts).
      // Calling them again here must return the exact same ids as above, not
      // create a second customer/property.
      const sameCustomer = await session.customer();
      const sameProperty = await session.property(customer);

      expect(sameCustomer.id).toBe(customer.id);
      expect(sameProperty.id).toBe(property.id);
    });
  });

  test.skip('jobs tile: navigate to filtered jobs for this customer', async () => {
    // NOT IMPLEMENTED: "Recent jobs" list items on the customer detail page
    // render as plain text (ListCard's item.href is never set for jobs — see
    // apps/web/app/(app)/customers/[customerId]/page.tsx), and /jobs has no
    // customer-scoping query param (only `q` free-text search and `status`).
    // There is no "filtered jobs for this customer" view anywhere in the app
    // to navigate to. Revisit once either becomes true.
  });

  test.skip('invoices tile: navigate to filtered invoices for this customer', async () => {
    // NOT IMPLEMENTED: "Outstanding invoices" is a bare stat number on the
    // customer detail page, not a link or list. There is no invoices section
    // on this page, and /invoices has no customer-scoping query param.
  });

  test.skip('estimates tile: navigate to filtered estimates for this customer', async () => {
    // NOT IMPLEMENTED: there is no "Estimates" tile/section on the customer
    // detail page at all — only "Recent jobs" and "Open quotes". /estimates
    // has no customer-scoping query param either.
  });

  test.skip('payments: view payments recorded against this customer', async () => {
    // NOT IMPLEMENTED: there is no customer-level payments view anywhere.
    // Payments are only recordable/viewable per-invoice, via
    // record-payment-form.tsx on the invoice detail page (see
    // context/invoice.ts's payInvoiceInFull, exercised by
    // operator-workflow-bot.spec.ts and the scenario builder's `paid` option).
  });

  test.skip('notes: add or edit a note on this customer', async () => {
    // NOT IMPLEMENTED: "Account notes" on the customer detail page only
    // renders customer.notes as read-only text (see DetailRow usage in
    // apps/web/app/(app)/customers/[customerId]/page.tsx) — no textarea, no
    // save action, no addNote/updateNote function anywhere in packages/db or
    // apps/web (grepped). The only way notes get set today is at customer
    // creation time (see context/customer.ts, which fills the notes field on
    // /customers/new).
  });

  test.skip('documents: upload or view a document on this customer', async () => {
    // NOT IMPLEMENTED: no /documents route, no uploadDocument/addDocument
    // action, no document UI anywhere in the app (grepped apps/web
    // end to end). This would need a real product decision (storage bucket,
    // upload UI, where it surfaces) before it could be tested.
  });
});
