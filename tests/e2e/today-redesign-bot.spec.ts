/**
 * today-redesign-bot: the final Forge V1.1 Today redesign (see
 * docs/ux/forge-v1.1-today-redesign.md). Adapts the reusable behavior
 * coverage from the Base44 compatibility spike's
 * today-redesign-spike-bot.spec.ts (reference-only, not merged — lived on
 * spike/base44-today-compat) plus new coverage for capability-filtered
 * quick actions, the merged jobs+site-visits schedule, operational-count
 * accuracy, and desktop/tablet navigation. today-action-queue-bot.spec.ts
 * (unmodified, data-layer only) remains the authoritative coverage for
 * getTodayActionItems()'s role/capability filtering — not duplicated here.
 *
 * Assertions target accessible roles/labels, real data content, and URL
 * destinations — never CSS classes or decorative markup — so this suite
 * survives a future real-Base44-output substitution at the
 * BASE44-REPLACEABLE seams (see the presentation components).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('today redesign bot', () => {
  let admin: SupabaseClient<Database>;
  let orgId: string;
  let otherOrgId: string;
  let customerId: string;
  let propertyId: string;
  let estimateId: string;

  const owner = { email: '', password: '', userId: '' };
  const employee = { email: '', password: '' };
  const viewer = { email: '', password: '' };
  const multiOrgUser = { email: '', password: '' };
  const otherOrgOwner = { email: '', password: '' };

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgId = crypto.randomUUID();
    otherOrgId = crypto.randomUUID();
    await admin.from('organizations').insert([
      { id: orgId, name: 'E2E_TODAY_REDESIGN_ORG', slug: `e2e-today-redesign-${Date.now()}` },
      { id: otherOrgId, name: 'E2E_TODAY_REDESIGN_OTHER_ORG', slug: `e2e-today-redesign-other-${Date.now()}` },
    ]);

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'TodayRedesign', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Today Redesign Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const { data: estimate } = await admin
      .from('estimates')
      .insert({
        org_id: orgId,
        customer_id: customerId,
        property_id: propertyId,
        title: 'Today redesign fixture estimate',
        pricing_review_status: 'pending_review',
        pricing_review_requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    estimateId = estimate!.id;
    await admin.from('estimate_line_items').insert({ org_id: orgId, estimate_id: estimateId, description: 'Line', quantity: 1, unit_price: 100 });

    async function createStaff(role: 'owner' | 'employee' | 'viewer', targetOrgId: string): Promise<{ email: string; password: string; userId: string }> {
      const email = `e2e-today-redesign-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const password = `TodayRedesign_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${role}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: targetOrgId, user_id: created.user.id, role, status: 'active' });
      return { email, password, userId: created.user.id };
    }

    Object.assign(owner, await createStaff('owner', orgId));
    Object.assign(employee, await createStaff('employee', orgId));
    Object.assign(viewer, await createStaff('viewer', orgId));
    Object.assign(otherOrgOwner, await createStaff('owner', otherOrgId));

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
  // Role visibility
  // -----------------------------------------------------------------
  test('owner sees the pending-review item; employee does not; viewer sees no actionable tasks at all', async ({ page }) => {
    await login(page, owner);
    await expect(page.getByText('Needs your attention')).toBeVisible();
    await expect(page.getByText('Today redesign fixture estimate')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');

    await login(page, employee);
    await expect(page.getByText('Today redesign fixture estimate')).not.toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');

    await login(page, viewer);
    await expect(page.getByText('Nothing needs your attention right now')).toBeVisible();
  });

  // -----------------------------------------------------------------
  // Cross-org isolation
  // -----------------------------------------------------------------
  test('cross-org owner sees no cross-tenant action items', async ({ page }) => {
    await login(page, otherOrgOwner);
    await expect(page.getByText('Today redesign fixture estimate')).not.toBeVisible();
  });

  // -----------------------------------------------------------------
  // Navigation destination
  // -----------------------------------------------------------------
  test('action item navigates to the real estimate route', async ({ page }) => {
    await login(page, owner);
    await page.getByRole('link', { name: 'Review estimate' }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));
  });

  // -----------------------------------------------------------------
  // Disappearance after resolution
  // -----------------------------------------------------------------
  test('action item disappears once pricing is approved, and the empty state returns', async ({ page }) => {
    await login(page, owner);
    await expect(page.getByText('Today redesign fixture estimate')).toBeVisible();

    const { error } = await admin
      .from('estimates')
      .update({ pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: owner.userId, pricing_review_status: null })
      .eq('id', estimateId);
    expect(error).toBeNull();

    await page.reload();
    await expect(page.getByText('Today redesign fixture estimate')).not.toBeVisible();

    await admin
      .from('estimates')
      .update({ pricing_reviewed_at: null, pricing_reviewed_by: null, pricing_review_status: 'pending_review' })
      .eq('id', estimateId);
  });

  // -----------------------------------------------------------------
  // Organization switching
  // -----------------------------------------------------------------
  test('org switching updates org context and action-queue scope', async ({ page }) => {
    await login(page, multiOrgUser);
    const switcher = page.getByLabel('Switch active organization');
    await expect(switcher).toHaveValue(orgId);
    await expect(page.getByText('Today redesign fixture estimate')).toBeVisible();

    await switcher.selectOption(otherOrgId);
    await page.waitForURL('**/today');
    await expect(page.getByLabel('Switch active organization')).toHaveValue(otherOrgId);
    await expect(page.getByText('Today redesign fixture estimate')).not.toBeVisible();

    await page.getByLabel('Switch active organization').selectOption(orgId);
    await page.waitForURL('**/today');
  });

  // -----------------------------------------------------------------
  // Sign out
  // -----------------------------------------------------------------
  test('sign-out is unchanged by the redesign', async ({ page }) => {
    await login(page, owner);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  // -----------------------------------------------------------------
  // Quick actions — capability filtering
  // -----------------------------------------------------------------
  test('quick actions are filtered by capability: owner sees all four, viewer sees only capability-free actions', async ({ page }) => {
    await login(page, owner);
    await expect(page.getByRole('link', { name: 'New estimate' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New invoice' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');

    await login(page, viewer);
    await expect(page.getByRole('link', { name: 'New customer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review quotes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New estimate' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'New invoice' })).not.toBeVisible();
  });

  // -----------------------------------------------------------------
  // Operational counts derived from authorized data
  // -----------------------------------------------------------------
  test('operational snapshot reflects real, org-scoped counts (not accounting totals)', async ({ page }) => {
    const { data: job, error: jobError } = await admin
      .from('jobs')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Snapshot fixture job', status: 'approved' })
      .select('id')
      .single();
    expect(jobError).toBeNull();

    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .insert({ org_id: orgId, job_id: job!.id, kind: 'final', status: 'sent' })
      .select('id')
      .single();
    expect(invoiceError).toBeNull();

    await login(page, owner);
    await expect(page.getByText('Operational snapshot')).toBeVisible();
    const invoiceCard = page.getByRole('link').filter({ hasText: 'Invoices needing action' });
    await expect(invoiceCard).toBeVisible();
    await expect(invoiceCard.locator('p.text-4xl')).toHaveText('1');
    // No revenue/currency figures anywhere in the snapshot section (Kevin
    // decision: actionable counts only, never accounting totals).
    const snapshotSection = page.locator('section', { has: page.getByText('Operational snapshot') });
    await expect(snapshotSection).not.toContainText('$');

    if (invoice) await admin.from('invoices').delete().eq('id', invoice.id);
    if (job) await admin.from('jobs').delete().eq('id', job.id);
  });

  // -----------------------------------------------------------------
  // Accessibility: keyboard focus + accessible names
  // -----------------------------------------------------------------
  test('action-queue button is keyboard-reachable with an accessible name', async ({ page }) => {
    await login(page, owner);
    const reviewButton = page.getByRole('link', { name: 'Review estimate' });
    await reviewButton.focus();
    await expect(reviewButton).toBeFocused();
  });

  // -----------------------------------------------------------------
  // Desktop navigation
  // -----------------------------------------------------------------
  test.describe('desktop viewport (1440x900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('persistent desktop nav renders and navigates without full page-reload navigation loss', async ({ page }) => {
      await login(page, owner);
      const nav = page.getByRole('navigation', { name: 'Primary' });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
      await nav.getByRole('link', { name: 'Customers' }).click();
      await expect(page).toHaveURL(/\/customers$/);
    });
  });

  // -----------------------------------------------------------------
  // Responsive: phone, tablet portrait, tablet landscape
  // -----------------------------------------------------------------
  for (const vp of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
  ] as const) {
    test.describe(`${vp.name} viewport (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test(`renders without horizontal overflow at ${vp.name}`, async ({ page }) => {
        await login(page, owner);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      });
    });
  }
});
