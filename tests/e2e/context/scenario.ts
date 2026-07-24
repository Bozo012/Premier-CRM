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

import type { CustomerFixture } from './customer';
import type { PropertyFixture } from './property';
import type { EstimateFixture } from './estimate';
import type { JobFixture } from './job';
import type { InvoiceFixture } from './invoice';
import { addInvoiceLineItem, payInvoiceInFull } from './invoice';
import type { TestSession } from './session';

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
