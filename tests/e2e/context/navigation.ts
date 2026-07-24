/**
 * Shared navigation helpers (Phase 2). Each `goto*` waits for a stable,
 * distinctive element on the target page before returning, rather than a
 * fixed timeout — so callers never race the page's own data fetch.
 */

import type { Page } from '@playwright/test';

import {
  customerDetail,
  customers,
  estimatesList,
  invoices,
  jobsList,
  properties,
  routes,
  today,
} from '../utils/selectors';
import type { CustomerFixture } from './customer';

export async function gotoDashboard(page: Page): Promise<void> {
  await page.goto(routes.today);
  await today.loadedMarker(page).waitFor();
}

export async function gotoCustomers(page: Page): Promise<void> {
  await page.goto(routes.customers);
  await customers.heading(page).waitFor();
}

export async function gotoCustomer(page: Page, customer: CustomerFixture): Promise<void> {
  await page.goto(customer.url);
  await customerDetail.heading(page, customer.marker).waitFor();
}

export async function gotoProperties(page: Page): Promise<void> {
  await page.goto(routes.properties);
  await properties.heading(page).waitFor();
}

export async function gotoJobs(page: Page): Promise<void> {
  await page.goto(routes.jobs);
  await jobsList.heading(page).waitFor();
}

export async function gotoEstimates(page: Page): Promise<void> {
  await page.goto(routes.estimates);
  await estimatesList.heading(page).waitFor();
}

export async function gotoInvoices(page: Page): Promise<void> {
  await page.goto(routes.invoices);
  await invoices.heading(page).waitFor();
}
