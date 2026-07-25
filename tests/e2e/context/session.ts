/**
 * Shared test session (Phase 2 shared context) — the reusable fixture layer
 * every bot can consume instead of re-implementing customer/property/
 * estimate/job/invoice creation.
 *
 * Lifecycle: Initialize (`createTestSession(page)`) → Login (context/auth.ts)
 * → shared fixtures (`session.customer()`, `session.property()`, ...) → bot
 * execution → cleanup (`session.finish()`).
 *
 * "Shared" here means shared for the lifetime of one `TestSession` instance
 * — typically one spec file's `test.describe.serial(...)` block (see
 * customer-command-center-bot.spec.ts and operator-workflow-bot.spec.ts for
 * the pattern). It is NOT a cross-worker or cross-file singleton: Playwright
 * runs test files in parallel worker processes, so a true "once per whole
 * run" session would need `storageState` + a `globalSetup` script writing
 * shared fixture ids to disk for every worker to read. That's a reasonable
 * next step once enough bots exist to justify it — documented here rather
 * than built prematurely (see tests/e2e/README.md "Shared Test Context").
 *
 * Each fixture method creates on first call and returns the cached result on
 * every later call in the same session — "create if missing, reuse if
 * already created" — and registers its own teardown with `session.cleanup`.
 */

import type { Page } from '@playwright/test';

import { MetricsCollector } from '../utils/metrics';
import { CleanupRegistry, cleanupTestCustomerByMarker } from '../utils/cleanup';
import { createTestCustomer, type CustomerFixture } from './customer';
import { createTestProperty, type PropertyFixture } from './property';
import { createTestEstimate, type EstimateFixture } from './estimate';
import { createTestJob, type JobFixture } from './job';
import { createTestInvoice, type InvoiceFixture } from './invoice';

export class TestSession {
  readonly page: Page;
  readonly metrics = new MetricsCollector();
  readonly cleanup = new CleanupRegistry();

  isAdminLoggedIn = false;
  isCustomerLoggedIn = false;

  private customerFixture?: CustomerFixture;
  private propertyFixture?: PropertyFixture;
  private estimateFixture?: EstimateFixture;
  private jobFixture?: JobFixture;
  private invoiceFixture?: InvoiceFixture;

  constructor(page: Page) {
    this.page = page;
  }

  /** Creates a test customer once per session, reusing it on later calls. */
  async customer(): Promise<CustomerFixture> {
    if (this.customerFixture) return this.customerFixture;

    const customer = await this.metrics.measure('Create Customer', () =>
      createTestCustomer(this.page)
    );
    this.customerFixture = customer;

    this.cleanup.register({
      description: `customer ${customer.marker} (and its dependent records)`,
      run: async () => {
        const result = await cleanupTestCustomerByMarker({
          marker: customer.marker,
          email: customer.email,
        });
        if (!result.ranCleanup) {
          console.warn(`[session cleanup] ${result.message}`);
        }
      },
    });

    return customer;
  }

  /** Creates a test property for `customer` (or the session's own customer) once per session. */
  async property(customer?: CustomerFixture): Promise<PropertyFixture> {
    if (this.propertyFixture) return this.propertyFixture;

    const owner = customer ?? (await this.customer());
    const property = await this.metrics.measure('Create Property', () =>
      createTestProperty(this.page, owner)
    );
    this.propertyFixture = property;

    // No separate cleanup task: cleanupTestCustomerByMarker's property sweep
    // (utils/cleanup.ts's deleteE2ETestProperties) already removes any
    // E2E_TEST_-tagged property linked to this customer when the customer
    // cleanup task above runs.
    return property;
  }

  /** Creates a test estimate once per session, reusing the session's customer/property unless given different ones. */
  async estimate(customer?: CustomerFixture, property?: PropertyFixture): Promise<EstimateFixture> {
    if (this.estimateFixture) return this.estimateFixture;

    const owner = customer ?? (await this.customer());
    const forProperty = property ?? this.propertyFixture;
    const estimate = await this.metrics.measure('Create Estimate', () =>
      createTestEstimate(this.page, owner, forProperty)
    );
    this.estimateFixture = estimate;
    return estimate;
  }

  /** Creates a standalone test job once per session, reusing the session's customer/property unless given different ones. */
  async job(customer?: CustomerFixture, property?: PropertyFixture): Promise<JobFixture> {
    if (this.jobFixture) return this.jobFixture;

    const owner = customer ?? (await this.customer());
    const forProperty = property ?? this.propertyFixture;
    const job = await this.metrics.measure('Create Job', () =>
      createTestJob(this.page, owner, forProperty)
    );
    this.jobFixture = job;
    return job;
  }

  /** Creates a test invoice from `job` (or the session's own job) once per session. */
  async invoice(job?: JobFixture): Promise<InvoiceFixture> {
    if (this.invoiceFixture) return this.invoiceFixture;

    const forJob = job ?? (await this.job());
    const invoice = await this.metrics.measure('Create Invoice', () =>
      createTestInvoice(this.page, forJob)
    );
    this.invoiceFixture = invoice;
    return invoice;
  }

  /** Flushes cleanup (dependency-ordered, marker-guarded) and prints the metrics report. */
  async finish(): Promise<void> {
    await this.metrics.measure('Cleanup', () => this.cleanup.flush());
    this.metrics.print('Performance metrics');
  }
}

/** Initialize step of the session lifecycle — see the class doc comment above. */
export function createTestSession(page: Page): TestSession {
  return new TestSession(page);
}
