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
| `customer-command-center-bot.spec.ts` | Customer detail page scaffold; full coverage is TODO |
| `invoice-management-bot.spec.ts` | Invoices list auth-gating + reachability; create/pay/void/send are TODO |
| `mobile-simplicity-bot.spec.ts` | Phone/tablet viewport smoke checks on login; authenticated mobile checks are TODO |
| `permissions-bot.spec.ts` | Route-level auth gating (real); cross-account data isolation is TODO |
| `data-consistency-bot.spec.ts` | All TODO — invoice totals, revenue reconciliation, etc. |
| `future-automation-readiness-bot.spec.ts` | All TODO — AI briefings, SMS, automated reports (not built yet) |

`cleanup-safety.spec.ts` isn't a bot — it's a small set of unit-style checks
on `utils/cleanup.ts`'s safety guards (bad marker, non-local Supabase URL
without opt-in). No browser or real Supabase connection needed.

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
this instead.

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

## Add new tests

1. Pick the bot file that matches the feature area (or add a new bot file +
   package script if it's a genuinely new area — follow the existing naming
   pattern: `<area>-bot.spec.ts`).
2. Use the shared utils rather than re-inventing them:
   - `utils/auth.ts` — `loginAsAdmin(page)`, `hasAdminCredentials()`, etc.
   - `utils/selectors.ts` — route paths and locators. Add new ones here
     rather than inlining CSS selectors in a spec.
   - `utils/test-data.ts` — generates `E2E_TEST_`-prefixed names/emails so
     data is always identifiable.
   - `utils/mobile.ts` — shared viewport profiles for mobile checks.
   - `utils/cleanup.ts` — `CleanupRegistry` for UI-driven teardown (scaffolded,
     not wired up yet — no bot has a delete UI to drive), plus
     `cleanupTestCustomerByMarker` for tightly-guarded service-role cleanup,
     used by `customer-crud-bot` (see "Customer CRUD cleanup" above).
3. Un-skip a `test.skip(...)` TODO by implementing its body, or add a new
   test — either is fine. Keep tests independent where the feature allows it:
   don't rely on execution order or state left behind by a previous test. The
   one deliberate exception is a CRUD flow where steps are inherently
   sequential (create → search → detail → cleanup) — see
   `customer-crud-bot.spec.ts`'s `test.describe.serial(...)` block, which
   documents that ordering explicitly rather than faking independence.
4. Run just that bot (`pnpm test:e2e:<area>`) while iterating; run the full
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
