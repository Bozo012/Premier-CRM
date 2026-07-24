/**
 * Cleanup helpers for the Premier CRM bot suite.
 *
 * Scaffolded, not wired up yet. Once bots start creating real records (a
 * customer, a property, an invoice) through the UI, this is where teardown
 * logic goes so repeated runs don't pile up E2E_TEST_ prefixed junk in dev
 * data. Two intended strategies, either is fine to implement later:
 *
 *   1. UI-driven cleanup: navigate to the created record and delete it via
 *      the app's own delete/void actions (slower, but exercises real code
 *      paths and needs no extra access).
 *   2. Direct Supabase cleanup: use a service-role client (server-side only,
 *      from env, never checked in) to delete rows matching E2E_TEST_PREFIX
 *      after each run. Faster, but bypasses RLS/app logic so it should only
 *      delete rows this suite created.
 *
 * Whichever approach is chosen, cleanup should be idempotent (safe to run
 * with nothing to clean up) and scoped tightly to E2E_TEST_PREFIX-tagged data
 * — see tests/e2e/utils/test-data.ts.
 */

import type { Page } from '@playwright/test';
import { isTestData } from './test-data';

export interface CleanupTask {
  description: string;
  run: () => Promise<void>;
}

/**
 * In-memory registry a spec can push cleanup tasks onto during a test, then
 * flush in an afterEach/afterAll. Kept intentionally simple — no external
 * state — so it's safe to import from any spec file.
 */
export class CleanupRegistry {
  private tasks: CleanupTask[] = [];

  register(task: CleanupTask): void {
    this.tasks.push(task);
  }

  async flush(): Promise<void> {
    // Run in reverse order (LIFO) so dependent records (e.g. a property tied
    // to a customer) get cleaned up before the record they depend on.
    const remaining = [...this.tasks].reverse();
    this.tasks = [];

    for (const task of remaining) {
      try {
        await task.run();
      } catch (error) {
        // Cleanup failures shouldn't fail the test that already passed/failed
        // on its own merits — but they should be loud so stale test data
        // doesn't go unnoticed.
        console.warn(`[cleanup] failed: ${task.description}`, error);
      }
    }
  }
}

/**
 * Placeholder for UI-driven deletion of a test customer once the customer
 * detail page exposes a delete action. Currently a no-op that documents
 * intent — implement when the customer-crud bot needs real teardown.
 */
export async function deleteTestCustomerViaUi(page: Page, customerName: string): Promise<void> {
  if (!isTestData(customerName)) {
    throw new Error(
      `Refusing to delete "${customerName}" — name is not tagged with E2E_TEST_PREFIX. ` +
        `This guard exists to prevent bots from ever deleting real Premier data.`
    );
  }

  // TODO: implement once a delete-customer UI action exists.
  // await page.goto(...); await page.getByRole('button', { name: /delete/i }).click(); ...
}
