/**
 * Cleanup helpers for the Premier CRM bot suite.
 *
 * Two strategies for removing records this suite creates:
 *
 *   1. UI-driven cleanup: navigate to the created record and delete it via
 *      the app's own delete/void actions. Not available for customers yet —
 *      Premier CRM has no delete/archive UI for them (see
 *      `deleteTestCustomerViaUi` below) — so this stays a documented
 *      placeholder until that ships.
 *   2. Direct Supabase cleanup: a service-role client that deletes rows
 *      matching an E2E_TEST_-prefixed marker. Implemented below
 *      (`cleanupTestCustomerByMarker`) since it's the only option available
 *      today. Bypasses RLS, so every guard exists to keep it scoped to rows
 *      this suite actually created — never a broad or date-based delete.
 *
 * Cleanup is idempotent (safe to run with nothing to clean up) and scoped
 * tightly to E2E_TEST_PREFIX-tagged data — see tests/e2e/utils/test-data.ts.
 */

import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { E2E_TEST_PREFIX, isTestData } from './test-data';

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

// ---------------------------------------------------------------------------
// Service-role cleanup (strategy 2 above) — implemented for customer-crud-bot
// ---------------------------------------------------------------------------
//
// Premier CRM has no UI-driven delete/archive flow for customers yet (verified:
// no updateCustomer/archiveCustomer/deleteCustomer anywhere in packages/db or
// apps/web, and the customer detail page at
// apps/web/app/(app)/customers/[customerId]/page.tsx is read-only). Until one
// exists, this is the only way to remove customers this suite creates.
//
// This talks directly to Supabase with the service-role key, bypassing RLS —
// so every guard below exists specifically to make sure that power can only
// ever be pointed at rows this suite created itself, never at real data.

export interface ServiceRoleCleanupResult {
  /** False when cleanup was skipped because credentials aren't configured (not a failure). */
  ranCleanup: boolean;
  deletedCustomerIds: string[];
  message: string;
}

export interface CleanupTestCustomerOptions {
  /** Must start with E2E_TEST_ — see assertMarkerIsSafe(). */
  marker: string;
  /** Optional: also matches customers whose email starts with this value. */
  email?: string;
}

const LOCAL_SUPABASE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Same escaping `packages/db/queries/customers.ts` uses for its own `ilike`
 * search, so a marker/email containing `%` or `_` can't accidentally widen
 * the match.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function resolveSupabaseUrl(): string | undefined {
  // NEXT_PUBLIC_SUPABASE_URL is what this repo actually uses (packages/db/client.ts);
  // SUPABASE_URL is accepted as a fallback per this bot's env var contract.
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

/** True once both env vars needed for service-role cleanup are present. */
export function hasServiceRoleCleanupCredentials(): boolean {
  return Boolean(resolveSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return LOCAL_SUPABASE_HOSTNAMES.has(hostname) || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * Refuses to proceed unless the Supabase URL looks like a local instance
 * (`supabase start`'s 127.0.0.1/localhost), or the caller has explicitly set
 * E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true. Premier CRM does not currently have
 * a confirmed separate dev/staging Supabase project — the same hosted project
 * may hold real customer data — so a hosted URL is treated as "assume this is
 * production" by default rather than trying to guess otherwise.
 */
function assertSupabaseUrlIsSafe(url: string): void {
  if (isLocalSupabaseUrl(url)) return;
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE_CLEANUP === 'true') return;

  throw new Error(
    `Refusing to run service-role cleanup against a non-local Supabase URL (${url}). ` +
      `This looks like it could be a shared or production project. If this is genuinely a ` +
      `dedicated dev/test Supabase project, set E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true to ` +
      `confirm it — never set this against a project that holds real customer data.`
  );
}

/** Refuses to proceed for anything that isn't clearly suite-generated test data. */
function assertMarkerIsSafe(marker: string): void {
  if (!marker.startsWith(E2E_TEST_PREFIX)) {
    throw new Error(
      `Refusing to run cleanup for marker "${marker}" — it does not start with ` +
        `"${E2E_TEST_PREFIX}". This guard exists so cleanup can never touch real customer data.`
    );
  }
}

function createCleanupServiceClient(): SupabaseClient<Database> {
  const url = resolveSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createCleanupServiceClient() called without NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) ' +
        'and SUPABASE_SERVICE_ROLE_KEY set — call hasServiceRoleCleanupCredentials() first.'
    );
  }

  assertSupabaseUrlIsSafe(url);

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Deletes rows in tables with a real FK on customers.id that would otherwise
 * block the customer delete (ON DELETE RESTRICT / no cascade), in dependency
 * order. Tables with ON DELETE CASCADE from customers — customer_properties,
 * customer_accounts, customer_location_prefs (see 0002_crm_core.sql,
 * 0012_service_requests_and_customer_accounts.sql,
 * 0005_location_and_automation.sql) — are deliberately NOT touched here:
 * Postgres removes those automatically when the customer row is deleted.
 *
 * FK sources for this order: jobs.customer_id and estimates.customer_id have
 * no cascade (0002_crm_core.sql, 20260511123231_estimates.sql); invoices.job_id
 * and payments.invoice_id are ON DELETE RESTRICT (20260722000000_invoice_foundation.sql);
 * service_requests.customer_id is ON DELETE RESTRICT
 * (20260510180000_service_requests.sql); communications/vault_items/tasks/
 * user_prompts.customer_id are nullable with no cascade (0003_vault_and_comms.sql,
 * 0005_location_and_automation.sql). quotes.job_id is ON DELETE SET NULL, so
 * quotes tied to a deleted job survive as orphaned rows rather than blocking
 * this delete — acceptable debris, not a real-data risk.
 */
async function deleteDependentRecords(
  client: SupabaseClient<Database>,
  customerIds: string[]
): Promise<void> {
  if (customerIds.length === 0) return;

  const { data: jobs } = await client.from('jobs').select('id').in('customer_id', customerIds);
  const jobIds = (jobs ?? []).map((job) => job.id);

  if (jobIds.length > 0) {
    const { data: invoices } = await client.from('invoices').select('id').in('job_id', jobIds);
    const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);

    if (invoiceIds.length > 0) {
      await client.from('payments').delete().in('invoice_id', invoiceIds);
      await client.from('invoices').delete().in('id', invoiceIds);
    }

    await client.from('jobs').delete().in('id', jobIds);
  }

  await client.from('estimates').delete().in('customer_id', customerIds);
  await client.from('service_requests').delete().in('customer_id', customerIds);
  await client.from('communications').delete().in('customer_id', customerIds);
  await client.from('vault_items').delete().in('customer_id', customerIds);
  await client.from('tasks').delete().in('customer_id', customerIds);
  await client.from('user_prompts').delete().in('customer_id', customerIds);
}

/**
 * Deletes E2E-created customer(s) — and their dependent rows — matching the
 * given marker, using a service-role Supabase client.
 *
 * Guards, in order:
 *  1. `marker` must start with `E2E_TEST_` (throws otherwise — always enforced,
 *     regardless of whether credentials are configured).
 *  2. If SUPABASE_SERVICE_ROLE_KEY / the Supabase URL aren't configured, this
 *     is a no-op: returns `ranCleanup: false` with an explanatory message
 *     rather than throwing, so "cleanup isn't set up yet" is an expected,
 *     non-failing outcome for callers.
 *  3. The resolved Supabase URL must look local, or
 *     E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true must be set (throws otherwise).
 *  4. Only rows whose display_name or email starts with the given
 *     marker/email are matched — never a broad or date-based delete. (Not
 *     scoped by org_id: the marker's timestamp+random suffix is the actual
 *     safety boundary, not org membership.)
 */
export async function cleanupTestCustomerByMarker(
  options: CleanupTestCustomerOptions
): Promise<ServiceRoleCleanupResult> {
  const { marker, email } = options;
  assertMarkerIsSafe(marker);

  if (!hasServiceRoleCleanupCredentials()) {
    return {
      ranCleanup: false,
      deletedCustomerIds: [],
      message:
        'Skipped service-role cleanup: SUPABASE_SERVICE_ROLE_KEY (and/or ' +
        'NEXT_PUBLIC_SUPABASE_URL) is not set in .env.test. The E2E_TEST_-prefixed test ' +
        'customer created by this run was left in place — see tests/e2e/README.md ' +
        '"Manually removing leftover E2E records" for how to remove it by hand.',
    };
  }

  const client = createCleanupServiceClient();
  const markerPattern = `${escapeLikePattern(marker)}%`;

  const orFilter = email
    ? `display_name.ilike.${markerPattern},email.ilike.${escapeLikePattern(email)}%`
    : `display_name.ilike.${markerPattern}`;

  const { data: matches, error: selectError } = await client
    .from('customers')
    .select('id')
    .or(orFilter);

  if (selectError) {
    throw new Error(`Cleanup lookup failed: ${selectError.message}`);
  }

  const customerIds = (matches ?? []).map((row) => row.id);
  if (customerIds.length === 0) {
    return {
      ranCleanup: true,
      deletedCustomerIds: [],
      message: `No customers found matching marker "${marker}" — nothing to clean up.`,
    };
  }

  await deleteDependentRecords(client, customerIds);

  const { error: deleteError } = await client.from('customers').delete().in('id', customerIds);
  if (deleteError) {
    throw new Error(`Cleanup delete failed: ${deleteError.message}`);
  }

  return {
    ranCleanup: true,
    deletedCustomerIds: customerIds,
    message: `Deleted ${customerIds.length} test customer(s) matching marker "${marker}".`,
  };
}
