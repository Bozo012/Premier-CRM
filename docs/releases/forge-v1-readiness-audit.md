# Forge V1 Release-Readiness Audit

Status: **read-only audit, complete.** No repairs, migrations, merges, or deployments were made as part of this document. Five independent reviewers (four parallel, one adversarial reconciliation pass) plus my own direct verification of the most consequential claims. Nothing here is implemented — see "Stopping point" at the end.

Audited at: `main` HEAD `cb53f59`, production serving the same commit family (Vercel `dpl_CRw8Pbyb7A8pGjEgsgYKZUeE6nAz` for the app-code commit `8da54d7`; `cb53f59` is a docs-only follow-up with no app-code diff).

---

## 1. Executive verdict

### **NOT READY**

Two confirmed, independently-verified authorization bypasses exist in shipped, production code. Both are narrow, single-function omissions with trivial fixes (the correct capability check is one line away in both cases — the actor's `role` is already resolved and simply never checked), but they are real: any signed-in organization member — including `subcontractor` and, in one case, effectively any role — can perform an operation the product's own newer, parallel code path (the triage RPC, and the estimate-driven quote-creation action) explicitly restricts to `owner`/`admin` or excludes `subcontractor` from.

**Recommended next action: Complete Batch A, rerun the affected audit slice, then tag.**

This is not a broad "the product isn't ready" verdict — the vast majority of the audited surface (lifecycle correctness, RLS/Storage/multi-org architecture, capability-matrix parity, test coverage breadth, mobile/accessibility, and the just-completed Forge/Foundry rebrand) is solid, evidenced, and matches its own documented design intent. The gap is narrowly scoped to two `actions.ts` functions plus their two immediate siblings (a data-integrity issue and a stale duplicate UI in the same file). Batch A is small, well-understood, and does not require a broader redesign, a production migration, or new architecture — it requires adding capability checks that the surrounding code in the same files already demonstrates the correct pattern for.

---

## 2. Evidence summary

- **Repository HEAD**: `cb53f59` (docs-only; app code identical to `8da54d7`, the last commit with a full documented `pnpm test`/`typecheck`/build run and production deployment).
- **Deployed production commit**: `8da54d7` / `cb53f59` (same app code), Vercel deployment `dpl_CRw8Pbyb7A8pGjEgsgYKZUeE6nAz`, state `READY`, aliased to `app.ppmnky.com`.
- **Commands run this audit** (by me directly, not just by reviewer agents): `pnpm test`, `pnpm typecheck`, `git log`/`git status`, `npx playwright test request-site-visit-workflow-bot request-conversion-bot --workers=1`, multiple direct read-only Supabase SQL queries against `premier-crm-prod`, direct file reads of the functions named in every reviewer's most severe findings.
- **Tests run**: `pnpm test` → **159/159 pass**, 0 failed, 0 skipped found. `pnpm typecheck` → clean across all 5 packages. `npx playwright test request-site-visit-workflow-bot` → **22/22 pass**, including the live capability-parity test (TS `hasCapability()` vs SQL `role_has_capability()`, every role×capability pair, 3.1s). `npx playwright test request-conversion-bot` → **2/2 failed**, but root-caused to an **audit-environment issue in this session**, not a code defect: the dev server backing this session was started with a placeholder/invalid `SUPABASE_SERVICE_ROLE_KEY` (confirmed via direct `curl` to the API route returning `{"success":false,"code":"DB_ERROR","error":"Invalid API key"}`), so the app server's own Supabase calls fail while the Playwright test process's own direct-DB fixtures (using real credentials from `.env.test`) succeed — this explains why 22 other tests using direct service-role fixtures passed while this one, which calls the live app's public API route, did not.
- **Database verification performed directly by me** (not just relayed from reviewers): production `pg_policy` on `public.payments` (confirms `payments_insert_owner_admin` RLS policy is live), production `org_members`/`auth.users`/`organizations` join for the real PPM org (confirms exact membership roster), production `organizations` row check (confirms PPM/Demo names, already verified in the prior naming-rename phase).
- **Demo workflows inspected**: read (not mutated) via `docs/implementation/premier-crm-demonstration-organization.md`, `docs/implementation/premier-crm-demo-dataset-manifest.md`, and direct code tracing of the RPCs/actions each scenario exercises. No Demo or PPM record was created, modified, or deleted during this audit.
- **PPM blank-state verification**: confirmed via direct query (Reviewer 2 and independently re-confirmed by me via the membership query above, which incidentally reconfirms PPM exists and is queryable) — 0 rows across every entity type, consistent with all prior phases' verification.
- **Areas directly proven** (code + test + DB evidence, not just inspection): capability-matrix parity (live passing test + direct code diff), RLS on `payments`/`site_visits`/Storage (direct policy queries + code), Storage upload pipeline (code inspection, matches documented architecture), quote/invoice/deposit total-recalculation correctness (existing passing regression suites), change-order exact-once incorporation (existing passing regression suite), Today action queue behavior (existing passing regression suite), Forge/Foundry branding (existing passing unit tests + live production browser verification from the immediately preceding phase).
- **Areas manually verified only** (code inspection, not executed this session): the full inspection-autosave/photo-finalization validation internals, most of the ~4,000 lines across all six `actions.ts` files beyond the capability-check pattern that surfaced the two confirmed defects, the `switch_active_org()` RPC body.
- **Areas not verified / genuinely unknown**: whether any Playwright spec beyond `request-conversion-bot.spec.ts` would fail under the currently-broken dev-server API key (only two specs were executed live this session, deliberately, to keep the audit's own footprint small and because the two most consequential findings needed direct verification, not just re-trust of the reviewer agents); full line-by-line read of every one of the 32 e2e spec files (Reviewer 3 sampled/targeted rather than exhaustively read every file); whether the `customer_archetype_defaults` missing-RLS gap (Reviewer 2, DB-verified) has ever been exploited (no evidence either way, only that it's currently possible).
- **Environment limitations**: the four parallel reviewer agents ran in isolated git worktrees without `node_modules` installed and without a reachable dev server, so their own "run pnpm test" instructions could not be fulfilled by them directly — they correctly reported this rather than fabricating results, and relied on (a) the last real documented run on identical code, and (b) their own full source reading of test-assertion bodies. I subsequently closed this gap myself by running the real commands directly in the main checkout (not a worktree), which does have a full install.

---

## 3. Findings table

| ID | Reviewer | Workflow | Observed | Expected | Evidence | Category | Severity | Confidence | Blocking | Existing coverage | Proposed regression test | Smallest repair | Batch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | R1 (independently re-verified by me and R5) | Request → direct work order | `createJobFromRequestAction` (`apps/web/app/(app)/requests/actions.ts:208-265`) resolves org membership only (`getRequestActionContext()` returns `{orgId, userId}`, never `role`), then inserts directly into `jobs` with `status: 'approved'` via the service-role client. No `hasCapability` call exists anywhere in the function or its context helper. `CreateJobButton` is rendered in `requests/[taskId]/page.tsx:262` gated only by request-state booleans (`canStartFlow`), never by role. | The same operation, via `record_request_triage(decision='direct_work_order')`, is explicitly restricted to `owner`/`admin` via `canCreateDirectWorkOrder` (`packages/shared/permissions.ts:68`), and the newer `TriagePanel` UI literally labels this option `"Direct work order (owner/admin only)"`. | Code inspection (read directly by me, independently confirmed by R1 and R5) | Security defect (authorization bypass) | Blocking | High — verified by 3 independent readers plus my own direct read | **Yes** | None — the one spec exercising this exact button (`request-conversion-bot.spec.ts`) only ever logs in as admin, never asserts denial for other roles (confirmed by reading the spec) | Add an e2e test logging in as employee/subcontractor and asserting `createJobFromRequestAction` (or the "Create work order" button) is rejected | Add `if (!hasCapability(role, 'canCreateDirectWorkOrder')) return err(ErrorCode.FORBIDDEN, ...)` to `createJobFromRequestAction` (role must first be added to `getRequestActionContext()`'s return, mirroring `getJobActionContext()`'s existing pattern) — or better, retire the raw insert and route through `record_request_triage` directly | A |
| F2 | R1 (independently re-verified by me) | Request → remote estimate | `createEstimateFromRequestAction` (`requests/actions.ts:134-200`) creates a draft estimate directly, sets `service_requests.status = 'estimate_created'`, but never calls `record_request_triage` — `triage_decision`/`triage_reason`/`triaged_at` stay `NULL` even though the request now has an estimate. | One canonical conversion path keeping `triage_decision` and the resulting entity in sync, per the triage RPC's own docstring (`docs/implementation/request-site-visit-estimate-workflow.md:86`). | Code inspection (read directly by me) | Data-integrity defect / stale legacy control | Major, not independently blocking | High | No (capability set for this action is already the broadest role set, `canCreateEstimates`, so no authorization gap — only a data-consistency gap) | None currently | Assert that after this action, `triage_decision` is non-null, or retire the action in favor of the triage RPC | Retire the legacy action/button, or make it call `record_request_triage(decision='remote_estimate')` internally | A (bundle with F1 — same file, same review) |
| F3 | R1 (independently re-verified by me and R5) | Job → draft quote (second entry point) | `createDraftQuoteAction` (`apps/web/app/(app)/jobs/actions.ts:92-126`) resolves `role` via `getJobActionContext()` (which *does* return it) but never calls `hasCapability(role, 'canCreateQuote')` — every other capability-sensitive action in the same file does (8 other `hasCapability` call sites confirmed by direct grep). The query-layer `createDraftQuote()` (`packages/db/queries/quotes.ts:911`) also performs no capability check — it's a pure data function. | `canCreateQuote: ['owner','admin','employee']` excludes `subcontractor` (`packages/shared/permissions.ts:80`). The parallel estimate-driven path, `createQuoteFromEstimateAction` (`estimates/actions.ts:210-226`), correctly checks this capability. | Code inspection (read directly by me, independently confirmed by R1 and R5) | Security defect (authorization bypass) | Blocking | High — verified by 3 independent readers plus my own direct read down to the query layer | **Yes** | None found | Add an e2e test asserting a subcontractor-role session is denied `createDraftQuoteAction` | Add `if (!hasCapability(access.data.role, 'canCreateQuote')) return err(ErrorCode.FORBIDDEN, ...)` immediately after the context check, before calling `createDraftQuote()` | A (one-line fix, same PR as F1) |
| F4 | R1 (independently re-verified by me) | Request-detail page UI | Both the legacy `CreateEstimateButton`/`CreateJobButton` and the newer, correct `TriagePanel` render simultaneously on the same request-detail view, with no visual/role signal distinguishing the safe canonical path from the unsafe legacy one — both are gated only by the same request-state booleans. | One canonical UI entry point, or an explicit signal. | Code inspection (read directly by me) | Stale legacy control / duplicate path (UI-level root cause of F1/F2's exposure) | Major (compounds F1) | High | No | N/A (UI, not itself independently testable as a "defect" beyond F1/F2's tests) | Remove/hide the legacy buttons once F1/F2 are fixed, or gate their rendering by `hasCapability(role, 'canCreateDirectWorkOrder')`/route them through the triage flow | A (same PR) |
| F5 | R2 (independently re-verified by me and R5 — **REFUTED**) | Invoice → payment recording | Reviewer 2 claimed `recordPayment()` has no SQL-layer capability check, relying only on TS-layer gating plus org-membership-only RLS. | — | **Direct production query by me**: `pg_policy` on `public.payments` shows `payments_insert_owner_admin` (`WITH CHECK role IN ('owner','admin')`), from migration `20260731000000_invoices_payments_owner_admin_write.sql`, confirmed applied in production. R2 was checking a stale RLS state (`org_isolation_payments`) that this migration explicitly `DROP POLICY IF EXISTS`'d before this review cycle. | Database verification (by me, independently) | Not a defect | N/A | High (directly queried) | **No** | No test currently proves this RLS policy is enforced (a real, if minor, coverage gap — the protection exists but isn't regression-tested) | Add a Playwright test attempting a direct `payments` insert as an employee-role authenticated client, asserting RLS denial (mirrors the existing `site_visits` customer-denial pattern already in `request-site-visit-workflow-bot.spec.ts`) | B (regression coverage only, not a repair) |
| F6 | R2 (DB-verified, independently re-confirmed by R5) | Platform-wide config table | `customer_archetype_defaults` has RLS **disabled** (production Supabase security advisor, ERROR level), globally writable by any `authenticated` user across any org (`0007_catalog_reconciliation.sql:85-97`, granted in `0010_...sql:155`). | Org-scoped or admin-only write access, matching every other table's pattern. | Database verification (Supabase advisors) + code inspection | Security defect (missing RLS) | Low-medium — cross-tenant blast radius but non-sensitive reference data (archetype defaults, not customer/financial data) | High | Not itself blocking — see note | No | A migration adding an RLS policy (owner/admin write, open or org-scoped read) | B — real, confirmed, but low enough sensitivity that it doesn't force NOT READY by itself; flagged for Kevin's judgment call (see §8) |
| F7 | R2 (DB-verified, independently re-confirmed by me) | Production access hygiene | Two e2e-test-purposed accounts (`e2e-admin-bot@example.com`, role `admin`; `delivered+e2e-employee-persistent@resend.dev`, role `employee`) hold standing **active** membership in the real PPM production organization, confirmed by my own direct query alongside Kevin (owner), Brandon Fleenor (employee — see F9), and Kevin's second employee account. | Test-purposed credentials should not hold standing elevated access to the real business org, especially once it holds real business data. | Database verification (by me, independently) | Security/operational hygiene defect | Medium — no data at risk today (PPM is blank) but real standing risk once PPM is populated | High | N/A | N/A (not a code defect, an access-cleanup action) | Remove or demote these two accounts from the PPM org (data/access action, not a code change) | B — recommend before V1 goes live with real PPM data, not before the tag itself |
| F8 | R2 (informational) | Documentation accuracy | Docs describe "the temporary driver identity" (singular) for Demo population; direct query found **two** inert driver accounts, both correctly zero-membership/banned. | — | Database verification | Stale documentation (cosmetic) | Cosmetic | High | No | N/A | N/A | Correct the count in the historical doc, or leave as an acceptable imprecision (historical-record policy applies) | D |
| F9 | R2 (informational, independently re-confirmed by me) | Documentation accuracy | `docs/implementation/brandon-demo-onboarding-and-observation.md` (dated 2026-08-03) states Brandon's "PPM membership: None," but he now holds an active PPM employee membership — my own direct query confirms this, timestamped consistent with a normal self-service invite-accept completing after the doc was written. | — | Database verification | Stale documentation, likely a legitimate real-world event postdating the snapshot | Cosmetic/informational | High | No | N/A | N/A | Update the doc, or leave per historical-record policy (this one is arguably "current state," not "historical," so an update is reasonable) | D |
| F10 | R3 | Test coverage | No Playwright spec directly asserts that a customer-portal/anon client is denied direct read/write access to the `customers` table (cross-org denial for `customers` is only implicitly covered via staff-scoped fixtures; the equivalent explicit denial test exists for `site_visits` but not `customers`). | Explicit denial test matching the `site_visits` pattern. | Code inspection (test-file reading) | Test defect (coverage gap) | Low | Medium — not independently re-verified by me via execution, but the absence was confirmed by grep/reading | No | N/A | Add a test mirroring the existing `site_visits` customer-client-denial pattern, targeting `customers` | B |
| F11 | Me (discovered during evidence-gathering, root-caused) | Test infrastructure (this audit session only) | `request-conversion-bot.spec.ts` fails both its tests with `TypeError: Cannot read properties of undefined (reading 'ticket_id')` when run against this session's dev server. | Test should pass (it did, presumably, in prior sessions per its being an established, referenced spec). | Direct `curl` reproduction: the app server's `/api/v1/service-requests` route returns `{"success":false,"code":"DB_ERROR","error":"Invalid API key"}` — the dev server backing this audit session was started with a placeholder/invalid Supabase service-role key, not real credentials. | Environment/process failure (this session only) | N/A | High (directly reproduced and root-caused) | No — not a code regression | N/A | N/A — restart the dev server with real credentials to re-verify; not a repair to the codebase | Not applicable — flagged so it isn't mistaken for a new product regression by anyone reading this report | N/A (informational) |
| F12 | R4 | Site-visit photo upload | `photo-upload.tsx:44` — `toast.error(\`Upload failed: ${uploadError.message}\`)` surfaces raw Supabase Storage error text to the user, bypassing the `toUserFacingError()` translator used elsewhere in the app (same defect class as the pricing-approval raw-error fix from a prior phase). | User-facing, translated error messages, consistent with the rest of the app. | Code inspection | Application defect (cosmetic/UX) | Major UX issue, not blocking (upload still fails safely, no data corruption) | High | No | No | Wrap the storage-error branch with a small message-translation map (network/size/mime-type cases) | C |
| F13 | R4 | App-wide touch targets | Shared `Button` `sm` variant is `h-8` (32px), below the project's own documented ~44px minimum (`base44-handoff.md` §12), used by 23+ files including core pricing-review/quote/invoice action buttons. | 44px minimum per the project's own accessibility standard. | Code inspection | Base44 redesign candidate | Non-blocking (buttons are functional; this is a documented-standard compliance gap, not a broken workflow) | High | No | No | N/A — broad, cross-cutting change | Flag explicitly in the Base44 handoff doc as an input item; not a V1-scoped fix | D |
| F14 | R2/R3 (confirmed, not a defect) | Capability enforcement | TypeScript `CAPABILITIES` map and SQL `role_has_capability()` are in exact parity across all 19 capabilities × 5 roles — confirmed by direct code diff (R2) and by a **live passing Playwright test** I executed myself (`request-site-visit-workflow-bot.spec.ts`'s capability-parity test, 3.1s, pass). | — | Passing test (executed by me) + code inspection | Not a defect | N/A | Very high (live execution, not just static reading) | No | Already covered | N/A | N/A |

---

## 4. Coverage matrix

| Workflow | Code inspected | Unit tested | E2E tested | Production/Demo verified | Portal verified | DB verified | Missing evidence |
|---|---|---|---|---|---|---|---|
| Public/service request intake | ✅ | — | Partially (blocked this session by F11's env issue; spec exists) | ✅ (Demo scenarios) | N/A | — | Live UI click-through not re-proven this session |
| Triage: remote_estimate | ✅ | — | Partially (fixture-level, not full UI-driven per R3) | ✅ | N/A | — | Full UI-driven single-spec proof |
| Triage: site_visit_required | ✅ | — | ✅ (`request-site-visit-workflow-bot`, 20/20 live-passing this session) | ✅ | N/A | ✅ | — |
| Triage: direct_work_order (RPC path) | ✅ | — | ✅ (same suite, DWO authorization block, live-passing) | ✅ | N/A | ✅ | — |
| **Legacy direct-work-order path (F1)** | ✅ | — | ❌ (no role-denial assertion exists) | — | N/A | — | **This is the confirmed gap** |
| Site-visit lifecycle (schedule/reschedule/start/inspect/complete) | ✅ | — | ✅ (live-passing) | ✅ | N/A | ✅ | — |
| Pricing-review handoff (submit/approve/return/resubmit) | ✅ | — | ✅ (existing suites, not re-executed this session but recently verified in the prior phase, 14/14) | ✅ | N/A | — | Not re-executed this session |
| Today action queue | ✅ | — | ✅ (7/7, recently verified) | ✅ | N/A | — | Not re-executed this session |
| Quote creation (estimate-driven) | ✅ | — | Inferred covered | ✅ | N/A | — | — |
| **Quote creation (job-driven, F3)** | ✅ | — | ❌ (no role-denial assertion exists) | — | N/A | — | **This is the confirmed gap** |
| Quote totals correctness | ✅ | — | ✅ (recently verified, 4/4) | ✅ | N/A | — | Not re-executed this session |
| Deposit/working/final invoice totals | ✅ | — | ✅ (recently verified) | ✅ | N/A | — | Not re-executed this session |
| Change-order exact-once incorporation | ✅ | — | ✅ (per R3's reading) | ✅ | ✅ (portal actions) | — | Not re-executed this session |
| Payment recording authorization | ✅ | — | ❌ (no dedicated test, though RLS protection confirmed live) | — | N/A | ✅ (RLS policy confirmed by me) | Regression test for the RLS policy itself |
| Multi-org switching | ✅ | — | ✅ (per R3's reading) | ✅ | N/A | — | Not re-executed this session |
| Portal-safe projection (customer-facing site-visit data) | ✅ | — | ✅ (per R3's reading, `site_visits` denial confirmed) | — | ✅ | ✅ (no RLS grant at all, `SECURITY DEFINER` narrow projection) | — |
| Customer table direct-access denial | — | — | ❌ (F10, gap) | — | — | — | **Explicit test missing** |
| Storage finalization pipeline | ✅ | ✅ (vitest, not re-executed this session — `sharp` unavailable in reviewer worktrees, available in main checkout but not re-run) | — | ✅ | N/A | — | Not re-executed live this session |
| Capability parity (TS vs SQL) | ✅ | — | ✅ (**live-executed by me this session**, pass) | — | N/A | ✅ | — |
| Forge branding | ✅ | ✅ (159/159 includes these, re-executed this session) | — | ✅ (live browser, prior phase) | ✅ | — | — |
| PPM tenant-branding preservation | ✅ | ✅ (re-executed this session) | — | ✅ (live browser, prior phase) | ✅ | — | — |

---

## 5. Naming/rebranding inventory (current status, from the just-completed prior phase, re-confirmed here)

- **Forge product references verified**: root/login title "Forge" (live production, verified prior phase), PWA manifest "Forge" (live), staff sign-in "Sign in to Forge" (live), internal staff-notification email template (unit-tested, re-executed this session, pass).
- **Foundry umbrella references verified**: confined to architecture/planning documentation only (`docs/architecture/forge-foundry-brand-boundaries.md`, the naming audit, this document) — confirmed via repository search, zero occurrences in live application code or UI strings.
- **PPM business references preserved**: organization name (`Premier Property Maintenance LLC`, confirmed by my own direct query this session), public website unchanged (confirmed prior phase, live browser), all customer-facing email templates confirmed via unit test (re-executed this session, pass) to say "Premier Property Maintenance," never "Forge"/"Foundry".
- **Unresolved software-product uses of "Premier CRM"**: none found that are active/product-facing. Remaining matches (re-confirmed via repository search this session) are: historical narration in dated deployment/cleanup reports (preserved per policy), stable technical identifiers (Supabase/Vercel project names/refs, migration filenames, `package.json` name), and ~10 non-customer-facing test-suite file-header comments (e.g. "Auth helpers for the Premier CRM bot suite") — deferred, low-risk, explicitly classified as such in the prior phase's audit.
- **Stable identifiers intentionally unchanged**: GitHub repo name (`Premier-CRM`), `@premier/*` package scope, Supabase project names/refs, Vercel project name, all domains, environment variable names.
- **Historical references preserved**: confirmed unedited (spot-checked `docs/production/deployments/*.md`, `docs/implementation/premier-crm-demonstration-organization.md`).
- **Customer-facing branding verification**: re-confirmed this session via the same passing unit tests (`branding.test.ts`, `email.test.ts`) that were added and verified live in the immediately preceding phase.
- **Ambiguous cases requiring later migration**: none new. The one previously-flagged item (whether the Demo organization's **slug** should ever change, distinct from its already-changed display name) remains explicitly deferred per Kevin's prior decision — not re-opened here.

---

## 6. Ordered implementation batches

### Batch A — Release-blocking correctness/security defects
**Finding IDs**: F1, F2, F3, F4 (all in the same two files, natural to fix together).
**Dependency order**: F1 and F3 first (the actual security fixes — each is a single added `if (!hasCapability(...))` guard); F2 and F4 alongside (data-integrity/UI cleanup in the same review, since fixing F1 properly likely means retiring or re-routing the legacy `createJobFromRequestAction`/`createEstimateFromRequestAction` actions, which naturally resolves F2 and F4 too).
**Test requirements**: new Playwright coverage asserting employee/subcontractor denial for the direct-work-order legacy path (F1) and subcontractor denial for job-driven quote creation (F3); an assertion that `triage_decision` stays in sync (F2).
**Estimated scope**: small — two `actions.ts` files, ~10-30 lines of changes plus new test cases. No new tables, no new RPCs required (though routing through the existing `record_request_triage` RPC instead of the raw insert is the more architecturally correct fix for F1/F2, and only marginally larger in scope than a bare capability-check addition).
**Risk**: low — the correct pattern already exists twice in the same codebase (the triage RPC for F1/F2, `createQuoteFromEstimateAction` for F3) to copy from.
**Production migration needed**: No.

### Batch B — Missing critical regression coverage + confirmed-but-lower-severity defects
**Finding IDs**: F6 (RLS gap on `customer_archetype_defaults`), F7 (e2e-bot accounts on real PPM org — an access-cleanup action, not code), F10 (customers-table denial test), plus a new regression test proving the already-live `payments_insert_owner_admin` RLS policy (F5, refuted as a defect, but undertested).
**Dependency order**: independent of each other and of Batch A; can proceed in parallel.
**Test requirements**: RLS-denial Playwright tests for `customers` and `payments`, matching the existing `site_visits` pattern.
**Estimated scope**: small — one migration (RLS policy for `customer_archetype_defaults`), two new test files/cases, one manual access-cleanup action (F7, not code).
**Risk**: low.
**Production migration needed**: Yes, for F6 only (a scoped RLS-enabling migration, analogous in size/risk to the recent Demo-org-display-name migration).

### Batch C — High-value mobile/usability issues appropriate before V1
**Finding IDs**: F12 (raw Storage upload error leakage).
**Dependency order**: independent.
**Test requirements**: none strictly required (cosmetic), though a light assertion that upload-error toasts never contain raw driver text would be cheap insurance, mirroring the `branding.test.ts`/`email.test.ts` pattern of asserting absence of unwanted strings.
**Estimated scope**: very small — one small message-translation map, reusing the existing `error-translation.ts` pattern.
**Risk**: none.
**Production migration needed**: No.

### Batch D — Non-blocking polish and post-V1/Base44 work
**Finding IDs**: F8, F9 (documentation-accuracy corrections), F13 (Button `sm` touch-target size — Base44-scoped), plus everything already documented as deferred from the prior phase (hazards-section proposal, request-list density recommendation, `loading.tsx` skeletons, broader aria-label coverage, `tests/e2e/README.md` staleness).
**Dependency order**: none — fully independent, can proceed whenever, does not block V1 in any ordering.
**Estimated scope**: varies, all individually small; none require a migration.
**Risk**: none.
**Production migration needed**: No.

---

## 7. Release gate checklist

- [x] Forge name applied correctly (live production, verified prior phase and re-confirmed via passing unit tests this session)
- [x] PPM branding unchanged (live production, verified prior phase; DB-confirmed unchanged this session)
- [x] Production deployment identified (`8da54d7`/`cb53f59`, `dpl_CRw8Pbyb7A8pGjEgsgYKZUeE6nAz`, READY)
- [x] Migrations reconciled (confirmed in prior phase via `supabase migration list --linked`; no new migrations since)
- [x] PPM blank (confirmed by direct query this session)
- [x] Demo healthy (confirmed by direct query this session — memberships/customers/properties/requests/invoices all present and correct)
- [x] RLS intact — **with one confirmed exception** (F6, `customer_archetype_defaults` — real gap, low sensitivity, see §8 for whether it blocks)
- [x] Capability parity green (live-executed passing test this session)
- [x] Storage private (code-inspection confirmed, matches documented architecture)
- [x] Portal safe (code-inspection + RLS-absence confirmed for `site_visits`, narrow `SECURITY DEFINER` projection function)
- [x] Quote/invoice totals correct (existing regression suites, recently verified, not re-executed live this session but no code has changed in that area since)
- [x] Pricing-review handoff works (existing regression suites, recently verified)
- [x] Today action queue works (existing regression suites, recently verified)
- [x] Known flakes classified (employee-onboarding-admin-invite-bot, data-consistency-bot invoice-total flake — both pre-existing, documented, not newly investigated this audit)
- [x] Base44 not yet begun (confirmed — no Base44 code exists anywhere in the repository)
- [x] Forge V1 tag not yet created (confirmed — no git tags exist matching this pattern)
- [ ] **Two confirmed authorization-bypass defects (F1, F3) remain unfixed** — this is the one checklist item currently failing, and the reason for the NOT READY verdict

---

## 8. Decisions requiring Kevin

1. **Does F6 (RLS disabled on `customer_archetype_defaults`) block the V1 tag, or can it ship in a fast-follow alongside Batch B?** The data itself is non-sensitive (archetype defaults, not customer/financial records), but the gap is real and cross-tenant. My recommendation: does not need to block Batch A's fix from shipping and tagging, but should not be left indefinitely either.
2. **Should the two e2e-bot accounts (F7) be removed from the real PPM organization before or after the V1 tag?** No code change is involved — this is a data/access decision. Low urgency while PPM stays blank, but the risk grows the moment real PPM data is entered.
3. **Is the "add capability check" minimal fix sufficient for F1, or should `createJobFromRequestAction`/`createEstimateFromRequestAction` be retired entirely in favor of routing through `record_request_triage`?** The minimal fix closes the security gap; the fuller fix also resolves F2 (triage-state desync) and F4 (duplicate UI) in the same pass. This is a scope decision for whoever implements Batch A, not a technical question — recommend the fuller fix given it's the same order of effort and resolves three findings instead of one.
4. **Should the Base44 compatibility spike proceed before or after the V1 tag, now that this readiness audit exists?** Not addressed by this audit — this document only establishes whether the *current* product is fit to be called V1, not the sequencing of what comes after. Per the naming audit's release gate, the original intended order was: naming rename → V1 readiness audit → Base44 spike → V1 tag. This audit's NOT READY verdict means that sequencing question is currently moot until Batch A lands and this audit's blocking items are cleared.
5. **Global (non-per-org) numbering sequences** (pre-existing, documented, not re-investigated this audit) — already flagged in `docs/SESSION_STATE.md` as "recommended before Platform v1.0." This audit did not re-litigate that recommendation; it remains open and is explicitly Kevin's call per the existing documentation.
6. **Resend/transactional email configuration** — pre-existing, documented, not re-investigated. No workflow was found this audit to hard-depend on email delivery succeeding (all notification sends are best-effort/non-blocking, confirmed by Reviewer 1's code reading) — so this does not block V1 on functional grounds, but remains an open product decision on whether customers should be receiving real transactional email at V1 launch.

---

## Stopping point (original audit, 2026-08-03)

Per instruction, this audit stops here. No repairs were implemented, no migrations were created, no code was merged, nothing was deployed, Resend was not configured, no PPM data was altered, no repositories/domains/infrastructure were renamed, Base44 was not started, and Forge V1 was not tagged.

Waiting for explicit selection of: Batch A, Batch B, Batch C, Batch D, the V1 tag, or the Base44 compatibility spike.

---

## Batch A — Production Verification (2026-08-03, dated addendum — original audit evidence above is unmodified)

Status: Batch A (Findings F1, F2's-sibling-fix-scope, F3, plus the database-boundary hardening found during validation) is implemented, merged, deployed to production, and independently verified in production. This section records that verification. It does not alter anything in the sections above.

### Timeline and artifacts

- **PR #92** (`fix/forge-v1-batch-a-authorization`) — action-layer fix (commit `26df65b`) + database-boundary fix (commit `623d0a9`) — **merged** via squash, merge commit **`9cd737b`**.
- **PR #91** (this audit document) — **merged** via squash immediately prior to this addendum, merge commit `2dbe8a7`, so this document could live on `main` for the addendum below. Original audit content above is byte-identical to what PR #91 contained; only this addendum is new.
- **main HEAD**: `2dbe8a7` (PR #92 then PR #91, in that order).
- **Production deployment**: Vercel `dpl_Toh88Xdwgn6Zx6PtBLJavbyxvWBv`, state `READY`, aliased to `app.ppmnky.com`, confirmed serving commit `9cd737b` (the PR #92 merge commit) before the migration was applied.
- **Migration**: `supabase/migrations/20260803070000_harden_jobs_and_quote_creation_boundary.sql`, applied to `premier-crm-prod` (`apnbpcauqrjvkoleisde`) via `npx supabase db push --linked` after confirming a dry run showed exactly this one migration pending.

### Prior vs. new grants/policies (production, directly queried)

| | Before | After |
|---|---|---|
| `jobs` grants (`authenticated`) | SELECT, INSERT, UPDATE, DELETE | **SELECT only** |
| `quotes` grants (`authenticated`) | SELECT, INSERT, UPDATE, DELETE | **SELECT only** |
| `jobs` grants (`service_role`) | full (SELECT/INSERT/UPDATE/DELETE/...) | **unchanged** |
| `quotes` grants (`service_role`) | full | **unchanged** |
| `jobs` policy | `org_isolation_jobs` (`FOR ALL`, org-only) | `jobs_select_org_members` (`FOR SELECT` only) + `customer_select_own_jobs` (unchanged) |
| `quotes` policy | `org_isolation_quotes` (`FOR ALL`, org-only) | `quotes_select_org_members` (`FOR SELECT` only) |
| `service_requests` / `activity_log` | unchanged | **unchanged** (confirmed by direct query — not touched by this migration) |

### Production denial evidence (**production-executed**, not E2E)

Verified directly against `premier-crm-prod` using real, already-existing production accounts (Kevin — owner on both PPM and Demo; `e2e-admin-bot@example.com` — admin, PPM only; `delivered+e2e-employee-persistent@resend.dev` — employee, PPM only), via `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"<real user id>"}'` inside a transaction (each attempt either errored — auto-aborting the transaction — or was explicitly rolled back; zero commits occurred in any of the checks below):

- **Owner** (Kevin, real PPM owner) — direct `jobs` INSERT into PPM: **denied**, `42501 permission denied for table jobs`.
- **Admin** (`e2e-admin-bot`, real PPM admin) — direct `jobs` INSERT into PPM: **denied**, same error.
- **Employee** (`delivered+e2e-employee-persistent`, real PPM employee) — direct `jobs` INSERT into PPM: **denied**, same error.
- **Cross-org** (`e2e-admin-bot`, PPM-only, not a Demo member) — direct `jobs` INSERT into Demo's `org_id`: **denied**, same error (grant-level denial fires before RLS/org-membership is even evaluated).
- **Employee** — direct `quotes` INSERT into PPM: **denied**, `42501 permission denied for table quotes`.
- **Owner** (Kevin, real Demo owner) — direct `quotes` INSERT into Demo: **denied**, same error.
- **Cross-org** (`e2e-admin-bot`) — direct `quotes` INSERT into Demo: **denied**, same error.
- **UPDATE** (Kevin, real Demo owner) on a real existing Demo job (`3a406c47-...`, "Deck repair"): **denied**, `42501 permission denied for table jobs`. Row confirmed unchanged afterward (`title` still "Deck repair").
- **DELETE** (Kevin, same job): **denied**, same error. Row confirmed still present.
- **SELECT still works correctly**: Kevin (real Demo owner) selecting Demo `jobs` → returns 2 rows (matches known count). `e2e-admin-bot` (PPM-only) selecting Demo `jobs` → returns 0 rows (RLS-filtered, not an error — correct cross-org SELECT behavior, unaffected by this migration since SELECT was never revoked).
- **Zero side effects confirmed**: post-check query shows `ppm_jobs=0`, `ppm_quotes=0` (unchanged), `demo_jobs=2`, `demo_quotes=3` (unchanged from the pre-migration baseline), and zero rows matching the test-attempt title pattern anywhere.

**Subcontractor and viewer roles do not currently exist as accounts in production** (only owner/admin/employee are populated) — their denial is **E2E-only evidence**: `authorization-batch-a-bot.spec.ts` tests 7–8 (subcontractor/viewer INSERT denial on `jobs`) and test 12 (subcontractor INSERT denial on `quotes`), run against `premier-crm-e2e` with the identical migration applied. Given the migration removes the `authenticated` grant entirely (not a role-conditional policy), this is a uniform mechanism — the owner/admin denial already proven in production is the *strongest* case, and subcontractor/viewer would fail through the identical grant-level check, not a role-specific branch that could behave differently. Flagged explicitly per instruction rather than asserted as production-proven.

### Legitimate workflow evidence

- **E2E-only** (identical migration + identical app commit family, run against `premier-crm-e2e` this same day): `integrated-lifecycle-bot` (accepted-quote → exactly one job, idempotent on duplicate acceptance), `quote-response-bot`, `scheduling-bot` (`apply_job_scheduling()` RPC path), `estimate-pricing-review-handoff-bot`, `request-site-visit-workflow-bot` (including the live capability-parity test), `request-conversion-bot` (the legitimate admin-role direct-work-order conversion path) — 38/38 passing.
- **Production read-only + code-path inspection**: every jobs/quotes write path was audited before writing the migration (staff server actions, the customer share-token portal action, every `SECURITY DEFINER` RPC) and confirmed to use either `createServiceClient()` (service-role, unaffected by the `authenticated` REVOKE) or `apply_job_scheduling()` (RPC, `SECURITY DEFINER`, also unaffected). No client-side component anywhere in `apps/web` writes to `jobs`/`quotes` directly (confirmed by repository-wide grep). This was not re-executed as a new production write in this phase — it is the same audit performed before the migration was written, re-cited here as the basis for why no production functional regression was expected, combined with the direct production SELECT checks above confirming the schema/data itself is intact and reachable.
- No new job, quote, invoice, deposit, or change-order was created in production as part of this verification — all production checks were either pure reads or writes inside a transaction that errored or was explicitly rolled back.

### Test totals (this phase)

- `pnpm test`: 180/180 (unchanged from Batch A implementation, re-confirmed before merge).
- `authorization-batch-a-bot.spec.ts`: 15/15 (E2E, `premier-crm-e2e`).
- Affected regression suite: 38/38 (E2E, `premier-crm-e2e`).
- `pnpm typecheck`: clean.
- `pnpm --filter web build`: clean.
- Production: 12 direct-write denial checks + 2 SELECT-behavior checks + row-integrity checks, all as documented above — 0 failures, 0 unexpected successes, 0 side effects.

### PPM blank-state and Demo health confirmation

- PPM (`a0000000-0000-0000-0000-000000000001`): 0 customers, 0 jobs, 0 quotes — unchanged before and after this entire phase.
- Demo (`a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`, "Forge Demonstration"): 2 customers, 2 jobs, 3 quotes — unchanged before and after this entire phase.
- 2 organizations total in production — no new organization created or removed.

### Finding disposition

- **F1 (direct-work-order authorization bypass)**: **CLOSED.** Action layer (capability check + hidden UI) and database layer (RLS + grants) both verified in production.
- **F3 (draft-quote-from-job authorization bypass, plus its two sibling bypasses in `quotes/actions.ts`)**: **CLOSED.** Same two-layer verification.
- **F2 (`createEstimateFromRequestAction` triage-state desync)**: unchanged, still open, explicitly out of Batch A scope.
- **F4 (duplicate legacy/canonical UI on the request-detail page)**: unchanged, still open, explicitly out of Batch A scope.
- **New finding — `service_requests` broad-authenticated-write pattern** (discovered during the database-boundary audit for Batch A, documented in the migration's own comments and the prior implementation report): **NOT CLOSED, and explicitly not classified as closed.** Classification: **a candidate for a future, separate security-focused batch — not Batch B general coverage, not Batch D cosmetic hardening, and not a V1 blocker.** Reasoning: `service_requests` retains a broad `internal_org_service_requests` (`FOR ALL`, org-membership-only) policy, meaning a signed-in org member could directly write `triage_decision`, `job_id`, or `estimate_id` without calling `record_request_triage()`. Concrete impact: this could forge a request's triage-audit trail or misattach an already-existing job/estimate to a request, which is a data-integrity/audit-trail concern — but with `jobs`/`quotes` INSERT now closed, it **cannot** be used to fabricate a *new* unauthorized job or quote the way F1/F3 could. It is therefore materially narrower than the closed findings and does not block the V1 tag on its own; it should be tracked and fixed deliberately rather than folded into this migration's scope (which was correctly limited to the two confirmed Batch A-equivalent operations).
- **F5 (Reviewer 2's `payments` RLS claim)**: remains **REFUTED**, unchanged from the original audit — not re-touched this phase.
- **F6 (`customer_archetype_defaults` missing RLS)**: remains open, unchanged, still a Kevin decision per §8 item 1 of the original audit.
- **F7 (e2e-bot accounts with standing PPM access)**: remains open, unchanged, still a Kevin decision per §8 item 2 — and directly relevant here, since two of those same accounts (`e2e-admin-bot@example.com`, `delivered+e2e-employee-persistent@resend.dev`) were the ones used for this phase's production verification (a real, if narrow, secondary justification for keeping them a little longer, though the underlying access-cleanup decision remains Kevin's).

### Revised release verdict

**READY WITH NON-BLOCKING FOLLOW-UPS.**

Both confirmed release-blocking findings (F1, F3, plus their sibling bypasses) are closed at both the application and database layers, verified independently in production with zero side effects and zero regressions to legitimate workflows. The remaining open items (F2, F4, F6, F7, and the newly-discovered `service_requests` pattern) are all narrower in scope and severity than the original two blockers, do not enable fabrication of new unauthorized business records, and are appropriately deferred to future batches per Kevin's explicit scope control on this migration.

---

## Stopping point (production verification phase, 2026-08-03)

Per instruction, this phase stops here. PR #92 is merged and deployed; the migration is applied to production and verified; PR #91's original audit evidence is unmodified above. Forge V1 has not been tagged. Batches B, C, and D have not been started. `service_requests` hardening has not been started. The Base44 compatibility spike has not been started.

Waiting for explicit approval before tagging Forge V1 or beginning another batch.
