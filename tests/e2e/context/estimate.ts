/**
 * Estimate fixture creation (Phase 2 shared context). Drives the real
 * `/estimates/new` capture-first form, including the shared customer+property
 * resolver widget (apps/web/components/forms/customer-property-section.tsx)
 * that New Estimate, New Quote, and New Job all reuse.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { customerPropertyPicker, newEstimateForm, routes } from '../utils/selectors';
import { buildEstimateTestFixture, buildPropertyTestFixture } from '../utils/test-data';
import type { CustomerFixture } from './customer';
import type { PropertyFixture } from './property';

export interface EstimateFixture {
  id: string;
  /** `/estimates/{id}` */
  url: string;
  /** Also the estimate's title — rendered as the detail page's heading. */
  title: string;
  customerId: string;
  /**
   * The property's addressLine1 — this flow never surfaces the property's
   * UUID back to the DOM (unlike context/property.ts's own link-based flow),
   * so this is the only identifier available here.
   */
  propertyAddressLine1: string;
}

/**
 * Creates a real estimate for `customer` via `/estimates/new`. If `property`
 * is omitted, adds one inline through the picker's own "+ Add a property"
 * flow (same underlying `createPropertyForCustomerAction` as context/property.ts,
 * just reached through a different form).
 */
export async function createTestEstimate(
  page: Page,
  customer: CustomerFixture,
  property?: PropertyFixture
): Promise<EstimateFixture> {
  const fixture = buildEstimateTestFixture();

  await page.goto(routes.newEstimate);
  await newEstimateForm.descriptionInput(page).fill(fixture.description);
  await newEstimateForm.titleInput(page).fill(fixture.title);

  await customerPropertyPicker.searchInput(page).fill(customer.marker);
  await customerPropertyPicker.searchButton(page).click();
  await customerPropertyPicker.customerResult(page, customer.marker).click();

  const resolvedPropertyAddress = await resolveProperty(page, property);

  await expect(newEstimateForm.submitButton(page)).toBeEnabled({ timeout: 10_000 });
  await newEstimateForm.submitButton(page).click();

  await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();

  return {
    id,
    url: `${routes.estimates}/${id}`,
    title: fixture.title,
    customerId: customer.id,
    propertyAddressLine1: resolvedPropertyAddress,
  };
}

/**
 * Resolves which property the picker ends up with, and returns its address
 * (the only identifier this flow has to hand — the picker never exposes a
 * property id directly to the caller, only the resolver's internal state).
 *
 * Test fixtures always create exactly one property per customer, so the
 * resolver auto-selects it (see use-customer-property-resolver.ts's
 * `loadPropertiesFor`) — no manual click needed when `property` is passed. If
 * no property was passed, adds one inline via the picker's own form.
 */
async function resolveProperty(page: Page, property?: PropertyFixture): Promise<string> {
  if (property) {
    return property.addressLine1;
  }

  const fixture = buildPropertyTestFixture();
  await customerPropertyPicker.addPropertyToggle(page).click();
  await customerPropertyPicker.newPropertyAddressLine1Input(page).fill(fixture.addressLine1);
  await customerPropertyPicker.newPropertyCityInput(page).fill(fixture.city);
  await customerPropertyPicker.newPropertyStateInput(page).fill(fixture.state);
  await customerPropertyPicker.newPropertyZipInput(page).fill(fixture.zip);
  await customerPropertyPicker.newPropertySubmitButton(page).click();
  return fixture.addressLine1;
}
