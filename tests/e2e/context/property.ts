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

  // The card does `router.refresh()` on success rather than navigating — the
  // new property shows up as a link in the same list once the toast fires.
  const link = propertiesCard.propertyLink(page, fixture.addressLine1);
  await expect(link).toBeVisible({ timeout: 10_000 });
  const href = await link.getAttribute('href');
  if (!href) {
    throw new Error(`Property link for "${fixture.addressLine1}" has no href.`);
  }
  const id = href.split('/').pop()!;

  return {
    id,
    url: href,
    addressLine1: fixture.addressLine1,
    customerId: customer.id,
  };
}
