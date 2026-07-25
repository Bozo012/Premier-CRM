/**
 * Customer fixture creation (Phase 2 shared context). Same real
 * `/customers/new` flow customer-crud-bot.spec.ts exercises directly —
 * extracted here so other bots (scenario builder, command center, operator
 * workflow) can request a test customer without duplicating that flow.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { customerDetail, newCustomerForm, routes } from '../utils/selectors';
import { buildCustomerCrudTestFixture, CUSTOMER_CRUD_NOTES_MARKER } from '../utils/test-data';

export interface CustomerFixture {
  id: string;
  /** `/customers/{id}` */
  url: string;
  /** The unique E2E_TEST_ marker — also the customer's company_name/display_name. */
  marker: string;
  email: string;
  phone: string;
}

/** Creates a real customer via `/customers/new` and returns its identity. */
export async function createTestCustomer(page: Page): Promise<CustomerFixture> {
  const fixture = buildCustomerCrudTestFixture();

  await page.goto(routes.newCustomer);
  await newCustomerForm.companyNameInput(page).fill(fixture.marker);
  await newCustomerForm.emailInput(page).fill(fixture.email);
  await newCustomerForm.phonePrimaryInput(page).fill(fixture.phone);
  await newCustomerForm.notesInput(page).fill(CUSTOMER_CRUD_NOTES_MARKER);
  await newCustomerForm.submitButton(page).click();

  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const id = new URL(page.url()).pathname.split('/').pop()!;

  await expect(customerDetail.heading(page, fixture.marker)).toBeVisible();

  return {
    id,
    url: `${routes.customers}/${id}`,
    marker: fixture.marker,
    email: fixture.email,
    phone: fixture.phone,
  };
}
