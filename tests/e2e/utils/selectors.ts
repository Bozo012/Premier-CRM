/**
 * Centralized selectors for the Premier CRM bot suite.
 *
 * Why this file exists: when the UI changes, we want one place to update a
 * selector rather than hunting through eight spec files. Prefer role/label/text
 * based locators (resilient to styling changes) over CSS classes.
 *
 * These are sourced from the actual current markup in apps/web (login form,
 * customers page, invoices page) as of this pass. If a bot fails because a
 * selector here no longer matches, that's a real signal — fix the selector,
 * don't loosen the assertion.
 */

import type { Page } from '@playwright/test';

export const routes = {
  login: '/login',
  today: '/today',
  customers: '/customers',
  newCustomer: '/customers/new',
  invoices: '/invoices',
  jobs: '/jobs',
  properties: '/properties',
  quotes: '/quotes',
  estimates: '/estimates',
  requests: '/requests',
  services: '/services',
  settings: '/settings/website',
  team: '/team',
} as const;

export const login = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Sign in to Premier' }),
  emailInput: (page: Page) => page.locator('#email'),
  passwordInput: (page: Page) => page.locator('#password'),
  submitButton: (page: Page) => page.getByRole('button', { name: /sign in/i }),
  errorText: (page: Page) => page.locator('main p.text-red-600'),
};

export const customers = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Customers' }),
  newCustomerLink: (page: Page) => page.getByRole('link', { name: 'New customer' }),
  searchInput: (page: Page) => page.getByPlaceholder(/search/i),
};

/**
 * `/customers/new` form (apps/web/app/(app)/customers/_components/new-customer-form.tsx).
 * No fields are HTML-`required`; the server action requires a first/last name
 * OR a company name (see CreateCustomerInputSchema in packages/shared) — this
 * suite always fills companyName, which satisfies that and doubles as the
 * most reliable identifying field (see CustomerCrudTestFixture in test-data.ts).
 */
export const newCustomerForm = {
  companyNameInput: (page: Page) => page.locator('#new-customer-companyName'),
  emailInput: (page: Page) => page.locator('#new-customer-email'),
  phonePrimaryInput: (page: Page) => page.locator('#new-customer-phonePrimary'),
  notesInput: (page: Page) => page.locator('#new-customer-notes'),
  submitButton: (page: Page) => page.getByRole('button', { name: /create customer/i }),
};

/**
 * `/customers/[customerId]` detail page — read-only today (no edit or
 * delete/archive UI exists; see tests/e2e/customer-crud-bot.spec.ts's
 * "edit" test, which documents that as TODO rather than inventing a flow).
 */
export const customerDetail = {
  heading: (page: Page, name: string) => page.getByRole('heading', { name }),
  emailRow: (page: Page, email: string) => page.getByText(email, { exact: false }),
};

/** Matches `/customers/<uuid>` for a specific customer id. */
export function isCustomerDetailUrl(page: Page, customerId: string): boolean {
  return new URL(page.url()).pathname === `/customers/${customerId}`;
}

export const invoices = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Invoices' }),
};

/**
 * The (app) route group wraps everything behind AuthGuard, a client component
 * that checks Supabase session and redirects to `/login?redirectTo=<path>` if
 * there is none. Any protected-route smoke test should assert this pattern
 * rather than a hardcoded full URL, since redirectTo encoding could shift.
 */
export function isRedirectedToLogin(page: Page) {
  const url = new URL(page.url());
  return url.pathname === '/login';
}
