/**
 * today-appearance-bot: covers the Forge-owned Light/Dark/System
 * appearance setting introduced by the Base44 Today visual integration
 * (docs/ux/base44-today-sync-and-portability-audit.md). Verifies the
 * mechanism itself (apps/web/components/theme/theme-provider.tsx +
 * theme-control.tsx), not any single route's markup — exercised via
 * /today since that's where the control is currently mounted.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('today appearance bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  const owner = { email: '', password: '', userId: '' };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_TODAY_APPEARANCE_ORG', slug: `e2e-today-appearance-${Date.now()}` });

    const email = `e2e-today-appearance-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const password = `TodayAppearance_${Math.random().toString(36).slice(2)}!1`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) throw new Error(`createUser(owner) failed: ${error?.message}`);
    await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role: 'owner', status: 'active' });
    Object.assign(owner, { email, password, userId: created.user.id });
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('org_members').delete().eq('org_id', orgId);
    await admin.auth.admin.deleteUser(owner.userId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.com').fill(owner.email);
    await page.getByPlaceholder('Enter your password').fill(owner.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/today');
  }

  test('defaults to System on first visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await login(page);
    await expect(page.getByRole('button', { name: 'System appearance' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('Light forces light theme regardless of OS preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await login(page);
    await page.getByRole('button', { name: 'Light appearance' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Light appearance' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Dark forces dark theme regardless of OS preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await login(page);
    await page.getByRole('button', { name: 'Dark appearance' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Dark appearance' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('System mode responds to a live OS-preference change', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await login(page);
    await page.getByRole('button', { name: 'System appearance' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('preference survives a reload', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Dark appearance' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Dark appearance' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('appearance control is keyboard-reachable with accessible names', async ({ page }) => {
    await login(page);
    const lightButton = page.getByRole('button', { name: 'Light appearance' });
    await lightButton.focus();
    await expect(lightButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dark appearance' })).toBeFocused();
  });
});
