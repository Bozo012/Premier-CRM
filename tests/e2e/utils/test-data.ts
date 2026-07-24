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
