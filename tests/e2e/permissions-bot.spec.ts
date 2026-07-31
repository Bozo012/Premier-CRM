/**
 * permissions-bot: verifies role/account boundaries — most importantly, that
 * customer accounts can never see another customer's data (RLS + portal
 * scoping, per ARCHITECTURE.md's "All buckets have RLS" / multi-tenant
 * posture and the customer portal's magic-link/token scoping).
 *
 * Scope for this pass: route-level auth gating (real, active tests) plus
 * TODO/skipped scaffolds for true cross-account data isolation, which needs
 * TWO real customer portal accounts with distinct data to be meaningful.
 */

import { test, expect } from '@playwright/test';
import { isRedirectedToLogin, routes } from './utils/selectors';
import { hasCustomerCredentials, hasCustomerTwoCredentials } from './utils/auth';

test.describe('permissions bot', () => {
  test('unauthenticated request to an owner/staff route is denied and redirected', async ({
    page,
  }) => {
    await page.goto(routes.settings);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test('unauthenticated request to the team route is denied and redirected', async ({ page }) => {
    await page.goto(routes.team);
    await expect(page).toHaveURL(/\/login/);
    expect(isRedirectedToLogin(page)).toBe(true);
  });

  test.skip('customer account cannot view another customer’s invoices', async () => {
    // TODO: requires TEST_CUSTOMER_EMAIL/PASSWORD and TEST_CUSTOMER_2_EMAIL/PASSWORD
    // plus known distinct data per account. Log in as customer 1, attempt to
    // navigate to a direct URL for customer 2's invoice/quote, assert denial
    // (403/redirect/empty state) — never a leaked record.
    void hasCustomerCredentials;
    void hasCustomerTwoCredentials;
  });

  test.skip('customer account cannot view another customer’s properties', async () => {
    // TODO: same pattern as above, for /properties or portal property views.
  });

  test.skip('customer portal magic-link token is single-use and scoped', async () => {
    // NOT APPLICABLE to the app as built (confirmed 2026-07-31 audit):
    // ARCHITECTURE.md describes a magic_link_tokens design, but no such
    // table or mechanism exists anywhere in the codebase (grepped
    // packages/db/types.ts and apps/web — zero hits beyond this comment).
    // Actual customer auth is Supabase email/password (apps/web/app/portal/
    // actions.ts); the closest real "token" concept is quotes.share_token /
    // invoices.share_token, which are permanent (no expiry/single-use logic)
    // and gate the public /q/[token] and /i/[token] pages, not portal login.
    // Left skipped rather than testing a feature that doesn't exist — flagged
    // to the user as a doc/reality mismatch, worth a product decision on
    // whether to build real magic links or update ARCHITECTURE.md instead.
  });

  // Now covered by staff-permissions-bot.spec.ts's "owner-only restrictions"
  // block (tests 1 and 3): the persistent employee fixture (TEST_STAFF_*)
  // asserts it cannot view /team or /settings/website, both at the UI level
  // and (for /team's underlying action) via a direct API write. Not
  // duplicated here — TEST_ADMIN_* is now provisioned as the org's owner
  // (see .env.test), so this file's own credentials could run an equivalent
  // check, but the existing bot already owns this exact boundary.
});
