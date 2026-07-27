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

/** Dedicated E2E employee account — see employee-invite-bot.spec.ts. */
export function getEmployeeAccount(): TestAccount {
  return {
    email: requireEnv('TEST_EMPLOYEE_EMAIL'),
    password: requireEnv('TEST_EMPLOYEE_PASSWORD'),
  };
}

export function getEmployeeName(): string {
  return requireEnv('TEST_EMPLOYEE_NAME');
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

export function hasEmployeeCredentials(): boolean {
  return (
    !!process.env.TEST_EMPLOYEE_EMAIL &&
    !!process.env.TEST_EMPLOYEE_PASSWORD &&
    !!process.env.TEST_EMPLOYEE_NAME
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
