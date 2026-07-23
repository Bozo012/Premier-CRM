# Implementation Status — Invoice/Payment MVP

Working memory for this session. Re-read this instead of re-deriving context. Last updated 2026-07-22.

## How this doc came to be

`docs/BRANCH-RECONCILIATION.md` (expected per the task brief) does not exist in the repo. `docs/HANDOFF-current.md` exists but is stale — it describes state as of commit `307f7af` with PRs #68/#69-A "local, uncommitted," while `main` has actually progressed well past that (through `960b91f`, workflow hardening #69-E, job-detail source-estimate display, etc.). Several remote feature branches show as "unmerged" by `git merge-base` but their content matches commits already on `main` under different hashes — the signature of squash-merged PRs. Conclusion: the branch reconciliation work almost certainly happened, but its write-up was never saved. Rather than guess, ground truth below was established directly from code, migrations, and the linked Supabase project (`premier-crm-prod`, id `apnbpcauqrjvkoleisde`, Postgres 17).

## Requests / Estimates / Quotes / Jobs — audit verdict: SOLID

All four are substantially implemented with real server-side idempotency guards, not just disabled buttons:

- **Requests** (`apps/web/app/(app)/requests/`): intake, list, detail, mark-reviewed all wired to real `service_requests` data. `createEstimateFromRequestAction` checks `request.estimate_id` up front and rejects a second conversion — idempotent by construction.
- **Estimates** (`apps/web/app/(app)/estimates/`): list/detail/manual-creation real. Status enum `draft → site_visit_scheduled → site_visit_complete → quoted → accepted/declined/expired → converted` (migration `20260511123231_estimates.sql`) matches the locked decisions. `updateEstimateStatusAction` enforces an explicit allowed-transitions map. `createQuoteFromEstimateAction` blocks quoting terminal-status estimates.
- **Quotes** (`apps/web/app/(app)/quotes/`, public view at `apps/web/app/q/[token]/`): builder, line items, send flow (draft→sent, `sent_at` stamp, best-effort email), public accept/decline with race-safe `viewed_at` stamping, all real. **`createJobFromAcceptedQuoteAction`** (in `estimates/actions.ts`) is the accept→job handoff: manual button, doubly idempotent (`quote.job_id IS NOT NULL` guard + `estimate.converted_job_id IS NOT NULL` guard). Schema backs it with `quotes_has_job_or_estimate` CHECK and nullable `job_id`.
- **Jobs** (`apps/web/app/(app)/jobs/`): list/detail real, source estimate shown on job detail (`960b91f`). Job detail has three explicitly-labeled `FutureSectionCard` placeholders — Invoices, Time entries, Captures — with honest "will live here" copy. This is Phase 1's actual target, correctly flagged in the UI itself already.

No disconnected buttons, no silent no-ops, no hardcoded fake data found anywhere in this workflow.

## Customer portal (`apps/web/app/portal/`) — audit verdict: SOLID, RLS genuinely enforced

- Real Supabase Auth signup/signin (`portal/actions.ts`: `supabase.auth.signUp` / `signInWithPassword`).
- `ensureCustomerAccount` does real match-or-create: looks up `customers` by `(org_id, email)`, creates if absent, upserts `customer_accounts` on `auth_user_id` conflict. Runs via service-role client (appropriate — this happens before the user has a resolvable RLS identity).
- Dashboard (`portal/dashboard/page.tsx`) reads real `service_requests`/`customer_properties`, scoped by `customer_id`, via `getServerSupabase()` — **the session-bound, RLS-enforced client, not service-role**. The app-level `.eq('customer_id', ...)` filter is a second line of defense, not the only one.
- RLS policies confirmed directly from `supabase/migrations/0012_service_requests_and_customer_accounts.sql`: `customer_select_own_account`, `customer_select_own_service_requests`, `customer_select_own_customer_properties` all gate through `customer_accounts.auth_user_id = auth.uid()` with `status = 'active'`. Internal staff policies (`user_is_in_org`) are separate and don't leak to portal users (portal users have no `org_members` row). An insert policy also constrains self-service request creation to safe defaults.
- **Verdict: the customer_id boundary is enforced at the database level, not just app-level filtering.** No gap to close. This is recorded here for the planned follow-on website-repo session to reuse as ground truth.

## Invoice/Payment — audit verdict: schema built, zero application code

### What already exists in `premier-crm-prod` (fully built, no migration needed for these)

- Tables `invoices`, `invoice_line_items`, `payments` exist with RLS enabled and an `org_isolation` policy (`user_is_in_org(org_id)`) consistent with the rest of the schema.
- `invoices.amount_due` is a **Postgres GENERATED ALWAYS column** (`total - amount_paid`) — the "never write it directly" rule is already enforced at the database level, can't be bypassed by app code.
- Enums already match spec exactly: `invoice_status` (draft/sent/viewed/partially_paid/paid/overdue/void/refunded), `invoice_kind` (deposit/progress/final/standalone), `payment_method` (card/ach/check/cash/venmo/other).
- FKs already correct: `invoices.job_id` NOT NULL, `invoices.quote_id` nullable (matches locked decisions).
- Indexes already solid: `invoices_org_id_status_idx`, `invoices_job_id_idx`, `invoices_due_date_idx` (partial, excludes paid/void — ready for overdue-at-read-time computation), `invoices_share_token_idx`, `payments_invoice_id_idx`, `payments_org_id_paid_at_idx`, `invoice_line_items_invoice_id_idx`.
- All three tables have **zero rows** in production — low-risk moment for any remaining schema work.

### Confirmed gaps (schema)

1. **No payment atomicity.** Zero triggers exist on `payments`, and only a bare `updated_at` trigger on `invoices`. Nothing recalculates `amount_paid`, flips status to `partially_paid`/`paid`, blocks overpayment, or blocks payment against a void invoice. This is the real, load-bearing gap.
2. **No invoice numbering.** `invoice_number` is a plain nullable text column with no default/sequence — nothing generates it. (Side note: `quote_number`/`job_number` were *never* actually implemented either — grepped the whole query layer, confirmed neither is ever written on create. `estimate_number` is the one that got done right: dedicated sequence + `next_estimate_number()` SQL function + `NOT NULL DEFAULT` + unique constraint, migration `20260511123231_estimates.sql`. Following the estimate pattern for invoices, not the quote/job non-pattern.)
3. **`invoices.share_token` has an index but no UNIQUE constraint.** Should be enforced, not just indexed, since it's a public-access token.
4. **FK delete behavior violates `CONVENTIONS.md`'s own "always specify ON DELETE explicitly" rule** for `invoices.job_id`, `invoices.quote_id`, `payments.invoice_id` (all default to `NO ACTION`). Also, `quotes.job_id` is `ON DELETE CASCADE` — the exact risk flagged (but never fixed) in the stale `HANDOFF-current.md`: deleting a job would delete its quote history, when quote history should survive job deletion.
   - Fix scope for this pass: `invoices.job_id` → `RESTRICT` (financial record, must not vanish silently), `invoices.quote_id` → `SET NULL` (optional reference), `payments.invoice_id` → `RESTRICT` (payment history is immutable evidence), `quotes.job_id` → `SET NULL` (preserve quote history).
   - **Out of scope, flagged not fixed:** `jobs.customer_id` and `jobs.property_id` also lack explicit `ON DELETE` (default `NO ACTION`). Pre-existing from `0002_crm_core.sql`, unrelated to invoicing specifically — noted here for a future hardening pass rather than bundled into this migration.

### Confirmed gaps (application code) — everything below is currently missing entirely

- `packages/db/queries/invoices.ts` — does not exist.
- `apps/web/app/(app)/invoices/` routes — do not exist (no list, no detail/edit).
- `apps/web/app/(app)/invoices/actions.ts` — does not exist.
- `apps/web/app/i/[token]/` public view — does not exist.
- `packages/shared/schemas/invoice.ts` (or similar Zod schemas) — does not exist.
- Job detail page invoices section — currently a literal `FutureSectionCard` placeholder.
- Stripe integration — zero code anywhere (only generated column typings for `stripe_payment_intent_id` etc.). Not needed for MVP per locked decisions (manual payments first).
- `apps/web/app/api/webhooks/` directory doesn't exist at all yet (fine — not needed until Stripe).

### Reference pattern to replicate: the `quotes` module

- `packages/db/queries/quotes.ts` — `listQuotesForJob`, `listQuotes`, `getQuoteById`, `getQuoteByToken`, `createDraftQuote`, `updateQuoteMetadata`, `addQuoteLineItem`, `updateQuoteLineItem`, `removeQuoteLineItem`.
- `apps/web/app/(app)/quotes/actions.ts` — metadata update, send (status transition + timestamp + best-effort email), resend, line-item CRUD actions.
- Public view is a **top-level route**, `apps/web/app/q/[token]/` (not inside a `(public)` route group despite what `CLAUDE.md`'s route table implies) — uses the **service-role client** to bypass RLS/auth, UUID-format-guards the token before querying (404 on malformed), does a race-safe conditional first-view stamp (`.eq('status','sent').is('viewed_at', null)`).
- `packages/shared/schemas/quote.ts` — Zod schemas for every action's input.

Invoices will mirror this exactly: `packages/db/queries/invoices.ts`, `apps/web/app/(app)/invoices/{page.tsx,actions.ts,[invoiceId]/page.tsx}`, `apps/web/app/i/[token]/page.tsx` (service-role client, same UUID guard + race-safe view stamping), `packages/shared/schemas/invoice.ts`.

## Validation baseline (pre-existing, recorded before any changes)

- `pnpm install` — clean.
- `pnpm typecheck` — **clean, 0 errors**, across all 5 packages.
- `pnpm build` — **clean**, compiles successfully, 24 routes generated. No `/invoices` or `/i/[token]` routes exist yet (expected).
- `pnpm lint` — **fails, but pre-existing and unrelated to invoices.** 333 errors, all in: generated PWA files (`apps/web/public/sw.js`, `workbox-*.js` — being linted as source when they should be ignored), `scripts/*.mjs` (missing Node globals — `no-undef` on `console`/`process`, an ESLint env config gap), and one trivial `import type` issue in `packages/shared/result.ts`. Plus pre-existing `any`-type warnings in `packages/automation/engine.ts` and one unused-var warning in `quotes/_components/line-item-editor.tsx`. None of this is caused by or blocks invoice work — documenting per instructions rather than silently fixing.

## Migration plan (Phase 1-A) — awaiting approval before applying to `premier-crm-prod`

One migration, `supabase/migrations/<timestamp>_invoice_foundation.sql`, covering:
1. `invoice_number_seq` + `next_invoice_number()` (format `INV-000001`, matching the estimate pattern) as the column default, `NOT NULL`, unique constraint.
2. `invoices.share_token` unique constraint.
3. FK delete-behavior fixes: `invoices.job_id` → RESTRICT, `invoices.quote_id` → SET NULL, `payments.invoice_id` → RESTRICT, `quotes.job_id` CASCADE → SET NULL.
4. `apply_payment_to_invoice()` trigger function (AFTER INSERT on `payments`): locks the invoice row, rejects payment against a `void` invoice, rejects non-positive amounts, rejects amounts that would exceed the invoice total (overpayment), then updates `amount_paid` and flips `status` to `partially_paid`/`paid` (stamping `paid_at` when fully paid) — all inside the same transaction as the insert, so it can't race.

See the actual SQL presented separately for review — **not applied yet, per the hard override on migration approval.**

## Checklist

- [x] Read all required docs
- [x] Establish Requests/Estimates/Quotes/Jobs ground truth (replaces missing reconciliation doc)
- [x] Audit customer portal RLS
- [x] Inspect Supabase schema, migrations, RLS, triggers, indexes, row counts
- [x] Audit existing invoice-adjacent code (none found) and the quotes reference pattern
- [x] Run pnpm install/typecheck/lint/build baseline
- [ ] Get migration approved and applied
- [ ] Regenerate types, run advisors
- [ ] Query layer (`packages/db/queries/invoices.ts`)
- [ ] Server actions (`invoices/actions.ts`)
- [ ] Invoice list page
- [ ] Invoice creation (from job / from quote)
- [ ] Invoice detail/edit page
- [ ] Job detail integration (replace placeholder)
- [ ] Payment recording UI
- [ ] Public invoice view + send action
- [ ] Tests
- [ ] Phase 2 (Customers/Properties/Requests/Estimates/Quotes/Jobs/Nav audit)
- [ ] Phase 3 (UX/reliability/security/performance pass)
