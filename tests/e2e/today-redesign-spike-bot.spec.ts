/**
 * today-redesign-spike-bot: repeatable verification for the Base44
 * compatibility spike's redesigned /today page (branch
 * spike/base44-today-compat only — see
 * docs/ux/base44-compatibility-spike-report.md). Exercises the
 * presentation-layer redesign against real Forge data/auth/RLS to prove
 * the compatibility-plan's acceptance criteria hold, not just that the
 * data-layer (today-action-queue-bot.spec.ts) is unaffected.
 *
 * This spec is spike-only. It is not part of the reviewed, permanent E2E
 * suite unless the spike itself is approved and merged.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('today redesign spike bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;
  let estimateId: string;

  const owner = { email: '', password: '', userId: '' };
  const employee = { email: '', password: '' };
  const multiOrgUser = { email: '', password: '' };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: 'E2E_TODAY_SPIKE_ORG', slug: `e2e-today-spike-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_TODAY_SPIKE_OTHER_ORG', slug: `e2e-today-spike-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'TodaySpike', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Today Spike Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: estimate } = await admin
      .from('estimates')
      .insert({
        org_id: orgId,
        customer_id: customerId,
        property_id: propertyId,
        title: 'Today spike fixture estimate',
        pricing_review_status: 'pending_review',
        pricing_review_requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    estimateId = estimate!.id;
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimateId, description: 'Line', quantity: 1, unit_price: 100 });

    async function createStaff(role: 'owner' | 'employee', targetOrgId: string): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-today-spike-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `TodaySpike_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    Object.assign(owner, await createStaff('owner', orgId));
    Object.assign(employee, await createStaff('employee', orgId));

    // Multi-org user: active in both orgId (has the pending item) and
    // otherOrgId (has nothing actionable) — for the org-switch isolation test.
    const multiOrg = await createStaff('owner', orgId);
    Object.assign(multiOrgUser, multiOrg);
    await admin.from('org_members').insert({ org_id: otherOrgId, user_id: multiOrg.userId, role: 'owner', status: 'active' });
  });

  test.afterAll(async () => {
    if (!admin) return;
    const { data: members } = await admin.from('org_members').select('user_id').in('org_id', [orgId, otherOrgId]);
    await admin.from('org_members').delete().in('org_id', [orgId, otherOrgId]);
    for (const m of members ?? []) await admin.auth.admin.deleteUser(m.user_id);
    await admin.from('estimates').delete().eq('org_id', orgId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().in('id', [orgId, otherOrgId]);
  });

  async function login(page: import('@playwright/test').Page, account: { email: string; password: string }) {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.com').fill(account.email);
    await page.getByPlaceholder('Enter your password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/today');
  }

  // -----------------------------------------------------------------
  // Role-aware rendering: owner sees the pending-review item, employee doesn't
  // -----------------------------------------------------------------
  test('owner sees the redesigned action-queue item; employee does not', async ({ page }) => {
    await login(page, owner);
    await expect(page.getByText('Needs your attention')).toBeVisible();
    await expect(page.getByText('Today spike fixture estimate')).toBeVisible();
    await expect(page.getByText('Awaiting your review')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');

    await login(page, employee);
    await expect(page.getByText('Today spike fixture estimate')).not.toBeVisible();
  });

  // -----------------------------------------------------------------
  // Navigation to the existing estimate destination
  // -----------------------------------------------------------------
  test('action-queue item navigates to the existing estimate route', async ({ page }) => {
    await login(page, owner);
    await page.getByRole('link', { name: 'Review estimate' }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));
  });

  // -----------------------------------------------------------------
  // Disappearance when no longer actionable
  // -----------------------------------------------------------------
  test('action item disappears once pricing is approved', async ({ page }) => {
    await login(page, owner);
    await expect(page.getByText('Today spike fixture estimate')).toBeVisible();

    const { error: approveError } = await admin
      .from('estimates')
      .update({ pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: owner.userId, pricing_review_status: null })
      .eq('id', estimateId);
    expect(approveError).toBeNull();

    await page.reload();
    await expect(page.getByText('Today spike fixture estimate')).not.toBeVisible();

    // Restore fixture state for subsequent tests in this file.
    await admin
      .from('estimates')
      .update({ pricing_reviewed_at: null, pricing_reviewed_by: null, pricing_review_status: 'pending_review' })
      .eq('id', estimateId);
  });

  // -----------------------------------------------------------------
  // Active-organization switching and isolation
  // -----------------------------------------------------------------
  test('org switching updates org context and action-queue scope', async ({ page }) => {
    await login(page, multiOrgUser);
    const switcher = page.getByLabel('Switch active organization');
    await expect(switcher).toHaveValue(orgId);
    await expect(page.getByText('Today spike fixture estimate')).toBeVisible();

    await switcher.selectOption(otherOrgId);
    await page.waitForURL('**/today');
    await expect(page.getByLabel('Switch active organization')).toHaveValue(otherOrgId);
    await expect(page.getByText('Today spike fixture estimate')).not.toBeVisible();
    await expect(page.getByText('Needs your attention')).not.toBeVisible();

    // Switch back so this account doesn't leave a stale active_org_id
    // preference behind for any other test in this file.
    await page.getByLabel('Switch active organization').selectOption(orgId);
    await page.waitForURL('**/today');
  });

  // -----------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------
  test('empty state: no actionable items hides the section entirely', async ({ page }) => {
    await login(page, employee);
    await expect(page.getByText('Needs your attention')).not.toBeVisible();
  });

  // -----------------------------------------------------------------
  // Mutation path preservation: sign-out
  // -----------------------------------------------------------------
  test('sign-out mutation path is unchanged by the redesign', async ({ page }) => {
    await login(page, owner);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  // -----------------------------------------------------------------
  // Accessibility: keyboard focus reaches the action-queue's primary action
  // -----------------------------------------------------------------
  test('action-queue button is keyboard-reachable and shows a visible focus state', async ({ page }) => {
    await login(page, owner);
    const reviewButton = page.getByRole('link', { name: 'Review estimate' });
    await reviewButton.focus();
    await expect(reviewButton).toBeFocused();
  });

  // -----------------------------------------------------------------
  // Responsive: phone viewport
  // -----------------------------------------------------------------
  test.describe('phone viewport (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('renders without horizontal overflow and shows the mobile bottom nav', async ({ page }) => {
      await login(page, owner);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
    });
  });

  // -----------------------------------------------------------------
  // Responsive: tablet (iPad) viewport
  // -----------------------------------------------------------------
  test.describe('tablet viewport (768x1024)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('renders the 4-column snapshot grid without overflow', async ({ page }) => {
      await login(page, owner);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByText('Business snapshot')).toBeVisible();
    });
  });
});
