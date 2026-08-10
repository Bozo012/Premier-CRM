/**
 * Auth helpers for the Premier CRM bot suite.
 *
 * Premier uses Supabase email+password auth (see apps/web/app/login/page.tsx).
 * There is no test-only auth bypass yet — these helpers drive the real login
 * form, which also means every bot that logs in is implicitly re-verifying
 * that login itself still works.
 *
 * Credentials come from environment variables only (see .env.test.example).
 * Never hardcode real credentials in spec files.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { login, routes } from './selectors';

export interface TestAccount {
  email: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.test.example to .env.test and fill it in ` +
        `with local/dev test credentials before running auth-dependent bots.`
    );
  }
  return value;
}

export function getAdminAccount(): TestAccount {
  return {
    email: requireEnv('TEST_ADMIN_EMAIL'),
    password: requireEnv('TEST_ADMIN_PASSWORD'),
  };
}

export function getCustomerAccount(): TestAccount {
  return {
    email: requireEnv('TEST_CUSTOMER_EMAIL'),
    password: requireEnv('TEST_CUSTOMER_PASSWORD'),
  };
}

export function getCustomerTwoAccount(): TestAccount {
  return {
    email: requireEnv('TEST_CUSTOMER_2_EMAIL'),
    password: requireEnv('TEST_CUSTOMER_2_PASSWORD'),
  };
}

/**
 * Persistent E2E staff account — stays active across runs so permissions/
 * workflow bots can reuse it instead of re-provisioning per test (see
 * .env.test.example's comment).
 */
export function getStaffAccount(): TestAccount {
  return {
    email: requireEnv('TEST_STAFF_EMAIL'),
    password: requireEnv('TEST_STAFF_PASSWORD'),
  };
}

export function getStaffName(): string {
  return requireEnv('TEST_STAFF_NAME');
}

/**
 * Returns true if all admin credentials are present in the environment.
 * Bots that need real auth should skip (not fail) when this is false, so the
 * suite stays runnable before a developer has wired up .env.test.
 */
export function hasAdminCredentials(): boolean {
  return !!process.env.TEST_ADMIN_EMAIL && !!process.env.TEST_ADMIN_PASSWORD;
}

export function hasCustomerCredentials(): boolean {
  return !!process.env.TEST_CUSTOMER_EMAIL && !!process.env.TEST_CUSTOMER_PASSWORD;
}

export function hasCustomerTwoCredentials(): boolean {
  return !!process.env.TEST_CUSTOMER_2_EMAIL && !!process.env.TEST_CUSTOMER_2_PASSWORD;
}

export function hasStaffCredentials(): boolean {
  return (
    !!process.env.TEST_STAFF_EMAIL &&
    !!process.env.TEST_STAFF_PASSWORD &&
    !!process.env.TEST_STAFF_NAME
  );
}

/**
 * Logs in through the real /login form and waits for redirect away from it.
 * Use for the admin/owner account (Kevin's role) unless testing customer
 * portal auth specifically.
 */
export async function loginAs(page: Page, account: TestAccount): Promise<void> {
  await page.goto(routes.login);
  await login.emailInput(page).fill(account.email);
  await login.passwordInput(page).fill(account.password);
  await login.submitButton(page).click();

  // AuthGuard/login redirect is client-side and async; wait for navigation
  // away from /login rather than a fixed timeout.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, getAdminAccount());
}

/**
 * A real Supabase client authenticated as `account` via the public anon key
 * — exactly the same client shape and privileges the browser app itself
 * uses (see packages/db/client.ts's createBrowserClient). Deliberately NOT
 * the service-role key: the entire point of this helper is to prove
 * authorization is enforced server-side (RLS policies / table grants) for a
 * real signed-in user's own session, not just that a button is hidden in
 * the UI. See staff-permissions-bot.spec.ts for how this is used to attempt
 * (and expect to be refused) owner-only writes as the employee account.
 */
/** True once both env vars createUserApiClient() needs are present. */
export function hasApiTestCredentials(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export async function createUserApiClient(account: TestAccount): Promise<SupabaseClient<Database>> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) {
    throw new Error(`Direct API sign-in failed for ${account.email}: ${error.message}`);
  }

  return client;
}

/**
 * Real browser session for a customer_accounts-linked portal user.
 *
 * There is no in-portal sign-in FORM to drive — /portal/login always
 * redirects (unauthenticated visitors to the real ppmnky.com marketing
 * site, per the intentional ownership split; authenticated ones straight to
 * /portal/dashboard). So, exactly like portal-auth-bot.spec.ts's real
 * confirmation/recovery-link tests, this drives the actual Supabase
 * callback a browser would land on — here via
 * `supabase.auth.admin.generateLink({ type: 'magiclink' })`, which returns
 * the real `action_link` Supabase would have emailed, for an
 * already-existing user (created by the caller's own fixture via
 * `admin.createUser`). Navigating to it exercises the real callback route
 * (`lib/auth-callback.ts`) exactly as a live user would, not a synthetic
 * cookie injection.
 */
export async function loginAsPortalCustomer(
  page: Page,
  serviceClient: SupabaseClient<Database>,
  email: string
): Promise<void> {
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.BASE_URL ?? 'http://localhost:3000'}/portal/dashboard` },
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(`Could not generate a portal magic link for ${email}: ${error?.message ?? 'no action_link'}`);
  }

  await page.goto(data.properties.action_link);
  await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 10_000 });
}
