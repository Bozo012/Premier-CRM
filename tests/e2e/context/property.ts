/**
 * Property fixture creation (Phase 2 shared context). Uses the inline
 * "Properties" card on the customer detail page — the only place a property
 * can be created in the app today (see tests/e2e/README.md "Properties").
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { propertiesCard } from '../utils/selectors';
import { buildPropertyTestFixture } from '../utils/test-data';
import type { CustomerFixture } from './customer';

export interface PropertyFixture {
  id: string;
  /** `/properties/{id}` */
  url: string;
  addressLine1: string;
  customerId: string;
}

/**
 * Creates a real property for `customer` via the customer detail page's
 * inline form. Must already be on (or navigate to) the customer's detail
 * page — this navigates there itself so callers don't need to.
 */
export async function createTestProperty(
  page: Page,
  customer: CustomerFixture
): Promise<PropertyFixture> {
  const fixture = buildPropertyTestFixture();

  await page.goto(customer.url);
  await propertiesCard.addPropertyToggle(page).click();
  await propertiesCard.addressLine1Input(page).fill(fixture.addressLine1);
  await propertiesCard.cityInput(page).fill(fixture.city);
  await propertiesCard.stateInput(page).fill(fixture.state);
  await propertiesCard.zipInput(page).fill(fixture.zip);
  await propertiesCard.submitButton(page).click();

  // The dialog does `router.refresh()` on success rather than navigating —
  // the new property shows up as a row in the same section once the toast
  // fires. That row is a client-routed button (RecordDetailView's related-
  // record rows have no real href), so extract the id by clicking through
  // to /properties/{id} and reading the resulting URL.
  const row = propertiesCard.propertyLink(page, fixture.addressLine1);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const url = page.url();
  const id = url.split('/').pop()!;

  return {
    id,
    url: new URL(url).pathname,
    addressLine1: fixture.addressLine1,
    customerId: customer.id,
  };
}
