/**
 * Job fixture creation (Phase 2 shared context). Drives the real
 * `/jobs/new` standalone job form (apps/web/components/forms/
 * customer-property-work-form.tsx) — creates a job directly with status
 * `lead`, no quote/estimate required. See tests/e2e/README.md "Jobs" for the
 * other path (accepted-quote → job), which requires the customer portal's
 * quote-acceptance flow and isn't automated by this suite yet.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { customerPropertyPicker, newJobForm, routes } from '../utils/selectors';
import { buildJobTestFixture, buildPropertyTestFixture } from '../utils/test-data';
import type { CustomerFixture } from './customer';
import type { PropertyFixture } from './property';

export interface JobFixture {
  id: string;
  /** `/jobs/{id}` */
  url: string;
  /** Also the job's title — rendered as the detail page's heading. */
  title: string;
  customerId: string;
}

/**
 * Creates a real standalone job for `customer` via `/jobs/new`. If
 * `property` is omitted, adds one inline through the picker's own
 * "+ Add a property" flow, same as context/estimate.ts.
 */
export async function createTestJob(
  page: Page,
  customer: CustomerFixture,
  property?: PropertyFixture
): Promise<JobFixture> {
  const fixture = buildJobTestFixture();

  await page.goto(routes.newJob);

  await customerPropertyPicker.searchInput(page).fill(customer.marker);
  await customerPropertyPicker.searchButton(page).click();
  await customerPropertyPicker.customerResult(page, customer.marker).click();

  await resolveProperty(page, property);

  await newJobForm.titleInput(page).fill(fixture.title);
  await newJobForm.descriptionInput(page).fill(fixture.description);

  await expect(newJobForm.submitButton(page)).toBeEnabled({ timeout: 10_000 });
  await newJobForm.submitButton(page).click();

  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const id = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();

  return {
    id,
    url: `${routes.jobs}/${id}`,
    title: fixture.title,
    customerId: customer.id,
  };
}

/** Same auto-select reasoning as context/estimate.ts's resolveProperty. */
async function resolveProperty(page: Page, property?: PropertyFixture): Promise<void> {
  if (property) return;

  const fixture = buildPropertyTestFixture();
  await customerPropertyPicker.addPropertyToggle(page).click();
  await customerPropertyPicker.newPropertyAddressLine1Input(page).fill(fixture.addressLine1);
  await customerPropertyPicker.newPropertyCityInput(page).fill(fixture.city);
  await customerPropertyPicker.newPropertyStateInput(page).fill(fixture.state);
  await customerPropertyPicker.newPropertyZipInput(page).fill(fixture.zip);
  await customerPropertyPicker.newPropertySubmitButton(page).click();
}
