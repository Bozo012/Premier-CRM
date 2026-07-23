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

## Migrations (Phase 1-A) — APPLIED to `premier-crm-prod` with explicit user approval

1. `supabase/migrations/20260722000000_invoice_foundation.sql` — invoice numbering (`invoice_number_seq` + `next_invoice_number()`, format `INV-000001`, matching the estimate pattern), `invoices.share_token` unique constraint, FK delete-behavior fixes (`invoices.job_id` → RESTRICT, `invoices.quote_id` → SET NULL, `payments.invoice_id` → RESTRICT, `quotes.job_id` CASCADE → SET NULL), and the `apply_payment_to_invoice()` AFTER INSERT trigger (row lock, rejects void-invoice/non-positive/overpayment, updates `amount_paid`, flips status to `partially_paid`/`paid`, stamps `paid_at`).
2. `supabase/migrations/20260722000001_invoice_fk_indexes.sql` — covering indexes for `invoices.quote_id` and `invoice_line_items.quote_line_id` (performance advisor findings).
3. `supabase/migrations/20260722000002_service_role_grants.sql` — **fixes a pre-existing production defect found during the dev smoke test:** `service_role` had table grants on only the handful of tables earlier migrations granted explicitly (0012/0017 pattern); `quotes`, `quote_line_items`, `invoices`, `invoice_line_items`, `payments`, `org_members`, `vault_items` and ~25 others had NONE, so every server action using the service-role client (the whole quote send/accept flow included) failed at runtime with `permission denied` (42501). Migration grants ALL on postgres-owned public tables + sequences to `service_role` and sets default privileges so future tables don't regress. Skips extension-owned `spatial_ref_sys`. Verified after apply: 50/51 tables granted; service client reads `invoices`/`quotes`/`payments` cleanly; `/i/[unknown-token]` now 404s instead of erroring.

Types regenerated (`pnpm db:types`) after the first two.

## Dev smoke test (2026-07-22)

- `apps/web/.env.local` did not exist — the repo-root `.env.local` (URL + service key) is not read by Next.js from a monorepo root. Created `apps/web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fetched from the project), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. Gitignored; local dev now works.
- Route checks: `/invoices`, `/invoices/[id]`, `/jobs` respond 200 (client-side session gate renders "Checking your session…" when unauthenticated); `/i/not-a-uuid` → 404 (format guard); `/i/<valid-uuid-unknown-token>` → 404 (NOT_FOUND path). An authenticated click-through (create → edit → send → record payment) still needs a human with staff credentials — flagged for the user.

## Test setup + results (Phase 1-J)

Vitest added at the workspace root (`vitest.config.ts` with `@premier/*` aliases mirroring tsconfig paths; `pnpm test` script). No test infra existed before — this is the lightest setup consistent with `CONVENTIONS.md` (Vitest, tests next to code).

- **Unit tests (31, all passing):**
  - `packages/shared/schemas/invoice.test.ts` — invoice-from-job requires a job id (uuid), kind defaults, payment schema rejects zero/negative/non-numeric amounts + unknown methods + missing dates, line-item schema rejects zero quantity/negative price/empty name, metadata schema bounds tax % and discount, list-args defaults.
  - `packages/db/queries/invoices.test.ts` — `computeIsOverdue` (all status/date/balance branches) and `translatePaymentError` (trigger messages → VALIDATION_ERROR, everything else → DB_ERROR).
- **DB-invariant verification (live DB, rollback-safe):** ran a single DO block against `premier-crm-prod` that force-rolled-back via a final `RAISE EXCEPTION` — zero rows persisted, no sequences consumed. All 7 checks passed:
  - `amount_due` generated correctly (`total - amount_paid`);
  - direct write to `amount_due` rejected by Postgres itself (SQLSTATE 428C9 — impossible to bypass from any client);
  - partial payment → `amount_paid=50, amount_due=100, status=partially_paid`;
  - completing payment → `amount_paid=150, amount_due=0, status=paid`;
  - overpayment rejected by trigger;
  - non-positive amount rejected by trigger;
  - payment against a void invoice rejected by trigger.
- **Covered by construction (code-level, single-org prod means no cross-org fixture exists):** cross-org job/invoice access is blocked because every query in `packages/db/queries/invoices.ts` filters `.eq('org_id', ...)` from the caller's membership, and `createDraftInvoiceFromJob` NOT-FOUNDs a job outside the org. Draft invoices 404 on the public `/i/[token]` route (explicit status guard); sent invoices resolve by token with race-safe first-view stamping.

## Validation (final, after all Phase 1 work)

- `pnpm typecheck` — clean, all 5 packages.
- `pnpm test` — 31/31 passing.
- `pnpm build` — clean; `/invoices`, `/invoices/[invoiceId]`, `/i/[token]` all in the route manifest; only pre-existing warning remains (`quotes/_components/line-item-editor.tsx` unused `formAction`).
- `eslint` on all new/changed invoice files — clean.

## Checklist

- [x] Read all required docs
- [x] Establish Requests/Estimates/Quotes/Jobs ground truth (replaces missing reconciliation doc)
- [x] Audit customer portal RLS
- [x] Inspect Supabase schema, migrations, RLS, triggers, indexes, row counts
- [x] Audit existing invoice-adjacent code (none found) and the quotes reference pattern
- [x] Run pnpm install/typecheck/lint/build baseline
- [x] Get migration approved and applied (both: foundation + FK indexes)
- [x] Regenerate types, run advisors
- [x] Query layer (`packages/db/queries/invoices.ts`)
- [x] Server actions (`invoices/actions.ts`)
- [x] Invoice list page
- [x] Invoice creation (from job / from quote)
- [x] Invoice detail/edit page
- [x] Job detail integration (replace placeholder)
- [x] Payment recording UI
- [x] Public invoice view + send action
- [x] Tests (Vitest unit + rollback-safe live-DB invariant checks)
- [x] Phase 2 (Customers/Properties/Requests/Estimates/Quotes/Jobs/Nav audit — see below)
- [ ] Phase 3 (UX/reliability/security/performance pass — partially covered by Phase 2 fixes; remaining items ranked below)

## Phase 2 audit (2026-07-22) — customers/properties/today/team/services/settings/nav

Requests/Estimates/Quotes/Jobs and portal RLS were already audited SOLID (above). Remaining areas:

- **Customers, Properties, Team, Services, Settings/website**: all wired to real data (RPCs `get_customer_360`, `get_property_memory`; org-scoped queries). All server actions Zod-validate, org-scope from session, return `Result<T>`. No fake data found.
- **Fixed this pass** (commit `6263c12`): `/invoices` was completely unreachable — no nav entry, no dashboard link; added to bottom nav. Today dashboard dead placeholder buttons ("Capture note", "New job", "Capture field note" — all no-ops behind `handlePlaceholderAction`) removed; quick actions now all navigate. "Today's work" card was a hardcoded "No jobs scheduled" string — now queries jobs with `scheduled_start` today (org-scoped, linked). Internal "Current phase" roadmap card removed.
- **Fixed this pass** (commit `bcba3fd`): `getCustomerById` was the only entity lookup without an explicit org filter (RLS-only) — now org-scoped like everything else.

## Ranked remaining issues (for the user)

1. **Authenticated click-through untested** — create invoice → edit line items → send → record payment, the team-invite flow, and the new customer/property-creation forms all need a human with staff credentials in dev (`pnpm dev`, now works with `apps/web/.env.local`).
2. **Today page fetches client-side** (`getBrowserSupabase` in `useEffect`) — inconsistent with the server-component pattern everywhere else; works, but slower and untypical. Refactor candidate.
3. **Migration history drift** — remote applied-migration names don't match local `NNNN_*.sql` filenames one-to-one (duplicate `0012`, mismatched `0014`); pre-existing, documented, untouched.
4. **Lint debt** — 333 pre-existing errors (generated PWA files linted as source, `scripts/*.mjs` missing Node globals). Config fix, not code fix.
5. **`/settings` has no landing page** (only `/settings/website`); nothing links to bare `/settings` so nothing is broken.
6. **`jobs.customer_id`/`jobs.property_id`** still lack explicit `ON DELETE` behavior (pre-existing, flagged in Phase 1, out of scope).

## Post-MVP amendment: standalone New Quote / New Job entry points (2026-07-23)

Kevin's amendment after using the built system: the request→estimate→quote→job pipeline must not be the only way to create an Estimate, Quote, or Job. Manual Estimate already existed (`/estimates/new`); added the same "second door" for Quotes and Jobs.

- **`/quotes/new`** + `createStandaloneQuoteAction` (`apps/web/app/(app)/quotes/actions.ts`). Quotes can't exist with neither `job_id` nor `estimate_id` (`quotes_has_job_or_estimate` CHECK from `20260511160215_make_quotes_job_id_nullable.sql`) — no schema change needed or wanted; instead this creates a backing estimate (status `quoted`, since it's being quoted immediately) then a draft quote linked to it via the existing `createDraftQuote(estimateId)` path. Same DB shape the estimate→quote flow already produces, collapsed into one form. The pre-existing "quote an existing job" dialog is kept (relabeled "Quote an existing job" for clarity now that the page has two creation paths) — it's a different, already-working manual door (job exists, no estimate).
- **`/jobs/new`** + `createStandaloneJobAction` (`apps/web/app/(app)/jobs/actions.ts`). Jobs have no quote/estimate constraint, so this inserts directly (org/customer/property verified same as the manual estimate path). Status defaults to `lead` — there's no acceptance milestone to start from here, unlike the quote-accepted path which starts jobs at `approved` per the locked decision (that path is untouched).
- Both reuse a new shared `CustomerPropertyWorkForm` (`apps/web/components/forms/customer-property-work-form.tsx`), extracted from the original `new-estimate-form.tsx` so estimate/quote/job creation share one implementation instead of three near-identical copies. `/estimates/new` was refactored onto it too and re-verified working.
- Nav: "New quote" button added to `/quotes` header (primary action); "New job" button added to `/jobs` header (previously had none).
- Standalone-created quotes/jobs feed the existing pipeline unchanged: a standalone quote still requires `accepted` status before `createJobFromAcceptedQuoteAction` will create a job from it (same one-job-per-quote guard); a standalone-created job already supports invoice creation via the existing job-detail "Create invoice" button, since that was never gated on a quote.
- Validation: `pnpm typecheck` clean, `pnpm test` 31/31, `pnpm build` clean (`/quotes/new`, `/jobs/new` both in the route manifest), `eslint` clean on all changed/new files, dev smoke test confirmed all four routes (`/quotes`, `/quotes/new`, `/jobs`, `/jobs/new`) and the refactored `/estimates/new` return 200.
- No migration needed — this was pure application-layer work.

## Feature: team invites (2026-07-23)

Requested by Kevin: make `/team` functional (invite by email, Resend email, invitee accepts and gets a real Supabase Auth account, role field on `org_members`). `org_members.role` already existed (`user_role` enum: owner/admin/employee/subcontractor/viewer, from `0001_init.sql`) — no new role field was needed there; what was actually missing was a way to represent an invite *before* the invitee has an auth account, since `org_members.user_id` is a `NOT NULL` FK to `auth.users` (migration `0012` deliberately dropped the old pending-approval model — "account creation is controlled outside the app until invites land"). Built a dedicated `org_invites` table instead.

- **Migrations**: `20260723000000_org_invites.sql` (table + RLS + `accept_org_invite()` atomic-accept function + the one-line data fix promoting `sommerskevin3@gmail.com` to owner, confirmed with Kevin first — exact UPDATE statement shown before approval) and `20260723000001_org_invites_function_hardening.sql` (the security advisor caught that Postgres grants `EXECUTE` to `PUBLIC` by default on `CREATE FUNCTION`, exposing `accept_org_invite` to `anon`/`authenticated` via the PostgREST RPC endpoint — revoked those, kept `service_role` only, added an `auth.uid() = p_user_id` check as defense in depth). Both applied to `premier-crm-prod` with explicit approval per the hard override. Types regenerated (`pnpm db:types`).
- **Verified live** (rollback-safe DO block, nothing persisted): duplicate pending invite for the same email rejected (case-insensitive partial unique index); `role='owner'` rejected by CHECK; wrong-email accept rejected; unknown token rejected; revoked invite rejected. Confirmed post-migration: both `kevinsommers@ppmnky.com` and `sommerskevin3@gmail.com` are now `owner`.
- **Query layer**: `packages/db/queries/org-invites.ts` — `createOrgInvite`, `listPendingInvites`, `revokeOrgInvite`, `getInviteByToken` (public accept-page lookup), `acceptOrgInvite` (wraps the RPC), `translateAcceptInviteError`.
- **Schemas**: reused the existing-but-previously-unused `TeamMemberInviteSchema` (email/fullName/role, already excludes `owner`) instead of inventing a new shape — it was clearly built for this exact feature and shelved when the old approval flow was dropped. Added `AcceptTeamMemberInviteSchema` (token/fullName/password) alongside it.
- **UI**: `/team` now has an `InviteMemberForm` (owner/admin only) and a pending-invites list with per-row `RevokeInviteButton`. `/invite/[token]` is a new top-level public route (same shape as `/q/[token]`/`/i/[token]`: UUID guard, service-role client) rendering distinct "expired"/"already used"/"revoked" states rather than a bare 404, with a set-password form for pending invites.
- **Auth pattern**: mirrors the customer portal's self-serve signup exactly (`apps/web/app/portal/actions.ts` / `apps/web/app/portal/login/page.tsx`) since that's the only self-serve account-creation code that existed anywhere in the repo — a plain server-action-bound `<form>`, `getServerSupabase()` + `supabase.auth.signUp()`, then `acceptOrgInvite` (the atomic RPC) creates `org_members` + `user_profiles` and marks the invite accepted, then redirects to `/today`.
- **Email**: `sendTeamInviteEmail` in `apps/web/lib/email.ts`, identical Resend pattern to `sendQuoteEmail`/`sendInvoiceEmail` (best-effort, `{sent: boolean}`, invite creation never blocked on delivery failure).
- **Tests**: 14 new (45 total) — `TeamMemberInviteSchema`/`AcceptTeamMemberInviteSchema` validation (including "owner" rejected as an invite role) and `translateAcceptInviteError` message-mapping.
- Validation: `pnpm typecheck` clean, `pnpm test` 45/45, `pnpm build` clean (`/team`, `/invite/[token]` in the route manifest), `eslint` clean on all new/changed files. Dev smoke test: `/invite/not-a-uuid` and `/invite/<unknown-token>` both 404; a real pending invite (created and deleted directly in prod, no auth user created) rendered the accept form correctly with the invitee's email/role.
- **Not verified**: an actual authenticated click-through (invite → email → accept → land on `/today` as a new org member) — needs a human with real credentials; I don't have Kevin's password to log in and trigger this from the UI myself.

## Feature: standalone New Customer entry point (2026-07-23)

Confirmed first, per instructions, rather than assuming it was missing: no `/customers/new` route or "New Customer" button existed anywhere — the Today dashboard's `new-customer` quick action just linked to the customer list.

- **Ground truth on existing customer-creation paths** (both implicit, neither a manual entry point): `createServiceRequest` (website intake — dedupes by email then normalized phone, always paired with a property since the intake form always collects an address) and the portal's `ensureCustomerAccount` (dedupes by email, paired with a `customer_accounts` auth link). `createManualEstimateAction` does **not** create customers — it only *selects* an existing one via a picker, contrary to how that path initially read.
- **No migration needed, confirmed against the schema first**: `customers` has no `NOT NULL` columns beyond `org_id` and `type` (defaulted to `residential`); `customer_properties` is a separate join table. A customer with zero properties is already valid.
- **Design choices for the manual path, deliberately different from the two implicit ones**: no dedupe (a staff member creating a customer by hand is assumed to already know whether the record exists — the list page's search is right there) and no property bundled in (properties are separately addable — though there's currently no property-creation UI either; see the ranked issues list, this is a pre-existing gap, not something this pass introduced or was asked to fix).
- `packages/shared/schemas/create-customer-input.ts` — `CreateCustomerInputSchema`: type/name/company/contact/notes, matching the table's actual nullability, plus one UI-level rule (some name or company name required — otherwise the row would show as "Unnamed customer" everywhere the generated `display_name` column is read).
- `packages/db/queries/customers.ts` — added `createCustomer`.
- `apps/web/app/(app)/customers/actions.ts` (new file) — `createCustomerAction`.
- `/customers/new` + `NewCustomerForm`, structured like `/estimates/new`; the type/preferred-channel selects use the same plain-`<select>` convention as `invite-member-form.tsx` and `record-payment-form.tsx` (no shadcn `Select` component exists in this repo).
- "New Customer" button added to `/customers` header (matching the `/quotes`/`/jobs` pattern) and to the empty state; Today's "New customer" quick action now points at the form instead of the bare list.
- Validation: `pnpm typecheck` clean, `pnpm test` 52/52 (7 new), `pnpm build` clean (`/customers/new` in the route manifest), `eslint` clean on all new/changed files, dev smoke test confirms `/customers` and `/customers/new` both return 200 (client-side `AuthGuard` shell when signed out, same as every other route in `(app)`, no 404/500).

## Feature: property creation + soft dedupe safety on New Customer (2026-07-23)

Two gaps surfaced from the New Customer build: no staff-side property-creation UI at all, and no dedupe check on `/customers/new`.

- **Property creation — no migration needed, confirmed against the schema first**: `customer_properties` is a plain join table (customer_id, property_id, both NOT NULL) with no constraint requiring a customer to have exactly one property.
- `packages/shared/schemas/create-property-input.ts` — `CreatePropertyInputSchema` reuses the same `property_type` enum and address-field length constraints as `ServiceRequestPayloadSchema` (website intake) rather than redefining a property's shape from scratch — just camelCase to match this app's other staff-facing schemas.
- `packages/db/queries/properties.ts` — added `createPropertyForCustomer`. Marks the new property `is_primary` only when the customer currently has zero linked properties, so adding a second/third property never silently steals primary status from an existing one. **Verified live** (rollback-safe DO block against `premier-crm-prod`, nothing persisted): a customer with zero properties gets `is_primary=true` on their first; a customer who already has one gets `is_primary=false` on their second, and ends up with 2 linked properties correctly.
- **UI location — chosen, not assumed**: the customer detail page already had a "Properties" `ListCard` in its three-column section (Properties / Recent jobs / Open quotes). Added the entry point there via a new `PropertiesCard` client component with an inline expandable "Add property" form, replacing the generic `ListCard` call for that one column. Chose inline-reveal over a modal or a dedicated route because (a) the properties list is already the natural home for this, and (b) no dialog/modal component exists anywhere in this repo — the inline-expand pattern is already established (`LineItemEditor`'s "Add line item" flow in the invoices/quotes modules), so this follows precedent instead of introducing a new UI mechanism.
- **Dedupe safety — soft, not a hard block**, per the explicit ask: `packages/db/queries/customers.ts` gained `findCustomerByEmail`, the same exact-email-match strategy `createServiceRequest` and `ensureCustomerAccount` already use. A new `checkCustomerEmailAction` is a separate, advisory-only lookup — `createCustomerAction` itself is completely unchanged and enforces nothing. `NewCustomerForm` now gates submit: if an email is present, it checks for a match before creating; a hit shows the existing customer's name/contact info with three choices — "View existing customer" (navigates away), "Create anyway" (resubmits the same captured form data without re-checking), "Cancel" (returns to editing). No email, or no match, submits straight through with no extra step. **Verified live**: a known-existing email returns exactly one match.
- **Tests**: 9 new (61 total) — `CreatePropertyInputSchema` validation and `CheckCustomerEmailInputSchema` validation (including the lowercase-normalization behavior).
- Validation: `pnpm typecheck` clean, `pnpm test` 61/61, `pnpm build` clean, `eslint` clean on all new/changed files. Dev smoke test: `/customers`, `/customers/new`, and `/customers/[id]` (unknown-but-valid UUID) all return 200 — an earlier smoke test run hit a stale zombie `next dev` process left listening on port 3000 from an earlier turn and got a false 500; killed it and re-verified against the actual running server (a different port, since 3000 was occupied), clean.
- **Branch note**: partway through this pass, the local checkout had been switched to `deploy/catch-up-main` by something outside this session (a commit `3928065 "Add Claude Design handoff for creation flows"`, authored by Kevin, adding a design-handoff zip — unrelated to this code, looks like a separate design-tool integration). My commit landed there first; cherry-picked onto `main` afterward without altering `deploy/catch-up-main`, so both branches now have this work and nothing was rewritten or lost.
