/**
 * Shared login (Phase 2 shared context). Thin, timed wrappers around the
 * real login helpers in tests/e2e/utils/auth.ts — bots should use these
 * instead of driving the login form themselves, so login is only
 * implemented once.
 */

import { getCustomerAccount, loginAs, loginAsAdmin as loginAsAdminDirect } from '../utils/auth';
import type { TestSession } from './session';

export { hasAdminCredentials, hasCustomerCredentials } from '../utils/auth';

/** Logs the session's page in as the admin/owner test account. */
export async function loginAsAdmin(session: TestSession): Promise<void> {
  await session.metrics.measure('Login', () => loginAsAdminDirect(session.page));
  session.isAdminLoggedIn = true;
}

/** Logs the session's page in as the customer-portal test account. */
export async function loginAsCustomer(session: TestSession): Promise<void> {
  await session.metrics.measure('Login', () => loginAs(session.page, getCustomerAccount()));
  session.isCustomerLoggedIn = true;
}
