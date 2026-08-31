# Invoice Cutover Readiness Audit

Audit of whether Forge can replace Premier Property Maintenance's external invoicing tool for real customers, and what permanent environment isolation is needed so ongoing development can never mutate production data by accident.

**Update (delivery-fix session, branch `fix/invoice-delivery-confirmation`, built on top of the audit branch)**: BLOCKER 1 (customer delivery status was never durably recorded — see §4) has been fixed in code. See §2a and §4a below for the new verdict, the exact delivery-path trace, and what actually changed. Sections 1–9 below this point are preserved from the original audit pass unedited except where explicitly marked "Update".

## 1. Baseline (original audit pass)

- Branch: `audit/invoice-cutover-readiness`
- Base SHA (origin/main at start, verified as an ancestor before creating the worktree): `5a8139264476e276d44992ebe9aea26d63afc502` (PR #152 merge commit — no commits had landed on `main` past this before the audit began)
- Final HEAD SHA: see PR #153 — one commit added on top of base, adding `tests/e2e/payment-authority-bot.spec.ts` only. No other files changed.
- **Delivery-fix session baseline**: branched from `origin/audit/invoice-cutover-readiness` at `8a57dab96203f65b126cea9f8002119679648740` (PR #153's HEAD, confirmed clean/mergeable/CLEAN before branching). New branch: `fix/invoice-delivery-confirmation`.

## 2. Executive verdict (original audit pass — superseded, see §2a)

**NOT READY FOR REAL-INVOICE SMOKE TEST.**

The creation → totals → expense-linkage → payment → history spine of the invoice lifecycle is real, DB-authoritative, and now has direct test evidence (including two gaps closed by this audit — see §5). The blocker is entirely on the **customer delivery** side: this environment's email domain is unverified (a live, confirmed 403 from Resend), the invoice is marked "sent" regardless of whether the email actually went out, and there is no PDF or delivery-status record to fall back on. Sending a real invoice today means the customer may receive nothing, with no signal to staff that anything went wrong.

## 2a. Updated verdict (delivery-fix session)

**CODE READY — EXTERNAL CONFIGURATION REQUIRED.**

The code-level defect from BLOCKER 1 — an invoice could be marked "sent" with no durable record of whether the customer was actually emailed — is fixed (§4a). Every other item on the cutover checklist (§3) was already PASS. The only remaining item before the first real invoice is **entirely external and requires your action**: the Resend sending domain is not verified (confirmed independently via public DNS, not just the app's own error — see §4a). Once that's done, no further code changes are anticipated to send the first real invoice.

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
| Customer delivery | **CODE READY — EXTERNAL CONFIG REQUIRED** (Update, §4a) | Delivery outcome is now durably logged and truthfully shown to staff, with retry/copy-link recovery; Resend sending domain itself still needs owner-side verification (§4a Resend checklist) |
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

## 4a. BLOCKER 1 — delivery path trace, fix, and Resend owner checklist

### Exact delivery path trace (as it existed before this fix)

`staff clicks "Send invoice"` → `SendInvoiceButton` (`_components/send-invoice-button.tsx`) submits a form → `sendInvoiceAction()` (`invoices/actions.ts:404`) → `sendInvoice()` DB function flips `invoices.status: draft → sent` (unconditional, this always commits) → action builds `invoiceUrl = /i/{share_token}` from the row `sendInvoice()` already returned → action re-fetches invoice detail via `getInvoiceById()` (org-scoped) → if `customer.email` exists, calls `sendInvoiceEmail()` (`lib/email.ts`) → that calls `deliverEmail()` → Resend SDK `.emails.send()` → **before this fix**, the boolean result was returned to the client as `emailSent` and shown in a toast, but nothing was ever written to durable storage → `revalidatePath` refreshes the page → customer, separately, can open `/i/[token]` (`app/i/[token]/page.tsx`) — public, service-role client (bypasses RLS), explicitly excludes `status === 'draft'` invoices, authorization is the UUID token itself (unguessable, DB-unique).

Answering the audit's exact questions, as the code stood **before** this fix:

- **A. What did `invoice.status='sent'` mean?** "Finalized and a customer link now exists." Nothing about email.
- **B. Finalized/shareable, or emailed?** Finalized/shareable only. The status column has never meant "the customer was emailed."
- **C. What happened when Resend errored?** `deliverEmail()` caught it, logged to the server console (`console.error`), and returned `{ sent: false }`. No exception propagated.
- **D. Was the error visible to staff?** Only as a client toast for the ~8-10 seconds it was on screen, then gone forever with no other record.
- **E. Could staff retry without changing financial state?** No — there was no retry action at all. The send button vanishes forever once `status !== 'draft'` (`SendInvoiceButton` returns `null`).
- **F. Could staff copy/open the link manually?** Yes, but only as plain unstyled text on the detail page — no copy button, easy to miss, and gave no indication *whether they needed to*.
- **G. Was the share URL authorized correctly?** Yes — confirmed by this session's new E2E test: an unrecognized/random token returns "could not be found," and the token itself is a DB-unique, cryptographically random UUID (`gen_random_uuid()` default), not enumerable.
- **H. Auth required, or is token possession sufficient?** Token possession is sufficient by design (a bearer-link model, same as the quote share flow) — no customer login required for `/i/[token]`.
- **I. Was any provider response persisted?** No — `deliverEmail()`'s `{ sent: boolean }` was read once by the caller and discarded; the Resend API's own response body/error was only ever `console.error`'d, never stored.
- **J. Was there an existing mechanism to record this without a new table?** Yes — `activity_log` (`supabase/migrations/20260731010000_activity_log.sql`). `event_type` is a plain `TEXT NOT NULL` column with **no CHECK constraint**, so new event type values need zero migration, only a TS union extension. This made Option A viable.

### The fix (Option A — schema-free, as the audit anticipated)

No migration. Changes, all additive:

1. **`packages/db/queries/activity-log.ts`**: added `'invoice_email_sent'` / `'invoice_email_failed'` to the `ActivityLogEventType` union (no DB constraint to update), and a new `getLatestEntityEvent()` query — the single most recent matching log entry for an entity, used to render a durable (survives refresh) status instead of only a toast.
2. **`invoices/actions.ts`**:
   - `sendInvoiceAction()` now logs `invoice_email_sent` or `invoice_email_failed` to `activity_log` after every send attempt (including the "no customer email on file" case, which previously logged nothing at all).
   - New `retryInvoiceEmailAction()` — re-attempts delivery for an already-sent invoice. Requires `canSendInvoices` (same capability as send), fetches the invoice fresh and org-scoped, **rejects `draft`** (nothing to retry) and **rejects `void`** (added defensively — emailing a voided invoice is meaningless), reuses the **existing** `share_token` (never regenerates it — a customer who already received a partially-successful link must not have it silently invalidated), calls **no** financial function (`sendInvoice`, `recordPayment`, totals recalculation are never touched), and logs its own outcome the same way.
   - New `getInvoiceEmailDeliveryStatusAction()` — read-only, returns the most recent logged outcome (`'sent' | 'failed' | 'unknown'`) for the detail page.
3. **`_components/send-invoice-button.tsx`**: the failure-path toast changed from `toast.success` (a literal false-positive-styled success toast on a delivery failure — the exact bug the audit flagged) to `toast.error`, with truthful copy.
4. **`_components/invoice-email-delivery-status.tsx`** (new): renders on the invoice detail page once a `share_token` exists. Shows the durable last-known state, a **Retry email** button (only when the last attempt failed or is unknown), and a **Copy invoice link** button (always available) — the two recovery actions the audit specified.
5. **`invoices/[invoiceId]/page.tsx`**: swapped the old plain-text "Customer link" block for the new component.

Financial-state invariants, verified by both a vitest unit suite (Resend mocked — no real email sent) and a live E2E spec (Resend's real, currently-failing response — also no real email sent, since it's genuinely rejected):
- The `draft → sent` transition **never** depends on email outcome (already true before; unchanged).
- Retry **never** calls `sendInvoice()`, `recordPayment()`, or any totals/line-item mutation — proven directly (`sendInvoiceMock`/equivalent "not called" assertions).
- Retry **never** regenerates `share_token` — proven by asserting the retry email uses the pre-existing token's URL.
- A failed retry is logged as `invoice_email_failed`, never `invoice_email_sent` — a retry failure cannot masquerade as success.

### Resend configuration audit (read-only — no credentials touched, none requested)

- Code expects `RESEND_API_KEY` (from resend.com/api-keys) and `RESEND_FROM_EMAIL` (falls back to `quotes@ppmnky.com` if unset — `apps/web/lib/email.ts:27-29`). `NEXT_PUBLIC_APP_URL` (falls back to `http://localhost:3000`) is used to build the absolute link inside the email body.
- **Independently confirmed via public DNS** (not just the app's own 403, a second, unrelated data source): `ppmnky.com`'s TXT/SPF record is `v=spf1 include:_spf.google.com ~all` — **it does not include Resend's SPF** (`include:spf.resend.com` or similar). A `resend._domainkey.ppmnky.com` DKIM lookup returns **NXDOMAIN — the record does not exist at all.** This is conclusive: Resend has never been granted send authority for this domain at the DNS level, independent of whatever is or isn't configured inside the Resend dashboard itself.
- `.env.example` documents both vars but has a stray comment ("Stripe — required for invoicing") on an unrelated nearby line that contradicts this audit's finding that Stripe is not required; not fixed here (out of scope, cosmetic doc issue, flagged for a future doc pass).
- **I could not enumerate Vercel's actual configured environment variables** (name, scope, or value) — no read-only "list env vars" tool was available in this session's toolset, and I did not attempt to guess or extract values. The checklist below is what needs to exist, based on the code's requirements; confirming what's *actually* set in Vercel today is still open (ties into §8's Preview-isolation finding, since Preview/Production may not even be using the same values).

**OWNER ACTION CHECKLIST — Resend:**
1. Log into resend.com → Domains.
2. Add/verify `ppmnky.com` (or a dedicated sending subdomain, e.g. `mail.ppmnky.com` — often preferred so transactional-email reputation doesn't affect the root domain's regular mail).
3. Resend will provide DNS records to add (typically an SPF `TXT` at the domain root or subdomain, a DKIM `TXT` at `resend._domainkey.<domain>`, and often a `MX`/`TXT` for return-path). Add these at your DNS provider — same place the existing Google Workspace MX/SPF records live.
4. Success looks like: the domain's status in the Resend dashboard shows **Verified** (green), and a `dig TXT resend._domainkey.ppmnky.com` (or the subdomain you chose) returns a record instead of NXDOMAIN.

**OWNER ACTION CHECKLIST — Vercel:**
1. Confirm `RESEND_API_KEY` and `RESEND_FROM_EMAIL` exist in Project Settings → Environment Variables (I cannot see the values, only that the code requires these exact names).
2. Confirm the scope: at minimum **Production** needs correct values pointed at the now-verified domain. Whether **Preview** should share the same values or use a distinct sandbox/test sender is your call — but see §8: Preview must never share *Supabase* production credentials regardless of what's decided for email.
3. No secret values were requested or should be pasted into chat — set these directly in the Vercel dashboard.
4. **A redeploy (or redeploy-on-save, which Vercel does automatically for env var changes on the next deployment) is needed** for a changed env var to take effect — existing running deployments do not pick up env var changes live.

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

### Delivery-fix session — additional evidence

Same E2E project (`slbnizoskumwhleeiccv`), reconfirmed via `/api/e2e-health` before any mutation. Confirmed `ACTIVE_HEALTHY` before running anything (it had auto-paused again since the prior session).

**New vitest** (`apps/web/app/(app)/(forge)/invoices/actions.test.ts`) — Resend fully mocked, no real email sent: 10/10 passed. Covers: send-success logs `invoice_email_sent`; send-failure still commits the `sent` transition and logs `invoice_email_failed`; no-customer-email logs `invoice_email_failed` (not silently nothing); retry reuses the existing share token and never calls the financial `sendInvoice` function; retry is blocked for `draft` and `void`; a failed retry logs `invoice_email_failed`, never `invoice_email_sent`; `getInvoiceEmailDeliveryStatusAction` reads back `sent`/`failed`/`unknown` correctly.

**New Playwright** (`tests/e2e/invoice-delivery-status-bot.spec.ts`) — exercises the real, live, currently-failing Resend path (genuinely no email sent, satisfying "don't send real emails to satisfy the test"): 3/3 passed —
1. a failed delivery is logged as `invoice_email_failed` (never `invoice_email_sent`) and the durable UI indicator + Retry/Copy buttons survive a page reload;
2. retrying does not change `status`/`total`/`amount_paid`/`amount_due`/`share_token` (byte-for-byte equal before/after), and logs a second, independent `activity_log` row;
3. an unrecognized share token returns "could not be found" (cross-customer/enumeration check).

One genuine bug was found and fixed during this: the delivery-status component's initial status fetch had no error handling, so a failed/rejected read left the UI stuck showing nothing (indistinguishable from "still loading") instead of falling back to a visible "unknown" state — fixed with an explicit `.catch()`/error branch. One test (`retry ... never changes invoice financial state`) initially flaked on a one-shot DB read racing the server-confirmed write; fixed by switching to the same `expect(async () => {...}).toPass(...)` polling pattern already used elsewhere in this test suite (`invoice-management-bot.spec.ts`) — not a product defect, a test-timing fix.

**Full regression pass** — reran all previously-passing invoice/payment/portal specs plus the new `payment-authority-bot.spec.ts` from the prior session, serially (`--workers=1`): 45 passed, 2 honest skips (org-state-dependent, unrelated to this change), 0 failures.

**Vitest (full suite)**: 508/508 passed, 56 files.
**Typecheck**: clean across all 5 workspace packages.
**Build**: `pnpm --filter @premier/web build` succeeded.
**Lint**: all 9 changed/added files (`invoices/actions.ts`, `actions.test.ts`, `send-invoice-button.tsx`, `invoice-email-delivery-status.tsx` (new), `[invoiceId]/page.tsx`, `activity-log.ts`, `queries/index.ts`, `db/index.ts`, `invoice-delivery-status-bot.spec.ts`) → 0 errors, 0 warnings.

No migration was applied or needed for this fix — `event_type` has no CHECK constraint, so the two new event type values required only a TypeScript union change.

## 6. Production differences

**Read-only findings only — production (`apnbpcauqrjvkoleisde`) was never queried or mutated during this audit.** Everything below is either from repo history/docs or from what's known about E2E; nothing here required touching prod.

- **Proven** (from repo history, `docs/IMPLEMENTATION-STATUS.md` and prior migration comments): production was previously confirmed behind E2E/local migration history, and one migration (`20260810060936_invoice_line_items_source_expense_uniqueness.sql`) was deliberately applied out of timestamp order after a read-only safety audit — i.e., production's migration-applied-order does not match file timestamp order, and this was a known, deliberate, previously-reviewed action.
- **Inferred, not verified this session**: whether production has since caught up to `main`'s full migration set is **unknown** — this audit did not query production's `schema_migrations` table or its live schema, per the explicit instruction not to. Before any real production deployment/migration work, production's actual applied-migration state should be read (read-only) and reconciled explicitly, not assumed from E2E's state.
- **Unknown**: whether production's Vercel environment variables for `NEXT_PUBLIC_SUPABASE_URL` point at prod or something else — out of scope for this audit (no Vercel Production environment inspection was performed).

## 7. Minimum cutover plan (Update: steps 1 and 3 are now the only remaining ones)

Shortest ordered path from current `main` to "Kevin can send the first real Forge invoice":

1. **Verify the Resend sending domain** for whatever address Premier will send invoices from (owner/Resend-dashboard + DNS action — see the checklist in §4a; not something this session could do).
2. ~~Add a delivery-confirmation signal to invoices~~ — **done this session** (§4a), schema-free, no migration.
3. Once the domain is verified, send one real test invoice to a real staff-controlled inbox (not a customer) through the normal UI and confirm the new durable status indicator shows "sent successfully" — cheap final confirmation before touching a real customer.
4. Do the controlled real-invoice smoke test in §9 below, on production, with your explicit go-ahead at each step.
5. (Not required for cutover, but recommended soon after) Harden draft-immutability with a DB trigger (Blocker 2) and fix the void-with-payments gap (Blocker 3) before either becomes a live incident.
6. (Recommended next priority, per your instruction — see §8's new P0 item) Fix Vercel Preview's Supabase credential isolation before this becomes routine development risk.

No new payment provider, PDF designer, or accounting integration is required to cross this line — manual payment recording is already DB-authoritative and sufficiently proven.

## 8. Permanent environment architecture

> **P0 — do not let this get lost after invoicing cutover** (per explicit instruction, delivery-fix session): item **C** below — Vercel Preview possibly using production Supabase credentials — is the very next priority once the first real invoice ships. Not implemented in this session (out of scope, and doing so safely requires actually inspecting/changing live Vercel project configuration, which needs its own authorized slice). Restated here so it is not lost in a large document: **Preview deployments must never receive production Supabase credentials; Preview must use a dedicated non-prod backend; the runtime must fail closed if a Preview resolves to the production project ref; E2E/dev mutations must continue to hard-refuse production; only synthetic data is allowed outside production.**

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

To be run only after the Resend domain is verified (§4a checklist) and with your explicit go-ahead at each step. No step below was performed.

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
