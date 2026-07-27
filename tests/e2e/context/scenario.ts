/**
 * Business Scenario Builder (Phase 2). Lets a bot start from a known
 * business state instead of composing individual fixture calls itself:
 *
 *   const scenario = await createScenario(session, {
 *     property: true,
 *     estimate: true,
 *     invoice: true,
 *   });
 *   scenario.customer   // always created if anything else is requested
 *   scenario.property
 *   scenario.estimate
 *   scenario.job
 *   scenario.invoice
 *   scenario.warnings   // non-fatal notes about anything not fully automated
 *
 * Internally this is just `session.customer()` / `session.property()` / etc
 * in dependency order — see tests/e2e/context/session.ts for the actual
 * fixture logic and cleanup registration. Extend this by adding a new
 * boolean option here and one more `if` block; the underlying session
 * methods do the real work.
 */

import type { Page } from '@playwright/test';
import type { CustomerFixture } from './customer';
import type { PropertyFixture } from './property';
import type { EstimateFixture } from './estimate';
import type { JobFixture } from './job';
import type { InvoiceFixture } from './invoice';
import { addInvoiceLineItem, payInvoiceInFull } from './invoice';
import { createTestSession, type TestSession } from './session';
import { loginAsAdmin, loginAsStaff } from './auth';
import { getStaffAccount, getStaffName } from '../utils/auth';
import { createGuardedServiceClient } from '../utils/cleanup';

export interface ScenarioOptions {
  /** Implied `true` whenever any other option below is set. */
  customer?: boolean;
  property?: boolean;
  estimate?: boolean;
  job?: boolean;
  invoice?: boolean;
  /**
   * Adds a line item and records a full payment against `scenario.invoice`.
   * Requires `invoice: true`. `paid: false` (or omitted) leaves the invoice
   * as a bare draft with no line items.
   */
  paid?: boolean;
  /**
   * NOT fully automated — see `scenario.warnings`. Real estimate→job
   * conversion requires a quote to be sent and accepted through the
   * customer portal's magic-link flow, which this suite doesn't drive yet.
   * When set, this creates the draft quote from the estimate (a real,
   * staff-side step — apps/web/app/(app)/estimates/_components/
   * create-quote-button.tsx) and stops there; it does NOT create a job.
   * Set `job: true` separately if the scenario needs a job regardless (it
   * will be an unrelated standalone job, not one converted from this quote).
   */
  convertEstimateToJob?: boolean;
}

export interface Scenario {
  customer?: CustomerFixture;
  property?: PropertyFixture;
  estimate?: EstimateFixture;
  job?: JobFixture;
  invoice?: InvoiceFixture;
  /** Draft quote id created by `convertEstimateToJob`, if requested. Not a full fixture — see that option's doc comment. */
  quoteId?: string;
  /** Non-fatal notes about anything requested but not fully automated. */
  warnings: string[];
}

export async function createScenario(
  session: TestSession,
  options: ScenarioOptions
): Promise<Scenario> {
  const warnings: string[] = [];
  const needsCustomer =
    options.customer ||
    options.property ||
    options.estimate ||
    options.job ||
    options.invoice ||
    options.convertEstimateToJob;

  const scenario: Scenario = { warnings };
  if (!needsCustomer) return scenario;

  scenario.customer = await session.customer();

  if (options.property || options.estimate || options.job) {
    scenario.property = await session.property(scenario.customer);
  }

  if (options.estimate || options.convertEstimateToJob) {
    scenario.estimate = await session.estimate(scenario.customer, scenario.property);
  }

  if (options.convertEstimateToJob && scenario.estimate) {
    scenario.quoteId = await approveEstimateIntoDraftQuote(session, scenario.estimate);
    warnings.push(
      'convertEstimateToJob: created a draft quote from the estimate, but stopped there — ' +
        'sending/accepting the quote requires the customer portal magic-link flow, which ' +
        'this suite does not automate yet, so no job was created from it. Set job: true ' +
        'for an unrelated standalone job if the scenario needs one regardless.'
    );
  }

  if (options.job) {
    scenario.job = await session.job(scenario.customer, scenario.property);
  }

  if (options.invoice) {
    const job = scenario.job ?? (await session.job(scenario.customer, scenario.property));
    scenario.job = job;
    scenario.invoice = await session.invoice(job);

    if (options.paid) {
      await addInvoiceLineItem(session.page, scenario.invoice);
      await payInvoiceInFull(session.page, scenario.invoice);
    }
  } else if (options.paid) {
    warnings.push('paid: true has no effect without invoice: true — nothing to pay.');
  }

  return scenario;
}

/** See ScenarioOptions.convertEstimateToJob's doc comment for scope. */
async function approveEstimateIntoDraftQuote(
  session: TestSession,
  estimate: EstimateFixture
): Promise<string> {
  const { page } = session;
  await page.goto(estimate.url);
  await page.getByRole('button', { name: 'Approve → create quote' }).click();
  await page.getByRole('button', { name: 'Approve & build quote' }).click();
  await page.waitForURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}

// ---------------------------------------------------------------------------
// Staff Scenario Builder (PR B, Phase 7) — two simultaneous browser contexts
// (owner + persistent E2E employee) sharing one org, for permissions and
// shared-workflow bots (staff-permissions-bot, employee-estimate-workflow-bot).
//
//   const scenario = await createStaffScenario({
//     ownerPage,
//     employeePage,
//     customer: true,
//     property: true,
//   });
//
// Design notes:
//  - Fixtures (customer/property) are always created through the OWNER
//    session, never the employee session — so cleanup ownership stays
//    unambiguous: only `scenario.ownerSession.finish()` needs to run at the
//    end of a test. The whole point of Phase 4 is that the EMPLOYEE creates
//    the estimate itself as the tested action, so estimate creation is left
//    to the bot's own test body, not bundled into this builder.
//  - `membership` is read via a guarded service-role client (the only way to
//    resolve the persistent staff account's auth user id -> its org_members
//    row) purely to confirm/report the role & status the scenario is running
//    under. It never grants anything beyond what the fixture SQL already
//    grants when the account was provisioned.
// ---------------------------------------------------------------------------

export interface StaffScenarioOptions {
  ownerPage: Page;
  employeePage: Page;
  /** Defaults to 'employee' — the persistent staff account's normal role. */
  employeeRole?: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer';
  /** Implied `true` whenever `property` or `estimate` is set. */
  customer?: boolean;
  property?: boolean;
  /** Created via the OWNER session — see note above on why. */
  estimate?: boolean;
}

export interface StaffMembership {
  userId: string;
  orgId: string;
  role: string;
  status: string;
}

export interface StaffScenario {
  ownerSession: TestSession;
  employeeSession: TestSession;
  employee: { email: string; name: string };
  membership: StaffMembership;
  customer?: CustomerFixture;
  property?: PropertyFixture;
  estimate?: EstimateFixture;
  warnings: string[];
}

export async function createStaffScenario(options: StaffScenarioOptions): Promise<StaffScenario> {
  const warnings: string[] = [];

  const ownerSession = createTestSession(options.ownerPage);
  const employeeSession = createTestSession(options.employeePage);

  await Promise.all([loginAsAdmin(ownerSession), loginAsStaff(employeeSession)]);

  const staffAccount = getStaffAccount();
  const staffName = getStaffName();

  const membership = await confirmStaffMembership(staffAccount.email, options.employeeRole ?? 'employee');

  const scenario: StaffScenario = {
    ownerSession,
    employeeSession,
    employee: { email: staffAccount.email, name: staffName },
    membership,
    warnings,
  };

  const needsCustomer = options.customer || options.property || options.estimate;
  if (!needsCustomer) return scenario;

  scenario.customer = await ownerSession.customer();

  if (options.property || options.estimate) {
    scenario.property = await ownerSession.property(scenario.customer);
  }

  if (options.estimate) {
    scenario.estimate = await ownerSession.estimate(scenario.customer, scenario.property);
  }

  return scenario;
}

/**
 * Resolves the persistent staff account's auth user id and confirms its
 * org_members row is active with the expected role, via a guarded
 * service-role client. Throws (rather than silently fixing it up) if the
 * account or its membership row is missing or mismatched — a broken
 * persistent fixture should fail loudly, not be silently repaired mid-test.
 */
async function confirmStaffMembership(
  email: string,
  expectedRole: string
): Promise<StaffMembership> {
  const client = createGuardedServiceClient();
  const lowerEmail = email.toLowerCase();

  let userId: string | undefined;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Staff account lookup failed: ${error.message}`);
    userId = data.users.find((u) => u.email?.toLowerCase() === lowerEmail)?.id;
    if (data.users.length < 200) break;
  }

  if (!userId) {
    throw new Error(
      `Persistent staff account "${email}" has no Supabase Auth user — provision it first ` +
        `(see tests/e2e/README.md "Persistent staff account").`
    );
  }

  const { data: memberRow, error: memberError } = await client
    .from('org_members')
    .select('org_id, role, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError) throw new Error(`Staff membership lookup failed: ${memberError.message}`);
  if (!memberRow) {
    throw new Error(
      `Persistent staff account "${email}" (${userId}) has no org_members row — provision it ` +
        `first (see tests/e2e/README.md "Persistent staff account").`
    );
  }
  if (memberRow.status !== 'active') {
    throw new Error(
      `Persistent staff account "${email}" is not active (status: ${memberRow.status}) — fix ` +
        `its org_members row before running staff scenario bots.`
    );
  }
  if (memberRow.role !== expectedRole) {
    throw new Error(
      `Persistent staff account "${email}" has role "${memberRow.role}", expected ` +
        `"${expectedRole}" — either fix its org_members row or pass employeeRole: '${memberRow.role}'.`
    );
  }

  return { userId, orgId: memberRow.org_id, role: memberRow.role, status: memberRow.status };
}
