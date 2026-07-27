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

/**
 * Exported for bots that need a guarded service-role client for something
 * beyond a plain row delete (e.g. employee-invite-bot's use of
 * `auth.admin.generateLink()` to obtain a real confirmation link without an
 * inbox — see tests/e2e/README.md "Employee invite bot"). Carries the same
 * non-local-URL guard as the rest of this file; callers are still
 * responsible for their own marker/email safety checks before using it.
 */
export function createGuardedServiceClient(): SupabaseClient<Database> {
  return createCleanupServiceClient();
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
 * Deletes rows in tables with a real FK on customers.id (directly or, for
 * properties, via customer_properties) that would otherwise block the
 * customer delete, in dependency order. Tables with ON DELETE CASCADE
 * directly from customers — customer_properties itself, customer_accounts,
 * customer_location_prefs (see 0002_crm_core.sql,
 * 0012_service_requests_and_customer_accounts.sql,
 * 0005_location_and_automation.sql) — are deliberately NOT deleted here:
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
 * this delete — acceptable debris, not a real-data risk. Properties are swept
 * last (see deleteE2ETestProperties below) since jobs/estimates must be gone
 * first — see that function's doc comment for why properties need their own
 * additional safety check beyond "linked to this customer".
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

  await deleteE2ETestProperties(client, customerIds);
}

/**
 * Deletes properties linked to the given customers via `customer_properties`
 * — but ONLY those whose `address_line_1` is itself `E2E_TEST_`-prefixed (see
 * `buildPropertyTestFixture` in `utils/test-data.ts`). Properties are shared/
 * first-class ("Properties are first-class. They survive customer changes" —
 * 0002_crm_core.sql) — a real property could in principle be linked to a test
 * customer, so this never deletes a property just because it was linked to
 * one; it also requires the property row itself to be tagged as test data.
 *
 * Must run after jobs and estimates are deleted above: both `jobs.property_id`
 * and `estimates.property_id` have no cascade (ON DELETE RESTRICT-equivalent)
 * and would otherwise block this delete.
 */
async function deleteE2ETestProperties(
  client: SupabaseClient<Database>,
  customerIds: string[]
): Promise<void> {
  const { data: links } = await client
    .from('customer_properties')
    .select('property_id')
    .in('customer_id', customerIds);
  const propertyIds = [...new Set((links ?? []).map((link) => link.property_id))];
  if (propertyIds.length === 0) return;

  const { data: properties } = await client
    .from('properties')
    .select('id')
    .in('id', propertyIds)
    .like('address_line_1', `${E2E_TEST_PREFIX}%`);
  const testPropertyIds = (properties ?? []).map((property) => property.id);
  if (testPropertyIds.length === 0) return;

  // The customer_properties junction row cascades automatically (ON DELETE
  // CASCADE from both customer_id and property_id).
  await client.from('properties').delete().in('id', testPropertyIds);
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

// ---------------------------------------------------------------------------
// Test-only Supabase Auth user cleanup (employee-invite-bot)
// ---------------------------------------------------------------------------
//
// Employee-invite-bot creates real Supabase Auth users (via the real
// signup-through-invite flow) that regular row-deletion can't clean up —
// auth.users isn't reachable through cleanupTestCustomerByMarker's ordinary
// table deletes. This is a materially more dangerous operation than deleting
// customer rows (it removes a real login), so it's guarded more tightly
// still: the target email itself must look like dedicated test data, not
// just the marker passed alongside it.

const TEST_ONLY_EMAIL_DOMAINS = ['example.com', 'example.invalid'];

/**
 * Resend hard-rejects sending to @example.com/@example.invalid recipients
 * (confirmed via Auth logs: "550 Invalid `to` field. Please use our testing
 * email address instead of domains like `example.com`") — so any test
 * account that needs a REAL confirmation email delivered (i.e. goes through
 * actual Supabase Auth signUp(), not just DB rows) can't use those domains.
 * `delivered+<label>@resend.dev` is Resend's own documented, reserved test
 * address — always accepted regardless of domain-verification state — with
 * the `+label` free for per-run uniqueness. Narrow on purpose: only this
 * exact reserved local-part prefix on this exact domain, not all of
 * resend.dev generally.
 */
const RESEND_TEST_ADDRESS_PATTERN = /^delivered\+[a-z0-9._-]+@resend\.dev$/;

/**
 * True only for emails matching this suite's own test-account convention:
 * either an "e2e"-prefixed local part on a domain that can never resolve to
 * a real inbox (e2e-admin-bot@example.com, e2e.customer.crud.<x>@example.com),
 * or Resend's reserved delivered+<label>@resend.dev test address (see above).
 * Deliberately stricter than isTestData()/E2E_TEST_PREFIX (which only checks
 * for a substring) since this guards actual account deletion, not a delete
 * scoped to org_id + a unique marker.
 */
export function isTestOnlyEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (RESEND_TEST_ADDRESS_PATTERN.test(lower)) return true;

  const [localPart, domain] = lower.split('@');
  if (!localPart || !domain) return false;
  return /^e2e[._-]/.test(localPart) && TEST_ONLY_EMAIL_DOMAINS.includes(domain);
}

function assertEmailIsTestOnly(email: string): void {
  if (!isTestOnlyEmail(email)) {
    throw new Error(
      `Refusing to delete auth user "${email}" — it doesn't match this suite's test-only ` +
        `email convention (e2e[.-_]-prefixed @${TEST_ONLY_EMAIL_DOMAINS.join(' or @')}, or ` +
        `delivered+<label>@resend.dev). This guard exists so cleanup can never delete a real ` +
        `login, including Kevin's or Brandon's real accounts.`
    );
  }
}

export interface DeleteTestAuthUserResult {
  /** False when cleanup was skipped because credentials aren't configured (not a failure). */
  ranCleanup: boolean;
  deleted: boolean;
  message: string;
}

/**
 * Deletes a Supabase Auth user by email, deleting their org_members row
 * first (FK references auth.users). Guards, in order:
 *  1. `email` must match isTestOnlyEmail() — throws otherwise, always
 *     enforced regardless of credentials.
 *  2. Same credential/URL guards as cleanupTestCustomerByMarker (no-ops
 *     without service-role creds; refuses a non-local Supabase URL unless
 *     E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true).
 *  3. Looks the user up by email via auth.admin.listUsers() (paginated) —
 *     never by a caller-supplied id — so the email guard above is what's
 *     actually authoritative, not something a caller could bypass by
 *     passing an arbitrary user id alongside an innocuous-looking email.
 */
export async function deleteTestAuthUserByEmail(
  email: string
): Promise<DeleteTestAuthUserResult> {
  assertEmailIsTestOnly(email);

  if (!hasServiceRoleCleanupCredentials()) {
    return {
      ranCleanup: false,
      deleted: false,
      message:
        'Skipped auth user cleanup: SUPABASE_SERVICE_ROLE_KEY (and/or NEXT_PUBLIC_SUPABASE_URL) ' +
        'is not set in .env.test.',
    };
  }

  const client = createCleanupServiceClient();
  const lowerEmail = email.toLowerCase();

  let userId: string | undefined;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Auth user lookup failed: ${error.message}`);
    }
    userId = data.users.find((u) => u.email?.toLowerCase() === lowerEmail)?.id;
    if (data.users.length < 200) break; // last page
  }

  if (!userId) {
    return {
      ranCleanup: true,
      deleted: false,
      message: `No auth user found for "${email}" — nothing to clean up.`,
    };
  }

  await client.from('org_members').delete().eq('user_id', userId);

  const { error: deleteError } = await client.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw new Error(`Auth user delete failed: ${deleteError.message}`);
  }

  return { ranCleanup: true, deleted: true, message: `Deleted auth user "${email}".` };
}

export interface CleanupOrgInvitesResult {
  ranCleanup: boolean;
  deletedCount: number;
  message: string;
}

/**
 * Deletes org_invites rows for a test-only email (see isTestOnlyEmail) —
 * regardless of status (pending/accepted/revoked/expired), so a bot can
 * re-invite the same dedicated test address on the next run without
 * tripping the partial-unique-index "already a pending invite" guard.
 */
export async function cleanupTestOrgInvitesByEmail(
  email: string
): Promise<CleanupOrgInvitesResult> {
  assertEmailIsTestOnly(email);

  if (!hasServiceRoleCleanupCredentials()) {
    return {
      ranCleanup: false,
      deletedCount: 0,
      message:
        'Skipped invite cleanup: SUPABASE_SERVICE_ROLE_KEY (and/or NEXT_PUBLIC_SUPABASE_URL) ' +
        'is not set in .env.test.',
    };
  }

  const client = createCleanupServiceClient();
  const { data, error } = await client
    .from('org_invites')
    .delete()
    .ilike('email', email.toLowerCase())
    .select('id');

  if (error) {
    throw new Error(`Invite cleanup failed: ${error.message}`);
  }

  const deletedCount = data?.length ?? 0;
  return {
    ranCleanup: true,
    deletedCount,
    message: `Deleted ${deletedCount} invite(s) for "${email}".`,
  };
}
