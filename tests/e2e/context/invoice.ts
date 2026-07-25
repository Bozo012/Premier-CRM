/**
 * Invoice fixture creation (Phase 2 shared context). Invoices can only be
 * created from an existing job today — there is no standalone `/invoices/new`
 * form (see tests/e2e/README.md "Invoices") — so this always takes a
 * `JobFixture`.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { invoicesDialog, lineItemEditor, recordPaymentForm, routes } from '../utils/selectors';
import { buildMarker } from '../utils/test-data';
import type { JobFixture } from './job';

export interface InvoiceFixture {
  id: string;
  /** `/invoices/{id}` */
  url: string;
  jobId: string;
}

/** Creates a real invoice from `job` via the `/invoices` list's "Create invoice" dialog. */
export async function createTestInvoice(page: Page, job: JobFixture): Promise<InvoiceFixture> {
  await page.goto(routes.invoices);
  await invoicesDialog.createInvoiceButton(page).click();

  await invoicesDialog.searchInput(page).fill(job.title);
  await invoicesDialog.searchButton(page).click();
  await expect(invoicesDialog.jobRow(page, job.title)).toBeVisible({ timeout: 10_000 });
  await invoicesDialog.selectButtonForJob(page, job.title).click();

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const id = new URL(page.url()).pathname.split('/').pop()!;

  return { id, url: `${routes.invoices}/${id}`, jobId: job.id };
}

/**
 * Adds one line item to a draft invoice. A freshly created invoice has
 * `total: 0` (no line items), and record-payment-form.tsx refuses to render
 * its fields when `amountDue <= 0` — so this is a prerequisite for
 * `payInvoiceInFull`, not just decoration.
 */
export async function addInvoiceLineItem(page: Page, invoice: InvoiceFixture): Promise<void> {
  await page.goto(invoice.url);
  await lineItemEditor.addLineItemToggle(page).click();
  await lineItemEditor.nameInput(page).fill(buildMarker('LINE_ITEM'));
  await lineItemEditor.quantityInput(page).fill('1');
  await lineItemEditor.unitInput(page).fill('each');
  await lineItemEditor.unitPriceInput(page).fill('100');
  await lineItemEditor.submitButton(page).click();
  await expect(lineItemEditor.addLineItemToggle(page)).toBeVisible({ timeout: 10_000 });
}

/**
 * Records a full payment against the invoice's current amount due. Callers
 * must ensure the invoice has a nonzero total first (see
 * `addInvoiceLineItem`) — otherwise the payment form has nothing to submit.
 */
export async function payInvoiceInFull(page: Page, invoice: InvoiceFixture): Promise<void> {
  await page.goto(invoice.url);
  // #pay-amount already defaults to the full amount due — no need to fill it.
  await recordPaymentForm.methodSelect(page).selectOption('cash');
  await recordPaymentForm.submitButton(page).click();
  await expect(page.getByText(/no remaining balance/i)).toBeVisible({ timeout: 10_000 });
}
