/**
 * employee-estimate-workflow-bot: proves the real, end-to-end field-work
 * loop PR B set out to verify — Brandon (the persistent E2E employee
 * account) can find an existing customer/property the owner created, build
 * an estimate on his own account, and Kevin (the owner) immediately sees and
 * can continue that same work (PR B, Phases 4 & 5). The last describe block
 * repeats the core loop at phone and tablet viewport widths (Phase 6),
 * reusing the same `viewportProfiles` mobile-simplicity-bot already defines
 * rather than inventing new mobile test infrastructure.
 *
 * What "edit a draft estimate" / "add line items to the estimate" mean in
 * this codebase today: there is no edit UI for an estimate's title or
 * description after creation (verified: estimates/[estimateId]/page.tsx has
 * no edit form, and estimates/actions.ts has no updateEstimateAction — only
 * updateEstimateStatusAction and createQuoteFromEstimateAction exist).
 * Estimates also have no line-item concept anywhere in this schema — line
 * items belong to quotes, added only after "Approve → create quote". So the
 * real, currently-shippable version of "employee edits/continues work on a
 * draft" this bot proves is: create estimate -> advance its status (the one
 * real mutation a draft estimate supports) -> approve into a draft quote ->
 * add real line items to that quote. See test 6's test.skip for why building
 * a new estimate-editing UI to satisfy the literal wording would be exactly
 * the Customer Command Center redesign PR B says not to start here.
 */

import { test, expect } from '@playwright/test';
import { createStaffScenario, type StaffScenario } from './context/scenario';
import { hasAdminCredentials, hasStaffCredentials, getStaffAccount } from './utils/auth';
import {
  routes,
  propertiesCard,
  newEstimateForm,
  quoteLineItemEditor,
} from './utils/selectors';
import { viewportProfiles, MIN_TAP_TARGET_PX, HORIZONTAL_SCROLL_TOLERANCE_PX } from './utils/mobile';
import type { EstimateFixture } from './context/estimate';

const canRun = () => hasAdminCredentials() && hasStaffCredentials();
const SKIP_REASON = 'TEST_ADMIN_* and/or TEST_STAFF_* not set in .env.test';

test.describe('employee estimate workflow bot', () => {
  test.describe.serial('desktop: shared estimate workflow (Phase 4 & 5)', () => {
    let scenario: StaffScenario;
    let estimate: EstimateFixture;
    let quoteId: string;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const ownerPage = await browser.newPage();
      const employeePage = await browser.newPage();
      scenario = await createStaffScenario({
        ownerPage,
        employeePage,
        customer: true,
        property: true,
      });
    });

    test.afterAll(async () => {
      await scenario?.ownerSession.finish();
      await scenario?.employeeSession.finish();
    });

    test('1. owner has an active shared customer + property, employee confirmed active', async () => {
      expect(scenario.customer).toBeDefined();
      expect(scenario.property).toBeDefined();
      expect(scenario.membership.status).toBe('active');
      expect(scenario.membership.role).toBe('employee');
    });

    test('2. employee finds the shared customer and opens the shared property', async () => {
      const { page } = scenario.employeeSession;
      const customer = scenario.customer!;
      const property = scenario.property!;

      await page.goto(routes.customers);
      await page.getByPlaceholder(/search/i).fill(customer.marker);
      await expect(page.getByText(customer.marker, { exact: false })).toBeVisible({ timeout: 10_000 });

      await page.goto(customer.url);
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
      await expect(propertiesCard.propertyLink(page, property.addressLine1)).toBeVisible();
    });

    test('3. employee creates an estimate for the shared customer/property', async () => {
      estimate = await scenario.employeeSession.estimate(scenario.customer, scenario.property);
      expect(estimate.customerId).toBe(scenario.customer!.id);
    });

    test('4. employee can leave and reopen the estimate — data persists', async () => {
      const { page } = scenario.employeeSession;

      await page.goto(routes.today);
      await page.goto(estimate.url);

      await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();
      await expect(page.getByText(scenario.customer!.marker, { exact: false })).toBeVisible();
      await expect(page.getByText(estimate.propertyAddressLine1, { exact: false })).toBeVisible();
    });

    test('5. the same estimate reopens correctly after a fresh employee login', async () => {
      const { page } = scenario.employeeSession;
      const account = getStaffAccount();

      // "Sign out" only renders on /today's dashboard shell (verified: not
      // present on /customers/[id], /estimates/[id], etc. — see
      // apps/web/app/(app)/today/page.tsx) — not present on every page.
      await page.goto(routes.today);
      await page.getByRole('button', { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      await page.locator('#email').fill(account.email);
      await page.locator('#password').fill(account.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

      await page.goto(estimate.url);
      await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();
    });

    test.skip("employee edits the draft estimate's title/description, or adds line items to it directly", async () => {
      // NOT IMPLEMENTED anywhere in the app today — see this file's top
      // doc comment for the full verification. Test 6 exercises the one
      // real mutation a draft estimate supports (advancing its status);
      // test 7 exercises real line items at the quote level, which is where
      // this schema actually puts them.
    });

    test('6. employee advances the estimate toward a site visit (the one real "edit" a draft supports)', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(estimate.url);

      await page.getByRole('button', { name: 'Schedule site visit' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByText('Site Visit Scheduled')).toBeVisible({ timeout: 10_000 });
    });

    test('7. employee approves the estimate into a draft quote and adds a line item', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(estimate.url);

      await page.getByRole('button', { name: 'Approve → create quote' }).click();
      await page.getByRole('button', { name: 'Approve & build quote' }).click();
      await page.waitForURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
      quoteId = new URL(page.url()).pathname.split('/').pop()!;

      await quoteLineItemEditor.addLineItemToggle(page).click();
      await quoteLineItemEditor.nameInput(page).fill('E2E test labor line item');
      await quoteLineItemEditor.unitInput(page).fill('hour');
      await quoteLineItemEditor.quantityInput(page).fill('2');
      await quoteLineItemEditor.unitPriceInput(page).fill('75');
      await quoteLineItemEditor.submitButton(page).click();

      await expect(page.getByText('E2E test labor line item')).toBeVisible({ timeout: 10_000 });
    });

    test('8. employee leaves and reopens the quote — the line item persists', async () => {
      const { page } = scenario.employeeSession;
      await page.goto(routes.today);
      await page.goto(`/quotes/${quoteId}`);
      await expect(page.getByText('E2E test labor line item')).toBeVisible();
    });

    test('9. owner opens the same customer and finds the employee-created estimate', async () => {
      const { page } = scenario.ownerSession;
      const customer = scenario.customer!;

      await page.goto(customer.url);
      await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();

      await page.goto(estimate.url);
      await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();
      // Status is "Quoted", not "Site Visit Scheduled", by this point — test
      // 7's createQuoteFromEstimateAction advances it again automatically
      // (see estimates/actions.ts: "Advance estimate status to 'quoted'").
      await expect(page.getByText('Quoted', { exact: true })).toBeVisible();
    });

    test('10. owner sees creator attribution on the employee-created estimate', async () => {
      const { page } = scenario.ownerSession;
      await page.goto(estimate.url);
      await expect(page.getByText(new RegExp(`by ${scenario.employee.name}`))).toBeVisible();
    });

    test('11. owner sees the employee-added line item and can continue the quote', async () => {
      const { page } = scenario.ownerSession;
      await page.goto(`/quotes/${quoteId}`);
      await expect(page.getByText('E2E test labor line item')).toBeVisible();

      await quoteLineItemEditor.addLineItemToggle(page).click();
      await quoteLineItemEditor.nameInput(page).fill('E2E test materials line item');
      await quoteLineItemEditor.unitInput(page).fill('each');
      await quoteLineItemEditor.quantityInput(page).fill('1');
      await quoteLineItemEditor.unitPriceInput(page).fill('40');
      await quoteLineItemEditor.submitButton(page).click();
      await expect(page.getByText('E2E test materials line item')).toBeVisible({ timeout: 10_000 });
    });

    test('12. only one shared customer exists — no duplicate created by either session', async () => {
      const { page } = scenario.ownerSession;
      const customer = scenario.customer!;

      await page.goto(routes.customers);
      const links = page.getByRole('link', { name: new RegExp(escapeRegExp(customer.marker)) });
      await expect(links).toHaveCount(1);
    });
  });

  for (const profile of viewportProfiles) {
    test.describe(`mobile/tablet: employee estimate workflow — ${profile.name} (${profile.width}x${profile.height})`, () => {
      let scenario: StaffScenario;

      test.beforeAll(async ({ browser }) => {
        test.skip(!canRun(), SKIP_REASON);
        const viewport = { width: profile.width, height: profile.height };
        const ownerPage = await browser.newPage({ viewport });
        const employeePage = await browser.newPage({ viewport });
        scenario = await createStaffScenario({
          ownerPage,
          employeePage,
          customer: true,
          property: true,
        });
      });

      test.afterAll(async () => {
        await scenario?.ownerSession.finish();
        await scenario?.employeeSession.finish();
      });

      test('employee can find the shared customer, open the property, and create an estimate', async () => {
        const { page } = scenario.employeeSession;
        const customer = scenario.customer!;
        const property = scenario.property!;

        await page.goto(customer.url);
        await expect(page.getByRole('heading', { name: customer.marker })).toBeVisible();
        await expect(propertiesCard.propertyLink(page, property.addressLine1)).toBeVisible();

        const estimate = await scenario.employeeSession.estimate(scenario.customer, scenario.property);
        await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();
      });

      test('no horizontal overflow on the estimate creation form at this viewport', async () => {
        const { page } = scenario.employeeSession;
        await page.goto(routes.newEstimate);

        // Same behavioral check as mobile-simplicity-bot.spec.ts — attempts
        // to scroll right and confirms the page didn't actually move, rather
        // than comparing scrollWidth/clientWidth (unreliable under viewport
        // emulation — see HORIZONTAL_SCROLL_TOLERANCE_PX's doc comment).
        const scrollXAfterAttempt = await page.evaluate(() => {
          window.scrollTo(9999, 0);
          return window.scrollX;
        });
        expect(scrollXAfterAttempt).toBeLessThanOrEqual(HORIZONTAL_SCROLL_TOLERANCE_PX);
      });

      test("key touch targets meet the app's minimum comfortable tap size", async () => {
        const { page } = scenario.employeeSession;
        await page.goto(routes.newEstimate);

        const submitButton = newEstimateForm.submitButton(page);
        const box = await submitButton.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
        }
      });

      test('no owner-only controls are shown to the employee on the estimate detail page', async () => {
        const { page } = scenario.employeeSession;
        const estimate = await scenario.employeeSession.estimate(scenario.customer, scenario.property);
        await page.goto(estimate.url);

        // Estimates have no owner-only controls at all today (Phase 1 audit —
        // any active org member has full CRUD on CRM data by design), so this
        // is a smoke check that the page doesn't render a broken/blocked
        // state for the employee, not a check for a hidden button.
        await expect(page.getByRole('heading', { name: estimate.title })).toBeVisible();
        await expect(page.getByText(/forbidden|not authorized/i)).toHaveCount(0);
      });
    });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
