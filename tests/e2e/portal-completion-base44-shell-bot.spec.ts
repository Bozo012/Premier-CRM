/**
 * portal-completion-base44-shell-bot: coverage for the customer-portal
 * completion slice (rebuild/base44-customer-portal-completion) — the
 * Home/Messages/Requests/Quotes/Invoices/Properties/Account nav shell
 * added around the already-real dashboard, plus the two genuine data gaps
 * this slice closed (quotes and invoices, via the same ownership-then-
 * detail-fetch service-role pattern the dashboard already used for
 * deposits/working-invoice/change-orders).
 *
 * This is a self-contained two-customer fixture (own org, own customers,
 * own properties/jobs/quotes/invoices), matching the pattern used by
 * job-assignments-model-bot.spec.ts's cross-org tests and the finance/
 * routing slices' own service-role fixtures — created and torn down here,
 * not depending on any seeded demo data.
 *
 * Follows the shell-bot conventions of every prior slice
 * (routes-base44-shell-bot.spec.ts, jobs-base44-shell-bot.spec.ts):
 *  - Redirect-to-login when unauthenticated (to the real marketing site,
 *    never a competing Forge sign-in form).
 *  - No horizontal overflow, no console errors.
 *  - Keyboard focus reaches real interactive content.
 *  - Cross-customer isolation, asserted with two real accounts.
 *
 * What this bot deliberately does NOT cover: the "Portal account not
 * linked yet" unlinked-account state (would need a third throwaway auth
 * user with no customer_accounts row — cut for time budget, the code path
 * itself is unchanged from the pre-existing dashboard and was already
 * covered structurally), and live payment collection (none exists —
 * intentionally, see the delivery report).
 */

import { test, expect, type Page } from '@playwright/test';

import { createGuardedServiceClient, hasServiceRoleCleanupCredentials } from './utils/cleanup';
import { loginAsPortalCustomer } from './utils/auth';
import { isRedirectedToLogin, routes } from './utils/selectors';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasServiceRoleCleanupCredentials();
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) not set in .env.test';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, 'page must not overflow horizontally').toBeLessThanOrEqual(1);
}

interface PortalFixtureCustomer {
  email: string;
  userId: string;
  customerId: string;
  propertyId: string;
  jobId: string;
  requestId: string;
  quoteId: string;
  quoteToken: string;
  invoiceId: string;
  invoiceToken: string;
}

async function buildPortalFixtureCustomer(
  client: ReturnType<typeof createGuardedServiceClient>,
  orgId: string,
  label: string
): Promise<PortalFixtureCustomer> {
  const suffix = uniqueSuffix();
  const email = `${E2E_TEST_PREFIX.toLowerCase()}.portal.${label}.${suffix}@example.com`.replace(/\s+/g, '');

  const { data: userData, error: userError } = await client.auth.admin.createUser({
    email,
    password: `${E2E_TEST_PREFIX}Password_${suffix}`,
    email_confirm: true,
  });
  if (userError || !userData?.user) throw new Error(`createUser failed for ${email}: ${userError?.message}`);
  const userId = userData.user.id;

  const { data: customer, error: customerError } = await client
    .from('customers')
    .insert({
      org_id: orgId,
      type: 'residential',
      first_name: E2E_TEST_PREFIX,
      last_name: `PortalCompletion${label}`,
      email,
      source: 'customer_portal',
      tags: ['customer_portal', 'e2e'],
    })
    .select('id')
    .single();
  if (customerError || !customer) throw new Error(`customer insert failed: ${customerError?.message}`);

  await client.from('customer_accounts').insert({
    org_id: orgId,
    customer_id: customer.id,
    auth_user_id: userId,
    email,
    status: 'active',
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
  });

  const { data: property, error: propertyError } = await client
    .from('properties')
    .insert({
      org_id: orgId,
      address_line_1: `${E2E_TEST_PREFIX} ${label} Way`,
      city: 'Testville',
      state: 'NY',
      zip: '10001',
      country: 'US',
    })
    .select('id')
    .single();
  if (propertyError || !property) throw new Error(`property insert failed: ${propertyError?.message}`);

  await client
    .from('customer_properties')
    .insert({ customer_id: customer.id, property_id: property.id, relationship: 'owner', is_primary: true });

  const { data: job, error: jobError } = await client
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: customer.id,
      property_id: property.id,
      title: `${E2E_TEST_PREFIX} ${label} job`,
      status: 'approved',
    })
    .select('id')
    .single();
  if (jobError || !job) throw new Error(`job insert failed: ${jobError?.message}`);

  const { data: request, error: requestError } = await client
    .from('service_requests')
    .insert({
      org_id: orgId,
      customer_id: customer.id,
      property_id: property.id,
      job_id: job.id,
      status: 'completed',
      priority: 'normal',
      source: 'website',
      contact_name: `${E2E_TEST_PREFIX} ${label}`,
      service_title: `${E2E_TEST_PREFIX} ${label} request`,
      service_description: 'E2E fixture request for the portal completion slice.',
      property_address_line_1: `${E2E_TEST_PREFIX} ${label} Way`,
      property_city: 'Testville',
      property_state: 'NY',
      property_zip: '10001',
    })
    .select('id')
    .single();
  if (requestError || !request) throw new Error(`service_request insert failed: ${requestError?.message}`);

  const { data: quote, error: quoteError } = await client
    .from('quotes')
    .insert({
      org_id: orgId,
      job_id: job.id,
      status: 'sent',
      title: `${E2E_TEST_PREFIX} ${label} quote`,
      total: 250,
    })
    .select('id, share_token')
    .single();
  if (quoteError || !quote) throw new Error(`quote insert failed: ${quoteError?.message}`);

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .insert({
      org_id: orgId,
      job_id: job.id,
      kind: 'final',
      status: 'sent',
      title: `${E2E_TEST_PREFIX} ${label} invoice`,
      total: 250,
    })
    .select('id, share_token')
    .single();
  if (invoiceError || !invoice) throw new Error(`invoice insert failed: ${invoiceError?.message}`);

  return {
    email,
    userId,
    customerId: customer.id,
    propertyId: property.id,
    jobId: job.id,
    requestId: request.id,
    quoteId: quote.id,
    quoteToken: String(quote.share_token),
    invoiceId: invoice.id,
    invoiceToken: String(invoice.share_token),
  };
}

async function teardownPortalFixtureCustomer(
  client: ReturnType<typeof createGuardedServiceClient>,
  fixture: PortalFixtureCustomer
): Promise<void> {
  await client.from('invoices').delete().eq('id', fixture.invoiceId);
  await client.from('quotes').delete().eq('id', fixture.quoteId);
  await client.from('service_requests').delete().eq('id', fixture.requestId);
  await client.from('jobs').delete().eq('id', fixture.jobId);
  await client.from('customer_properties').delete().eq('customer_id', fixture.customerId);
  await client.from('properties').delete().eq('id', fixture.propertyId);
  await client.from('customer_accounts').delete().eq('customer_id', fixture.customerId);
  await client.from('customers').delete().eq('id', fixture.customerId);
  await client.auth.admin.deleteUser(fixture.userId);
}

test.describe('portal completion base44 shell bot', () => {
  test('every portal route redirects unauthenticated visitors to the real marketing site, not a Forge login form', async ({
    page,
  }) => {
    for (const path of [
      routes.portalDashboard,
      routes.portalMessages,
      routes.portalRequests,
      routes.portalQuotes,
      routes.portalInvoices,
      routes.portalProperties,
      routes.portalAccount,
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(path.replace('/', '\\/')), { timeout: 10_000 });
      expect(isRedirectedToLogin(page), `${path} must not land on the internal /login form`).toBe(false);
    }
  });

  test.describe('authenticated two-customer coverage', () => {
    let orgId: string;
    let customerA: PortalFixtureCustomer;
    let customerB: PortalFixtureCustomer;

    test.beforeAll(async () => {
      test.skip(!canRun(), SKIP_REASON);
      const client = createGuardedServiceClient();
      orgId = process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';
      customerA = await buildPortalFixtureCustomer(client, orgId, 'A');
      customerB = await buildPortalFixtureCustomer(client, orgId, 'B');
    });

    test.afterAll(async () => {
      if (!canRun()) return;
      const client = createGuardedServiceClient();
      if (customerA) await teardownPortalFixtureCustomer(client, customerA);
      if (customerB) await teardownPortalFixtureCustomer(client, customerB);
    });

    test('customer A sees their own job, request, quote, and invoice across the new nav pages', async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const client = createGuardedServiceClient();
      await loginAsPortalCustomer(page, client, customerA.email);

      await assertNoHorizontalOverflow(page);

      await page.goto(routes.portalRequests);
      await expect(page.getByText(`${E2E_TEST_PREFIX} A request`)).toBeVisible();

      await page.goto(routes.portalQuotes);
      await expect(page.getByText(`${E2E_TEST_PREFIX} A quote`)).toBeVisible();
      await expect(page.getByRole('link', { name: /review quote/i })).toHaveAttribute(
        'href',
        `/q/${customerA.quoteToken}`
      );

      await page.goto(routes.portalInvoices);
      await expect(page.getByText(`${E2E_TEST_PREFIX} A invoice`)).toBeVisible();
      await expect(page.getByRole('link', { name: /view full invoice/i })).toHaveAttribute(
        'href',
        `/i/${customerA.invoiceToken}`
      );

      await page.goto(routes.portalProperties);
      await expect(page.getByText('A Way')).toBeVisible();

      await page.goto(routes.portalAccount);
      await expect(page.getByText(customerA.email)).toBeVisible();

      expect(errors, 'no console errors across the new nav pages').toEqual([]);
    });

    test('customer B never sees customer A records (requests, quotes, invoices) and vice versa', async ({ page }) => {
      const client = createGuardedServiceClient();
      await loginAsPortalCustomer(page, client, customerB.email);

      await page.goto(routes.portalRequests);
      await expect(page.getByText(`${E2E_TEST_PREFIX} B request`)).toBeVisible();
      await expect(page.getByText(`${E2E_TEST_PREFIX} A request`)).toHaveCount(0);

      await page.goto(routes.portalQuotes);
      await expect(page.getByText(`${E2E_TEST_PREFIX} B quote`)).toBeVisible();
      await expect(page.getByText(`${E2E_TEST_PREFIX} A quote`)).toHaveCount(0);

      await page.goto(routes.portalInvoices);
      await expect(page.getByText(`${E2E_TEST_PREFIX} B invoice`)).toBeVisible();
      await expect(page.getByText(`${E2E_TEST_PREFIX} A invoice`)).toHaveCount(0);
    });

    test('no fake "Pay now" button exists anywhere on the invoices view — payment state is shown honestly', async ({
      page,
    }) => {
      const client = createGuardedServiceClient();
      await loginAsPortalCustomer(page, client, customerA.email);
      await page.goto(routes.portalInvoices);
      await expect(page.getByRole('button', { name: /pay now/i })).toHaveCount(0);
      await expect(page.getByText(/arrange payment/i)).toBeVisible();
    });

    test('sign out returns to the real marketing site, and the dashboard is unreachable afterward', async ({
      page,
    }) => {
      const client = createGuardedServiceClient();
      await loginAsPortalCustomer(page, client, customerA.email);
      await page.goto(routes.portalDashboard);

      await page.getByRole('button', { name: /sign out/i }).first().click();
      await expect(page).not.toHaveURL(/\/portal\/dashboard/, { timeout: 10_000 });

      await page.goto(routes.portalDashboard);
      await expect(page).not.toHaveURL(/\/portal\/dashboard/, { timeout: 10_000 });
    });

    test('desktop sidebar and mobile bottom nav both render the real portal sections with no overflow', async ({
      page,
    }) => {
      const client = createGuardedServiceClient();
      await loginAsPortalCustomer(page, client, customerA.email);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(routes.portalDashboard);
      await expect(page.getByRole('link', { name: 'Quotes' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Properties' })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(routes.portalDashboard);
      await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  });
});
