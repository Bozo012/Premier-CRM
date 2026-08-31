# Invoice Cutover Readiness Audit

Audit of whether Forge can replace Premier Property Maintenance's external invoicing tool for real customers, and what permanent environment isolation is needed so ongoing development can never mutate production data by accident.

## 1. Baseline

- Branch: `audit/invoice-cutover-readiness`
- Base SHA (origin/main at start, verified as an ancestor before creating the worktree): `5a8139264476e276d44992ebe9aea26d63afc502` (PR #152 merge commit — no commits had landed on `main` past this before the audit began)
- Final HEAD SHA: see PR — one commit added on top of base, adding `tests/e2e/payment-authority-bot.spec.ts` only. No other files changed.

## 2. Executive verdict

**NOT READY FOR REAL-INVOICE SMOKE TEST.**

The creation → totals → expense-linkage → payment → history spine of the invoice lifecycle is real, DB-authoritative, and now has direct test evidence (including two gaps closed by this audit — see §5). The blocker is entirely on the **customer delivery** side: this environment's email domain is unverified (a live, confirmed 403 from Resend), the invoice is marked "sent" regardless of whether the email actually went out, and there is no PDF or delivery-status record to fall back on. Sending a real invoice today means the customer may receive nothing, with no signal to staff that anything went wrong.

## 3. Cutover checklist

| Item | Status | Basis |
|---|---|---|
| Create invoice | PASS | Job-anchored server action + DB, real UI wiring |
| Edit draft | PASS | `assertDraftInvoice()` guard, app-layer only (see caveat in §4) |
| Add line items | PASS | Dedicated table, generated `total` column |
| Authoritative totals | PASS | DB trigger `recalc_invoice_totals()`, fires on every line-item write |
| Expense linkage | PASS | Partial unique index enforces one-expense-once at the DB level; proven under real concurrency by `expense-invoice-integrity-bot.spec.ts` |
| Customer association | PASS | `job_id NOT NULL`, customer resolved via job, org-scoped |
| Job/quote association | PASS | `job_id` mandatory FK, `quote_id` optional FK |
| Finalize/send | PASS (status transition) / **BLOCKED** (delivery, see below) | DB status flip is real and Result-typed; email is best-effort and its failure isn't surfaced |
| Customer delivery | **BLOCKED** | Resend sending domain unverified in this environment (confirmed 403, documented in `tests/e2e/transactional-email-bot.spec.ts`); invoice marked "sent" regardless of actual delivery outcome |
| Customer authorization | PASS | Portal path RLS-scoped; public token path uses an unguessable UUID + an app-layer draft gate (no RLS backstop — see §4) |
| Customer invoice view | PASS | Both portal and public-token routes render live, server-computed data; no PDF divergence risk because no PDF exists |
| Manual payment | PASS | `payments` table + `apply_payment_to_invoice()` trigger, atomic via `SELECT ... FOR UPDATE` |
| Partial payment | **PASS — newly proven** | No test previously proved this at the DB level; `payment-authority-bot.spec.ts` #1 now does |
| Full payment | PASS | Proven by `invoice-management-bot.spec.ts` and `invoice-totals-recalc-bot.spec.ts` |
| Balance/status | PASS | `amount_due` is a true generated column; `status`/`amount_paid` are trigger-maintained, lock-protected |
| Invoice history | PASS | Live query, no denormalized/stale field |
| Payment history | PASS | Live query against `payments`, same as above |
| Tenant isolation | PASS | RLS policies confirmed org/customer-scoped by direct SQL read (staff and portal paths); public-token path is isolation-by-unguessable-token, not RLS |
| Activity/audit trail | DEFERRED | `payment_recorded` is logged; invoice create/send/void are **not** logged anywhere — a real gap, but not a lifecycle blocker |

## 4. Exact blockers

### BLOCKER 1 — Customer delivery cannot be trusted (the actual cutover blocker)

- **File/function**: `apps/web/lib/email.ts` (`sendInvoiceEmail()`, `deliverEmail()`), invoked from `sendInvoiceAction()` in `apps/web/app/(app)/(forge)/invoices/actions.ts:404-453`.
- **Current behavior**: `sendInvoiceAction` flips `invoices.status` from `draft` to `sent` in the DB **unconditionally**, then makes a best-effort attempt to email the customer via Resend. `deliverEmail()` catches all errors and returns `{ sent: boolean }` — a failure never causes the action to return `success: false`, and `status` is never rolled back. This environment's Resend sending domain (`ppmnky.com`, sender `quotes@ppmnky.com`) is **confirmed unverified** — every send attempt gets a `403` from Resend. This was independently documented by a prior audit pass inside `tests/e2e/transactional-email-bot.spec.ts` (lines 6-46, dated 2026-07-31) and re-confirmed live in this session (`payments`/`transactional-email-bot` tests passed only because they deliberately test the *graceful-degradation* path, not delivery success).
- **Required behavior**: An invoice should never be indistinguishable between "customer was actually emailed" and "link was generated but delivery failed." At minimum: (a) the Resend sending domain must be verified for whatever domain Premier will actually send from, and (b) the schema needs a way to durably record delivery outcome (e.g. a `delivery_status`/`emailed_at` column, or reuse of the existing best-effort `emailSent` flag persisted rather than only toast-surfaced) so staff can see, days later, whether a "sent" invoice was actually delivered.
- **Smallest safe fix**: (1) Verify the Resend domain in the Resend dashboard — **this is a credential/external-provider decision requiring your action, not something to do inside this audit.** (2) Once verified, add a nullable `email_delivered_at TIMESTAMPTZ` (or similar) column to `invoices`, set it only on confirmed Resend success, and surface its absence in the UI/detail page as a visible "delivery not confirmed" state instead of a silent toast. This is a small, additive migration — no redesign — but it's schema work, so it should be proposed and approved as its own slice, not bundled into this audit.
- **Also flagged, not a blocker**: no PDF generation exists for invoices (only a live HTML page at `/i/[token]`). Not required for cutover — the live page is a legitimate customer-facing artifact — but worth knowing if Premier's customers expect a downloadable/printable document.

### BLOCKER 2 (minor, non-cutover-blocking) — Draft-immutability has no DB-level backstop

- **File**: `packages/db/queries/invoices.ts`, `assertDraftInvoice()` (line 716) and the individual status checks inside `updateInvoiceMetadata()`, `sendInvoice()`, `voidInvoice()`.
- **Current behavior**: "Only draft invoices can be edited" / "only draft invoices can be sent" is enforced entirely by TS-layer checks inside functions called via the service-role client (which bypasses RLS). All *legitimate* app writes go through these functions today, so the invariant currently holds — but there is no DB CHECK constraint or trigger that would independently reject an UPDATE to a non-draft invoice's line items if some future code path (an admin script, an AI tool call using the service-role client directly) skipped the guard function.
- **Required behavior**: not required for cutover as-is, since no such alternate write path currently exists. Worth hardening later with the same trigger/constraint treatment already given to totals and expense-uniqueness.
- **Smallest safe fix (future work, not this session)**: a `BEFORE UPDATE` trigger on `invoice_line_items`/`invoices` that raises if the parent invoice's status isn't `draft`, mirroring the `apply_payment_to_invoice()` pattern.

### BLOCKER 3 (minor, non-cutover-blocking) — Void doesn't reconcile existing payments or freed expenses

- **File**: `packages/db/queries/invoices.ts`, `voidInvoice()` (lines 867-897).
- **Current behavior**: blocks voiding a `'paid'` invoice, but **not** a `'partially_paid'` one. A partially-paid invoice with real payment rows can be voided, leaving `amount_paid` nonzero against a void invoice with no reversal/refund path (refunds are unimplemented — the `'refunded'` enum value and `canIssueRefunds` capability exist with zero backing code). Separately, voiding an invoice with a billed expense (`source_expense_id`) never frees that expense for rebilling elsewhere.
- **Required behavior**: for a same-day cutover this is an edge case Premier is unlikely to hit on the first invoice (void-after-partial-payment). Worth fixing before this becomes routine, not before the first invoice.
- **Recommendation**: defer; document as a known gap.

### BLOCKER 4 (informational, not a blocker) — E2E has two untracked migrations

`premier-crm-e2e` has two applied migrations with no corresponding file in `supabase/migrations/` on `main`: `scheduling_conflict_detection_fix_status_cast` and `scheduling_conflict_detection_fix_null_lead`. Unrelated to invoicing (scheduling-conflict feature), but it means E2E's schema has silently drifted ahead of version control. Recommend recovering these as real migration files from `supabase_migrations.schema_migrations` before they're lost, as a small separate follow-up.

## 5. Test evidence

All runs below were against `premier-crm-e2e` (`slbnizoskumwhleeiccv`), confirmed via the running dev server's `/api/e2e-health` endpoint (`{"projectRef":"slbnizoskumwhleeiccv"}`) before any test executed. Production ref `apnbpcauqrjvkoleisde` was never targeted; no production migration was applied; no production data was read or written.

**E2E project state**: was paused (Supabase free-tier auto-pause) at the start of this session and was resumed via the standard restore action — the E2E project only, never production. First read attempt hit the project mid-resume and misleadingly showed an empty schema; a repeat query once fully `ACTIVE_HEALTHY` showed the real state: 74 tables in `public`, all 89 of `main`'s migrations already recorded as applied via `list_migrations`, plus the 2 untracked ones noted in Blocker 4 above. **No migrations needed to be applied to E2E** — the earlier "empty schema" reading was a false alarm from querying too early in the resume cycle, not a real gap; this is called out explicitly so the false alarm isn't mistaken for a finding.

**Playwright** (`--project=chromium`), invoice/payment/portal-relevant specs:

| Spec | Result |
|---|---|
| `deposit-invoice-creation-bot.spec.ts` | PASS (all) |
| `expense-invoice-integrity-bot.spec.ts` | PASS (all, including the real concurrent-double-billing-rejected test) |
| `invoice-management-bot.spec.ts` | PASS (all 6 — create, send, full payment, void, plus shell) |
| `invoice-totals-recalc-bot.spec.ts` | PASS (all 4) |
| `invoices-base44-shell-bot.spec.ts` | PASS (all 10) |
| `payments-flow-bot.spec.ts` | 1 PASS, 2 SKIP (no eligible sent/outstanding invoice existed in the fixture org at run time — an honest `test.skip()`, not a failure) |
| `transactional-email-bot.spec.ts` | PASS (all 3 — these specifically test graceful degradation when Resend fails, matching Blocker 1) |
| `working-invoice-protection-bot.spec.ts` | PASS (both) |
| **`payment-authority-bot.spec.ts` (new, added this session)** | **PASS (all 5)** — proves, for the first time with direct DB assertions: $100 partial payment → `partially_paid`/`amount_paid=100`/`amount_due=200`; completing payment → `paid`; DB trigger rejects overpayment; DB trigger rejects negative amount; DB trigger rejects payment against a void invoice. All five bypass the Zod schema and server action, calling `recordPayment()` directly — proving the *database*, not just app validation, is authoritative. |

A first full parallel run (`--project=chromium` default workers) showed 6 failures, all `page.goto` timeouts against the local dev server under concurrent load. Rerunning the same 5 spec files serially (`--workers=1`) produced 0 failures — confirmed as dev-server-under-parallel-load flakiness, not a code defect, before being reported as evidence.

**Vitest**: `pnpm test` → 498/498 passed, 55 files.
**Typecheck**: `pnpm typecheck` → clean across all 5 workspace packages.
**Build**: `pnpm --filter @premier/web build` → succeeded.
**Lint**: `pnpm exec eslint tests/e2e/payment-authority-bot.spec.ts` (the only changed file) → 0 errors, 0 warnings.

No skip was reported as a pass. No assertion was weakened to make a test green.

## 6. Production differences

**Read-only findings only — production (`apnbpcauqrjvkoleisde`) was never queried or mutated during this audit.** Everything below is either from repo history/docs or from what's known about E2E; nothing here required touching prod.

- **Proven** (from repo history, `docs/IMPLEMENTATION-STATUS.md` and prior migration comments): production was previously confirmed behind E2E/local migration history, and one migration (`20260810060936_invoice_line_items_source_expense_uniqueness.sql`) was deliberately applied out of timestamp order after a read-only safety audit — i.e., production's migration-applied-order does not match file timestamp order, and this was a known, deliberate, previously-reviewed action.
- **Inferred, not verified this session**: whether production has since caught up to `main`'s full migration set is **unknown** — this audit did not query production's `schema_migrations` table or its live schema, per the explicit instruction not to. Before any real production deployment/migration work, production's actual applied-migration state should be read (read-only) and reconciled explicitly, not assumed from E2E's state.
- **Unknown**: whether production's Vercel environment variables for `NEXT_PUBLIC_SUPABASE_URL` point at prod or something else — out of scope for this audit (no Vercel Production environment inspection was performed).

## 7. Minimum cutover plan

Shortest ordered path from current `main` to "Kevin can send the first real Forge invoice":

1. **Verify the Resend sending domain** for whatever address Premier will send invoices from (owner/Resend-dashboard action, not code).
2. **Add a delivery-confirmation signal** to invoices (small additive migration + one server-action edit) so a failed send is visibly different from a successful one — propose as its own slice per Blocker 1.
3. Re-run `transactional-email-bot.spec.ts` against a real (or sandbox-verified) domain to confirm delivery actually succeeds, not just that failure degrades gracefully.
4. Do the controlled real-invoice smoke test in §9 below, on production, with your explicit go-ahead at each step.
5. (Not required for cutover, but recommended soon after) Harden draft-immutability with a DB trigger (Blocker 2) and fix the void-with-payments gap (Blocker 3) before either becomes a live incident.

No new payment provider, PDF designer, or accounting integration is required to cross this line — manual payment recording is already DB-authoritative and sufficiently proven.

## 8. Permanent environment architecture

Target model (per your brief): local → dedicated E2E → Vercel Preview/staging → manual approval → production, with the invariant that **no automated test or normal dev workflow can ever mutate production data.**

**What's already real and good** (confirmed by direct code read, not assumed):
- Three independent, ref-based (not env-name-based) production guards already exist and are correctly designed: `playwright.config.ts`'s test-runner-env check, `tests/e2e/global-setup.ts`'s live-server check via `/api/e2e-health`, and the health route itself, which fails closed (404s) on both `VERCEL_ENV === 'production'` and a resolved prod project ref — it never uses `VERCEL_ENV` as a permission signal, only as an extra deny-by-label layer. No instance of the `VERCEL_ENV === 'preview'`-as-safety anti-pattern was found anywhere in the repo.
- `tests/e2e/utils/cleanup.ts` requires either a localhost hostname or an explicit `E2E_ALLOW_REMOTE_SUPABASE_CLEANUP=true` opt-in, and scopes every delete to `E2E_TEST_`-marked rows regardless.

**What's missing or unverified, with recommended tasks:**

- **A. Local**: already correctly fails closed via the health-check guard. No changes needed.
- **B. E2E**: dedicated project confirmed (`premier-crm-e2e`, distinct org-visible name, distinct ref). Task: recover the two untracked migrations (Blocker 4) so E2E's schema is fully represented in version control.
- **C. Vercel Preview**: **this is the weakest link, confirmed directly this session.** When checking PR #152's Preview deployment in the prior session, its `/api/e2e-health` endpoint 404'd — which, given the route's fail-closed design, is most consistent with the Preview actually being wired to **production** Supabase credentials, not a dedicated non-prod project. This was never fully resolved (live verification was intentionally skipped rather than risk touching prod data). **Task: confirm and fix Vercel's Preview-environment `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to point at a dedicated non-prod project** (either `premier-crm-e2e` itself or a separate staging project), not production. This is the single highest-leverage fix for the stated goal ("no normal development workflow should ever be capable of mutating production data") since Preview deployments are created automatically for every PR.
- **D. Production**: `/api/e2e-health` already refuses to answer in `VERCEL_ENV === 'production'`. Task: confirm no other diagnostic/seed/reset route exists unprotected (not audited this session — recommend a focused route inventory as a follow-up).
- **E. Migrations**: recommend formalizing the already-followed-in-practice pattern (author → local review → apply to E2E → E2E behavioral proof → explicit named production approval → apply → verify) as a written checklist, given the prior out-of-order production apply was handled carefully but informally.
- **F. Releases**: current practice (feature branch → local gate → merge with expected-head-SHA protection, as used for PR #152) is sound; formalize Preview-must-be-non-prod (item C) as a required check before "ready for review."
- **G. Data**: recommend formalizing "no production customer data in E2E/staging, ever" as an explicit written rule — current E2E fixtures are already synthetic (`E2E_TEST_`-prefixed, self-seeded per test), which is the right pattern; just make it a stated policy, not an implicit convention.

## 9. First real invoice smoke plan (prepared, NOT executed)

To be run only after Blocker 1 is resolved and with your explicit go-ahead at each step. No step below was performed.

1. Identify one legitimate, already-existing PPM job with a real customer and confirmed email address.
2. Verify that customer's email address is current (ask Kevin or check recent correspondence).
3. Create a draft invoice from that job through the normal UI.
4. Inspect line items, tax, and total against what Kevin actually expects to bill.
5. Confirm customer/property/job association is correct on the invoice detail page.
6. Preview the customer-facing `/i/[token]` view yourself before sending.
7. Click Send; confirm in Resend's own dashboard (not just the app toast) that the email was actually delivered.
8. Ask the customer (or check portal access) to confirm they can open the invoice.
9. Do **not** record any payment until a real payment is actually received.
10. Once received, record it, and verify status/balance/history update correctly.
11. Document how to correct/void this specific invoice if anything above goes wrong, before sending it.

No fake production invoice, no test customer in production, no $0 junk invoice, and no production mutation occurred as part of preparing this plan.
