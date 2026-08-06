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
  newJob: '/jobs/new',
  properties: '/properties',
  quotes: '/quotes',
  estimates: '/estimates',
  newEstimate: '/estimates/new',
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
  // Base44-exact rebuild (rebuild/base44-exact-ui): the customers list is now
  // apps/web/app/(app)/customers/_components/customers-list.tsx, ported from
  // Base44's CustomersList.tsx — the create entry point is a <button> labeled
  // "Add customer" (navigates client-side to /customers/new), not an <a>
  // labeled "New customer" as the pre-rebuild page had.
  newCustomerLink: (page: Page) => page.getByRole('button', { name: 'Add customer' }),
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

export const properties = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Properties' }),
};

export const jobsList = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Jobs' }),
};

export const estimatesList = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Estimates' }),
};

/**
 * `/today` — the app's dashboard/home page (see tests/e2e/README.md "Dashboard").
 * The `<h1>` is a dynamic greeting ("Good morning, Kevin") so it can't anchor a
 * stable-load wait; "Operational snapshot" is the first stable heading that
 * only renders once the page's server-side data fetch resolves (Forge V1.1
 * Today redesign — renamed from "Business snapshot"; the section itself was
 * also reworked from total-count vanity metrics to actionable-only counts,
 * see docs/ux/forge-v1.1-today-redesign.md).
 *
 * There is no longer a single persistent "jobs total" count on Today at
 * all (Kevin decision: operational/actionable counts only) — a prior
 * `jobsCount` selector here read the old total-jobs snapshot card, which no
 * longer exists. Tests that need to verify a job was created should check
 * the /jobs list directly (see operator-workflow-bot.spec.ts) rather than
 * Today, which was never meant to be a running-total surface.
 */
export const today = {
  loadedMarker: (page: Page) => page.getByRole('heading', { name: 'Operational snapshot' }),
};

/**
 * Inline "Properties" card on the customer detail page
 * (apps/web/app/(app)/customers/_components/properties-card.tsx). Distinct
 * field ids from `newCustomerForm` above and from `customerPropertyPicker`
 * below — no collisions.
 */
export const propertiesCard = {
  addPropertyToggle: (page: Page) => page.getByRole('button', { name: '+ Add property' }),
  addressLine1Input: (page: Page) => page.locator('#new-property-addressLine1'),
  cityInput: (page: Page) => page.locator('#new-property-city'),
  stateInput: (page: Page) => page.locator('#new-property-state'),
  zipInput: (page: Page) => page.locator('#new-property-zip'),
  submitButton: (page: Page) => page.getByRole('button', { name: 'Add property', exact: true }),
  propertyLink: (page: Page, addressLine1: string) =>
    page.getByRole('link', { name: new RegExp(escapeRegExp(addressLine1)) }),
};

/**
 * Shared customer + property resolver widget
 * (apps/web/components/forms/customer-property-section.tsx,
 * use-customer-property-resolver.ts) — used by New Estimate, New Quote, and
 * New Job. Defaults to "Search existing" mode, which is all this suite uses
 * (it always searches for a customer this suite already created via the real
 * /customers/new flow, rather than creating one inline here too).
 */
export const customerPropertyPicker = {
  searchInput: (page: Page) => page.getByPlaceholder('Search by name…'),
  searchButton: (page: Page) => page.getByRole('button', { name: 'Search', exact: true }),
  // Not exact: true — the result button's accessible name is the
  // concatenation of BOTH its child <p>s (display name AND email, per
  // customer-property-section.tsx), not just the display name alone.
  customerResult: (page: Page, displayName: string) =>
    page.getByRole('button', { name: new RegExp(escapeRegExp(displayName)) }),
  addPropertyToggle: (page: Page) => page.getByRole('button', { name: '+ Add a property' }),
  propertyResult: (page: Page, addressLine1: string) =>
    page.getByRole('button', { name: new RegExp(escapeRegExp(addressLine1)) }),
  // "Add a property" inline form fields — distinct ids (`prop-*`) from both
  // newCustomerForm's `new-property-*` and the picker's own customer-side
  // `manual-*` fields, so all three can coexist on one page without collision.
  newPropertyAddressLine1Input: (page: Page) => page.locator('#prop-addressLine1'),
  newPropertyCityInput: (page: Page) => page.locator('#prop-city'),
  newPropertyStateInput: (page: Page) => page.locator('#prop-state'),
  newPropertyZipInput: (page: Page) => page.locator('#prop-zip'),
  newPropertySubmitButton: (page: Page) => page.getByRole('button', { name: 'Add property', exact: true }),
};

/** `/estimates/new` (apps/web/app/(app)/estimates/_components/new-estimate-form.tsx). */
export const newEstimateForm = {
  descriptionInput: (page: Page) => page.locator('#description'),
  titleInput: (page: Page) => page.locator('#title'),
  submitButton: (page: Page) => page.getByRole('button', { name: /create estimate/i }),
};

/**
 * `/jobs/new` (apps/web/components/forms/customer-property-work-form.tsx,
 * shared with New Quote). Same `#title`/`#description` ids as the estimate
 * form, but never both on screen in the same test — each context module
 * navigates to one page at a time.
 */
export const newJobForm = {
  titleInput: (page: Page) => page.locator('#title'),
  descriptionInput: (page: Page) => page.locator('#description'),
  submitButton: (page: Page) => page.getByRole('button', { name: /create job/i }),
};

/** `/invoices` list page's "Create invoice" dialog (new-invoice-dialog.tsx). */
export const invoicesDialog = {
  createInvoiceButton: (page: Page) => page.getByRole('button', { name: 'Create invoice' }),
  searchInput: (page: Page) => page.getByPlaceholder(/search by title or job number/i),
  searchButton: (page: Page) => page.getByRole('button', { name: 'Search', exact: true }),
  jobRow: (page: Page, jobTitle: string) =>
    page.locator('li', { hasText: jobTitle }),
  selectButtonForJob: (page: Page, jobTitle: string) =>
    page.locator('li', { hasText: jobTitle }).getByRole('button', { name: 'Select' }),
};

/** Invoice detail page's line item editor (invoices/_components/line-item-editor.tsx). */
export const lineItemEditor = {
  addLineItemToggle: (page: Page) => page.getByRole('button', { name: '+ Add line item' }),
  nameInput: (page: Page) => page.locator('#ili-name'),
  quantityInput: (page: Page) => page.locator('#ili-quantity'),
  unitInput: (page: Page) => page.locator('#ili-unit'),
  unitPriceInput: (page: Page) => page.locator('#ili-unit-price'),
  submitButton: (page: Page) => page.getByRole('button', { name: 'Add line item', exact: true }),
};

/**
 * Quote detail page's line item editor
 * (apps/web/app/(app)/quotes/_components/line-item-editor.tsx). Distinct
 * `li-*` ids from invoices' `ili-*` line-item-editor above — never both on
 * screen at once, but kept visibly distinct regardless.
 */
export const quoteLineItemEditor = {
  addLineItemToggle: (page: Page) => page.getByRole('button', { name: '+ Add line item' }),
  nameInput: (page: Page) => page.locator('#li-name'),
  unitInput: (page: Page) => page.locator('#li-unit'),
  quantityInput: (page: Page) => page.locator('#li-quantity'),
  unitPriceInput: (page: Page) => page.locator('#li-unit-price'),
  submitButton: (page: Page) => page.getByRole('button', { name: 'Add line item', exact: true }),
};

/** Invoice detail page's record-payment-form.tsx. */
export const recordPaymentForm = {
  amountInput: (page: Page) => page.locator('#pay-amount'),
  methodSelect: (page: Page) => page.locator('#pay-method'),
  paidAtInput: (page: Page) => page.locator('#pay-date'),
  submitButton: (page: Page) => page.getByRole('button', { name: /record payment/i }),
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

/**
 * `/team` (apps/web/app/(app)/(forge)/team/page.tsx) and its invite
 * form/list. Base44-exact rebuild: the ported TeamList's own <h1>Team</h1>
 * replaces the pre-rebuild page's "Team access" heading.
 */
export const team = {
  heading: (page: Page) => page.getByRole('heading', { name: 'Team', level: 1 }),
  inviteFullNameInput: (page: Page) => page.locator('#invite-fullName'),
  inviteEmailInput: (page: Page) => page.locator('#invite-email'),
  inviteRoleSelect: (page: Page) => page.locator('#invite-role'),
  sendInviteButton: (page: Page) => page.getByRole('button', { name: /send invite/i }),
  pendingInvitesHeading: (page: Page) => page.getByRole('heading', { name: 'Pending invites' }),
  currentTeamHeading: (page: Page) => page.getByRole('heading', { name: 'Current team' }),
  memberCard: (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`Open team member ${escapeRegExp(name)}`) }),
  /**
   * Scopes to one pending-invite card via `data-testid` (added to
   * team/page.tsx specifically for this) — a plain text/role-based locator
   * can't disambiguate one invite's Revoke/copy-link buttons from another's,
   * since every pending-invite Card shares the same button labels and the
   * email text appears in several nested ancestor elements.
   */
  pendingInviteCard: (page: Page, email: string) =>
    page.getByTestId(`pending-invite-${email}`),
  copyInviteLinkButton: (page: Page, email: string) =>
    team.pendingInviteCard(page, email).getByRole('button', { name: 'Copy invite link' }),
  resendButton: (page: Page, email: string) =>
    team.pendingInviteCard(page, email).getByRole('button', { name: /resend/i }),
  revokeButton: (page: Page, email: string) =>
    team.pendingInviteCard(page, email).getByRole('button', { name: /revoke/i }),
};
