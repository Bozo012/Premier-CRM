# Premier CRM — E2E Bot Suite

A repeatable Playwright-based QA system for Premier CRM. Run this after any
change to catch regressions before they reach real customer data.

This is **infrastructure, not a bug hunt**. This pass builds the reusable
harness — a small number of real smoke tests plus a scaffold of TODO/skipped
tests for everything else. The goal is a suite you can run over and over,
adding real coverage bot-by-bot over time.

## Bots

| File | Covers |
|---|---|
| `auth-bot.spec.ts` | App loads, login form renders, bad creds error, admin login |
| `customer-crud-bot.spec.ts` | **Active**: create, search, detail view, service-role cleanup. Edit is TODO (no edit UI exists) |
| `customer-command-center-bot.spec.ts` | **Active**: stats, contact, notes card, properties tile navigate-and-back. Jobs/invoices/estimates "filtered navigation", payments, notes-editing, and documents are TODO (don't exist in the app) |
| `operator-workflow-bot.spec.ts` | **Active**: one realistic owner workday — dashboard → find customer → open property → review history → create job/estimate/invoice → back to dashboard, verified. Recording a note and uploading a document are TODO (don't exist in the app) |
| `invoice-management-bot.spec.ts` | Invoices list auth-gating + reachability; create/pay/void/send are TODO |
| `mobile-simplicity-bot.spec.ts` | Phone/tablet viewport smoke checks on login; authenticated mobile checks are TODO |
| `permissions-bot.spec.ts` | Route-level auth gating (real); cross-account data isolation is TODO |
| `data-consistency-bot.spec.ts` | All TODO — invoice totals, revenue reconciliation, etc. |
| `future-automation-readiness-bot.spec.ts` | All TODO — AI briefings, SMS, automated reports (not built yet) |

`cleanup-safety.spec.ts` isn't a bot — it's a small set of unit-style checks
on `utils/cleanup.ts`'s safety guards (bad marker, non-local Supabase URL
without opt-in). No browser or real Supabase connection needed.

## Known CRM limitations (found while building this suite)

None of these are things this suite invented workarounds for — they're
documented as TODO in the relevant bot instead:

- **No edit or delete/archive UI for customers.** Verified: no
  `updateCustomer`/`archiveCustomer`/`deleteCustomer` anywhere in
  `packages/db` or `apps/web`; the detail page is entirely read-only.
- **No customer-scoped "filtered list" views.** `/jobs`, `/properties`,
  `/estimates`, and `/invoices` only support free-text search (`q`, plus
  `status` on `/jobs`) — none accept a `customerId` filter. The customer
  detail page's own "Recent jobs"/"Open quotes" lists aren't links either.
- **No Estimates, Payments, Notes-editing, or Documents surface on the
  customer detail page.** Estimates and invoices don't have a customer-level
  view at all; notes are read-only display of `customer.notes`; there's no
  documents/photo-upload feature anywhere in the app yet.
- **Estimate → job conversion requires the customer portal.** The real path
  is estimate → quote (staff-side, automatable) → quote sent and **accepted
  by the customer via their magic-link portal** → job created from the
  accepted quote. This suite automates the first step only — see the
  scenario builder's `convertEstimateToJob` option above.
- **Invoices can't be created standalone.** There's no `/invoices/new` page —
  every invoice comes from picking an existing job in a dialog on `/invoices`.
- **A fresh invoice has no payable balance.** `total: 0` until at least one
  line item is added — `record-payment-form.tsx` shows "no remaining
  balance" instead of its fields until then (see `context/invoice.ts`'s
  `addInvoiceLineItem`/`payInvoiceInFull`).

## Install

From the repo root (pnpm workspace):

```bash
pnpm add -D -w @playwright/test
pnpm exec playwright install --with-deps chromium webkit
```

`--with-deps` installs the OS-level browser dependencies too. If you're on a
machine that already has them (or want to skip the OS deps), you can drop
that flag. Both browsers are required: `chromium` runs most bots, but the
`mobile` project (`mobile-simplicity-bot.spec.ts`) uses `devices['iPhone 13']`,
which defaults to WebKit.

## Configure

```bash
cp .env.test.example .env.test
```

Fill in `.env.test` with **local/dev/test credentials only**:

```
BASE_URL=http://localhost:3000
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
TEST_CUSTOMER_EMAIL=
TEST_CUSTOMER_PASSWORD=
TEST_CUSTOMER_2_EMAIL=
TEST_CUSTOMER_2_PASSWORD=

# Optional — enables customer-crud-bot's cleanup step (see below)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=
```

Tests that need credentials `test.skip()` themselves with a clear reason if a
variable is missing, rather than failing — so the suite is runnable
immediately after install, before you've wired up test accounts.

### Data safety

- **Never point `BASE_URL` at production.** This suite creates (and, for
  customers, can clean up) records. It's built for local/dev/test data only.
- Use a dedicated dev Supabase project or seeded local instance, not Premier's
  live production data.
- Every record this suite creates is prefixed `E2E_TEST_` (see
  `tests/e2e/utils/test-data.ts`) so it's always identifiable and safe to bulk
  delete.
- `TEST_ADMIN_*` should be a real login against whatever Supabase project
  `BASE_URL` points to — for local dev that means a seeded dev account, not
  Kevin's real Premier owner credentials.
- **Never use a production service-role key.** `SUPABASE_SERVICE_ROLE_KEY` is
  optional and only used by `customer-crud-bot`'s cleanup step (see below) —
  get it from the same place `apps/web/.env.local` does, for the same project
  `BASE_URL` points to.

### Customer CRUD cleanup (service-role, optional)

`customer-crud-bot` creates a real customer through `/customers/new` and, if
configured, deletes it afterward using a service-role Supabase client
(`tests/e2e/utils/cleanup.ts`'s `cleanupTestCustomerByMarker`) — Premier CRM
has no delete/archive UI for customers yet, so there's no UI-driven way to do
this instead. `context/session.ts`'s `session.finish()` uses this exact same
guarded function under the hood for every bot built on the shared context
(customer-command-center-bot, operator-workflow-bot, and any future ones) —
it's the one cleanup mechanism the whole suite shares, not something specific
to customer-crud-bot.

This bypasses RLS, so it's guarded tightly:

- **Refuses to run for anything not tagged `E2E_TEST_`.** Only rows whose
  `display_name` or `email` starts with the exact marker/email this test run
  generated are ever touched — never a broad or date-based delete.
- **Refuses to run against a non-local Supabase URL by default.** Premier CRM
  doesn't currently have a confirmed separate dev/staging Supabase project, so
  a hosted URL is treated as "assume this is production" unless you explicitly
  set `E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true` — only do this if you're certain
  the project `NEXT_PUBLIC_SUPABASE_URL` points to doesn't hold real customer
  data you care about.
- **Cleans up dependent rows first** (jobs, invoices, payments, estimates,
  service requests, communications, vault items, tasks, AI prompts — see the
  doc comment on `deleteDependentRecords` in `utils/cleanup.ts` for exactly
  which tables and why), then the customer row last.

If `SUPABASE_SERVICE_ROLE_KEY` (or the Supabase URL) isn't set, the CRUD tests
still run — they just leave the `E2E_TEST_`-prefixed customer in place, and
the cleanup test itself passes with a console warning rather than failing (see
"Manually removing leftover E2E records" below).

#### Manually removing leftover E2E records

If cleanup was skipped or a run crashed mid-test, leftover test customers are
always identifiable: their `display_name` starts with `E2E_TEST_CUSTOMER_CRUD_`
and their `email` starts with `e2e.customer.crud.`. In the Supabase dashboard's
SQL editor (or `psql`), for the project your `.env.test` points to:

```sql
select id, display_name, email, created_at
from customers
where display_name like 'E2E_TEST_CUSTOMER_CRUD_%'
   or email like 'e2e.customer.crud.%';
```

Review the list, then delete by exact id (never a bulk `like`-based delete
outside of a reviewed, scoped query like this one) — same dependent-row order
as `utils/cleanup.ts` if any of those customers have jobs/invoices/etc.
attached.

## Run the app locally

The suite does **not** start the dev server for you — this keeps you in
control of which environment you're pointing at.

```bash
pnpm dev
```

Leave that running in one terminal, then run bots in another.

## Run all bots

```bash
pnpm test:e2e
```

## Run one bot

```bash
pnpm test:e2e:auth
pnpm test:e2e:customers
pnpm test:e2e:invoices
pnpm test:e2e:mobile
pnpm test:e2e:permissions
pnpm test:e2e:data
pnpm test:e2e:future
pnpm test:e2e:operator
```

Or run the full suite including anything skipped/TODO (skipped tests still
show up as "skipped" in output, they just don't fail):

```bash
pnpm test:e2e:full
```

## View the report

```bash
pnpm test:e2e:report
```

Opens the last HTML report (`playwright-report/`) in your browser. Failed
tests include a screenshot; retried failures include a trace you can step
through with `pnpm exec playwright show-trace <path>`. Failed tests also
retain video (`test-results/`).

## Shared Test Context (Phase 2)

`tests/e2e/context/` is a reusable fixture layer so new bots don't each
reimplement customer/property/estimate/job/invoice creation. Every fixture
method **creates on first call and reuses on later calls within the same
session** — "shared" here means shared for the lifetime of one `TestSession`
instance (typically one spec file's `test.describe.serial(...)` block), not a
cross-file or cross-worker singleton — see `session.ts`'s doc comment for why
(Playwright runs spec files in parallel worker processes; a true "once per
whole run" session would need `storageState` + a `globalSetup` script, which
is a reasonable next step once enough bots exist to justify it, not built
prematurely here).

```
tests/e2e/context/
  session.ts      TestSession class + createTestSession(page) — the lifecycle
  auth.ts         loginAsAdmin(session), loginAsCustomer(session)
  customer.ts     createTestCustomer(page) → CustomerFixture
  property.ts     createTestProperty(page, customer) → PropertyFixture
  estimate.ts     createTestEstimate(page, customer, property?) → EstimateFixture
  job.ts          createTestJob(page, customer, property?) → JobFixture
  invoice.ts      createTestInvoice(page, job) → InvoiceFixture
                  addInvoiceLineItem, payInvoiceInFull
  scenario.ts     createScenario(session, options) → Scenario
  navigation.ts   gotoDashboard/gotoCustomers/gotoCustomer/gotoProperties/
                  gotoJobs/gotoEstimates/gotoInvoices — each waits for a
                  stable, distinctive element before returning
```

### Session lifecycle

```
Initialize → Login → Shared fixtures → Bot execution → Cleanup
```

```ts
import { createTestSession } from './context/session';
import { loginAsAdmin } from './context/auth';

test('some workflow', async ({ page }) => {
  const session = createTestSession(page);   // Initialize

  await loginAsAdmin(session);               // Login

  const customer = await session.customer(); // Shared fixtures — created
  const customer2 = await session.customer();// once; this just returns the same one
  const property = await session.property(customer);

  // ... bot execution: drive the UI, assert things ...

  await session.finish();                    // Cleanup + prints metrics
});
```

`session.finish()` flushes `session.cleanup` (dependency-ordered, marker-
guarded — see "Customer CRUD cleanup" above, which the session reuses under
the hood) and prints the metrics report (see "Performance metrics" below).
Cleanup failures never fail the test they run after; they log a warning.

### Scenario builder

For a bot that needs a known business state rather than individual pieces:

```ts
import { createScenario } from './context/scenario';

const scenario = await createScenario(session, {
  property: true,
  estimate: true,
  invoice: true,
  paid: true, // adds a line item and records a full payment
});

scenario.customer   // always created if anything else is requested
scenario.property
scenario.estimate
scenario.job        // only if job: true or invoice: true was requested
scenario.invoice
scenario.warnings   // non-fatal notes — e.g. convertEstimateToJob's real limit
```

`convertEstimateToJob: true` is intentionally partial: it creates a real
draft quote from the estimate (a genuine staff-side action), but stops there
— accepting a quote and turning it into a job requires the customer portal's
magic-link flow, which this suite doesn't drive yet. Requesting it adds a
warning to `scenario.warnings` rather than faking a job that was never
actually converted. Extend `scenario.ts` by adding one boolean option and one
`if` block; the real work lives in `session.ts`'s fixture methods.

### Navigation helpers

```ts
import { gotoCustomer, gotoDashboard } from './context/navigation';

await gotoDashboard(page);           // waits for "Operational snapshot" heading
await gotoCustomer(page, customer);  // waits for the customer's marker heading
```

Each helper waits for a real, distinctive element specific to that page
before returning — not a fixed timeout or `networkidle` — so callers never
race the page's own data fetch.

### Performance metrics

`session.metrics` (a `MetricsCollector`, `tests/e2e/utils/metrics.ts`) times
whatever you wrap in `.measure(label, fn)` and never fails a test over
timing — it's for long-term regression detection ("login used to take 1s,
now it takes 4s"), not a pass/fail gate:

```ts
const customer = await session.metrics.measure('Create Customer', () =>
  session.customer()
);
```

`session.finish()` prints a report automatically; call `session.metrics.print()`
directly for a mid-test snapshot. Output looks like:

```
Login................1.1s
Create Customer......2.3s
Open Customer........0.5s
Cleanup..............0.3s
```

### Customer Command Center bot

`customer-command-center-bot.spec.ts` covers the customer detail page. Real,
active coverage: the 4 stat cards, Contact card, Account notes card, and the
Properties tile (create → click through to the property's own detail page →
back). Everything else the original brief for this bot asked about turned out
not to exist when checked against the actual page
(`apps/web/app/(app)/customers/[customerId]/page.tsx`) — documented as TODO
rather than invented:

- "Recent jobs" and "Open quotes" list items are plain text, not links
  (`ListCard`'s `item.href` is never set for either) — there's no "navigate to
  filtered jobs/quotes for this customer" flow to test, and neither `/jobs`
  nor `/quotes` accepts a customer-scoping query param.
- No "Estimates" tile/section exists on this page at all.
- No "Invoices" tile/list exists — "Outstanding invoices" is a bare stat
  number, not a link.
- No Payments section exists anywhere on this page (payments are only
  recordable per-invoice — see `context/invoice.ts`'s `payInvoiceInFull`).
- "Account notes" is read-only — no add/edit-note UI exists anywhere.
- No Documents section or upload UI exists anywhere in the app.

### Operator Workflow bot

`operator-workflow-bot.spec.ts` simulates a realistic owner workday — one
cohesive script (not exhaustive per-feature coverage) using the scenario
builder and navigation helpers: dashboard → find a customer (real search) →
open them → open their property → review job history → create a job,
estimate, and invoice → back to the dashboard → verify the dashboard's Jobs
count actually moved. Recording a note and uploading a document/photo are
both TODO — see "Customer Command Center bot" above for why (no such UI
exists in the app yet).

## Add new tests

1. Pick the bot file that matches the feature area (or add a new bot file +
   package script if it's a genuinely new area — follow the existing naming
   pattern: `<area>-bot.spec.ts`).
2. **Reach for the shared context first** (see above) — `createTestSession`,
   `loginAsAdmin`/`loginAsCustomer`, `session.customer()`/`.property()`/
   `.estimate()`/`.job()`/`.invoice()`, `createScenario`, and the `goto*`
   navigation helpers cover most of what a new bot needs to set up before it
   can start actually testing something. Only fall back to driving a create
   flow by hand (like `context/customer.ts` does internally) if the shared
   context doesn't cover it yet — then consider adding it there for the next
   bot.
3. Use the other shared utils rather than re-inventing them:
   - `utils/auth.ts` — the underlying `loginAsAdmin(page)`, `hasAdminCredentials()`,
     etc. that `context/auth.ts` wraps.
   - `utils/selectors.ts` — route paths and locators. Add new ones here
     rather than inlining CSS selectors in a spec.
   - `utils/test-data.ts` — generates `E2E_TEST_`-prefixed markers/emails so
     data is always identifiable.
   - `utils/mobile.ts` — shared viewport profiles for mobile checks.
   - `utils/metrics.ts` — the `MetricsCollector` behind `session.metrics`.
   - `utils/cleanup.ts` — `CleanupRegistry` for UI-driven teardown (scaffolded,
     not wired up yet — no bot has a delete UI to drive), plus
     `cleanupTestCustomerByMarker` for tightly-guarded service-role cleanup,
     used by both `customer-crud-bot` directly and `context/session.ts`
     under the hood (see "Customer CRUD cleanup" above).
4. Un-skip a `test.skip(...)` TODO by implementing its body, or add a new
   test — either is fine. Keep tests independent where the feature allows it:
   don't rely on execution order or state left behind by a previous test. The
   one deliberate exception is a flow where steps are inherently sequential
   (create → search → detail → cleanup) — see `customer-crud-bot.spec.ts`'s
   and `customer-command-center-bot.spec.ts`'s `test.describe.serial(...)`
   blocks, which document that ordering explicitly rather than faking
   independence.
5. Run just that bot (`pnpm test:e2e:<area>`) while iterating; run the full
   suite before considering the work done.

## What's currently skipped / TODO

Every `test.skip(...)` in this suite is a deliberate placeholder, not a
disabled/broken test. They exist so the suite already has a named home for
coverage that doesn't exist yet. See the table above for which bot owns which
skipped area, and the `// TODO:` comment above each skipped test for what
implementing it will require (usually: a known/seeded test fixture, or a
product decision on where a feature surfaces in the UI).

## How to use this as a repeatable QC system

- **After any change**, run `pnpm test:e2e` (or at minimum
  `pnpm test:e2e:auth` — if login is broken, nothing else matters) before
  considering the change done.
- **Before a deploy**, run `pnpm test:e2e:full` and check the HTML report.
- **When a bot catches a real regression**, that's the suite doing its job —
  fix the app, don't loosen the test, unless the test's assumption was
  genuinely wrong (e.g. copy changed intentionally).
- **When you finish a feature**, un-skip the corresponding TODO test(s) in
  the relevant bot rather than writing a one-off script — this keeps
  regression coverage compounding over time instead of resetting every phase.
- **Treat bot failures as the first signal**, not the only one — this suite
  covers UI-level flows; it doesn't replace `pnpm test` (Vitest unit tests)
  or manual review of anything pricing/financial/AI-related.
