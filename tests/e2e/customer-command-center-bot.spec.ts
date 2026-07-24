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
 */

import { test, expect } from '@playwright/test';
import { hasAdminCredentials } from './utils/auth';
import { loginAsAdmin } from './context/auth';
import { createTestSession } from './context/session';
import { gotoCustomer } from './context/navigation';
import type { CustomerFixture } from './context/customer';
import type { PropertyFixture } from './context/property';

test.describe('customer command center bot', () => {
  test.describe.serial('command center — active surfaces', () => {
    let customer: CustomerFixture | undefined;
    let property: PropertyFixture | undefined;

    test('opens a customer and sees stats, contact, and notes', async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      const session = createTestSession(page);

      await loginAsAdmin(session);
      customer = await session.customer();
      await gotoCustomer(page, customer);

      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Total revenue' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Last contact' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Last completed job' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Outstanding invoices' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Account notes' })).toBeVisible();
      await expect(page.getByText(customer.email)).toBeVisible();

      await session.finish();
    });

    test('properties tile: navigate to a property and back', async ({ page }) => {
      test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');
      test.skip(!customer, 'Depends on the previous test having run and succeeded.');
      const session = createTestSession(page);

      await loginAsAdmin(session);
      property = await session.property(customer);
      await gotoCustomer(page, customer!);

      const propertyLink = page.getByRole('link', { name: new RegExp(property.addressLine1) });
      await expect(propertyLink).toBeVisible();
      await propertyLink.click();

      await expect(page).toHaveURL(new RegExp(`/properties/${property.id}$`));
      await expect(page.getByText(property.addressLine1)).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/customers/${customer!.id}$`));
      await expect(page.getByRole('heading', { name: customer!.marker })).toBeVisible();

      await session.finish();
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
