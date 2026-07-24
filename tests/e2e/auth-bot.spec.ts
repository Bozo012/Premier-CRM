/**
 * auth-bot: verifies the app is reachable and the login surface works.
 *
 * This is the foundation bot — if this fails, every other bot will fail too,
 * since they all depend on being able to reach and log into the app. Keep it
 * fast and keep it first in any full-suite run.
 */

import { test, expect } from '@playwright/test';
import { login, routes } from './utils/selectors';
import { hasAdminCredentials, loginAsAdmin } from './utils/auth';

test.describe('auth bot', () => {
  test('app loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok() ?? true).toBeTruthy();
  });

  test('login page is reachable and renders the sign-in form', async ({ page }) => {
    await page.goto(routes.login);

    await expect(login.heading(page)).toBeVisible();
    await expect(login.emailInput(page)).toBeVisible();
    await expect(login.passwordInput(page)).toBeVisible();
    await expect(login.submitButton(page)).toBeVisible();
  });

  test('submitting bad credentials shows an error, not a silent failure', async ({ page }) => {
    await page.goto(routes.login);

    await login.emailInput(page).fill('nonexistent-e2e-user@example.invalid');
    await login.passwordInput(page).fill('definitely-wrong-password');
    await login.submitButton(page).click();

    // Supabase returns an auth error message; the login page renders it in
    // a red paragraph. We don't assert exact copy since Supabase's error
    // text can change — just that *some* error surfaces and we stay on /login.
    await expect(page).toHaveURL(/\/login/);
    await expect(login.errorText(page)).toBeVisible({ timeout: 10_000 });
  });

  test('admin can log in with valid credentials', async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD not set in .env.test');

    await loginAsAdmin(page);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
