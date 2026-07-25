/**
 * Test data helpers for the Premier CRM bot suite.
 *
 * Ground rules (see also tests/e2e/README.md "Data safety"):
 *  - Every record this suite creates is prefixed with E2E_TEST_PREFIX so it is
 *    unambiguous which rows came from bots vs. real Premier business data.
 *  - Bots must never assume a specific customer/invoice count, since dev data
 *    changes over time — prefer "create what you need, then assert on it."
 *  - This suite is designed for local/dev/test Supabase projects only. It does
 *    not know how to talk to a specific environment beyond BASE_URL; running
 *    it against production is a user error this file doesn't try to prevent
 *    beyond the loud warnings in the README and env example.
 */

export const E2E_TEST_PREFIX = 'E2E_TEST_';

/** Timestamp-suffixed unique id so parallel/repeated runs don't collide. */
export function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function testCustomerName(): string {
  return `${E2E_TEST_PREFIX}Customer_${uniqueSuffix()}`;
}

export function testCustomerEmail(): string {
  return `e2e-test-${uniqueSuffix()}@example.invalid`;
}

export function testPropertyAddress(): string {
  return `${E2E_TEST_PREFIX}${uniqueSuffix()} Test Fixture Way, Florence, KY 41042`;
}

export function testInvoiceMemo(): string {
  return `${E2E_TEST_PREFIX}Invoice memo ${uniqueSuffix()}`;
}

/** Returns true if a given display string looks like data this suite created. */
export function isTestData(value: string | null | undefined): boolean {
  return !!value && value.includes(E2E_TEST_PREFIX);
}

/** A fixed, greppable marker for the notes field — not unique, since it's a label, not an identifier. */
export const CUSTOMER_CRUD_NOTES_MARKER = 'E2E_TEST_CREATED_BY_PLAYWRIGHT';

export interface CustomerCrudTestFixture {
  /** Unique identifying marker — used as the customer's company name (the
   *  most reliable field: display_name = COALESCE(company_name, first+last),
   *  so setting company_name guarantees the full marker shows everywhere the
   *  app renders display_name — the customers list, search results, and the
   *  detail page heading). */
  marker: string;
  email: string;
  phone: string;
  notes: string;
}

/**
 * Builds a full set of test values for one customer-crud-bot run, all
 * derived from a single unique suffix so marker/email/phone stay correlated
 * to the same test run.
 */
export function buildCustomerCrudTestFixture(): CustomerCrudTestFixture {
  const timestamp = Date.now();
  const shortId = Math.random().toString(36).slice(2, 8);
  const suffix = `${timestamp}_${shortId}`;
  const last4Digits = String(timestamp).slice(-4);

  return {
    marker: `${E2E_TEST_PREFIX}CUSTOMER_CRUD_${suffix}`,
    email: `e2e.customer.crud.${suffix}@example.com`,
    phone: `555-010-${last4Digits}`,
    notes: CUSTOMER_CRUD_NOTES_MARKER,
  };
}

// ---------------------------------------------------------------------------
// Shared context fixture builders (tests/e2e/context/*) — Phase 2
// ---------------------------------------------------------------------------

/** A unique, greppable marker for any entity kind, e.g. buildMarker('PROPERTY'). */
export function buildMarker(kind: string): string {
  return `${E2E_TEST_PREFIX}${kind}_${uniqueSuffix()}`;
}

export interface PropertyTestFixture {
  /** Contains the marker — the only field the properties table exposes for
   *  identifying a row directly (see CleanupPropertyMatch in utils/cleanup.ts). */
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}

export function buildPropertyTestFixture(): PropertyTestFixture {
  return {
    addressLine1: `${buildMarker('PROPERTY')} Test Fixture Way`,
    city: 'Florence',
    state: 'KY',
    zip: '41042',
  };
}

export interface WorkItemTestFixture {
  /** Used as the record's title — both estimates and jobs render `title` as
   *  their detail-page heading, so this marker is always visible there. */
  title: string;
  description: string;
}

export function buildEstimateTestFixture(): WorkItemTestFixture {
  const marker = buildMarker('ESTIMATE');
  return {
    title: marker,
    description: `${marker} — created by the Playwright E2E suite. Safe to delete.`,
  };
}

export function buildJobTestFixture(): WorkItemTestFixture {
  const marker = buildMarker('JOB');
  return {
    title: marker,
    description: `${marker} — created by the Playwright E2E suite. Safe to delete.`,
  };
}
