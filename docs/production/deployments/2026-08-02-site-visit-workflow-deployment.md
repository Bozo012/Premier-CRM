# Production Deployment — Request → Site Visit → Estimate → Quote Workflow

**Date:** 2026-08-02
**Production project:** `premier-crm-prod` (`apnbpcauqrjvkoleisde`)
**Status:** Deployed, migrated, smoke-validated, cleaned up. **No production business data was left behind.** Draft quote acceptance/job/invoice/payment were explicitly not exercised.

---

## 1. Merges

| Repo | PR | Merge commit | Result |
|---|---|---|---|
| `premier-property-maintenance` (marketing site) | [#5](https://github.com/Bozo012/premier-property-maintenance/pull/5) | `8807fa9` | Merged, auto-deployed to production (Vercel), diff confirmed limited to `src/app/pages/RequestService.tsx` |
| `Premier-CRM` | [#80](https://github.com/Bozo012/Premier-CRM/pull/80) | `15078a3` | Merged, auto-deployed to production (Vercel) |
| `Premier-CRM` (hotfix, see §2) | [#81](https://github.com/Bozo012/Premier-CRM/pull/81) | `7334c3a` | Merged, auto-deployed to production (Vercel) |

Final production CRM commit: **`7334c3a68f0d2839fa36d24adb2605b1209bbb95`**.
Final production marketing-site commit: **`8807fa982ec7d106ca4f799325b00f2bdd7ea2d8`**.

## 2. Production authorization defect found during controlled validation — found, fixed, deployed

**Discovery**: while exercising the approved capability-proof matrix against production (temporary smoke-test accounts, real RPC calls), source inspection revealed that `sendQuoteAction()` and `resendQuoteEmailAction()` (`apps/web/app/(app)/quotes/actions.ts`) authorized via the pre-existing, broader `canSendEstimates` capability (`owner/admin/employee/subcontractor`) instead of the new `canSendQuote` capability (`owner/admin/employee` only) that PR #80 introduced. `canSendQuote` existed in the capability matrix (TypeScript + SQL, covered by the TS/SQL parity test) but had never been wired into any actual authorization check.

**Affected action**: quote sending (both the initial send and the resend-email path). No other action was affected — a full-app grep confirmed these are the only two quote-send entry points.

**Incorrect capability**: `canSendEstimates`.
**Correct capability**: `canSendQuote`.

**Was any unauthorized quote sent?** No. The defect was identified by source inspection during controlled validation, before it was ever exercised. The smoke-test draft quote (`c83b1dd2-9ebe-493f-be27-6bfa51655f25`, since deleted in cleanup) was held in `draft` status — not sent — until the fix was live in production. No evidence was found of prior misuse in production activity logs for this action; this is stated as "no evidence found," not as a claim that no legitimate quote could ever have been sent by a subcontractor before this fix, since that would require an exhaustive historical audit of every quote-send event and every actor's role at the time it happened, which was not performed. The org has 4 real staff members; only one (`sommerskevin3@gmail.com`) holds `employee` and none hold `subcontractor`, which limits realistic historical exposure, but this is a scope observation, not a formal audit finding.

**Containment**: found, contained (quote left in draft), reported to the requester, and fixed within the same working session before any further smoke-chain progression.

**Hotfix**: `Premier-CRM` PR #81, commit `9a376b3` (merge commit `7334c3a`). Changed files: `apps/web/app/(app)/quotes/actions.ts` (2-line capability-key change), new `apps/web/app/(app)/quotes/actions.test.ts` (9 tests).

**Regression tests added**: prove the authorization boundary directly at the server-action call site (not a hidden UI button) for both entry points — owner/admin/employee allowed, subcontractor/viewer denied with zero DB write and zero email attempt on denial; `canSendEstimates` no longer controls sending; `canCreateQuote` does not implicitly grant `canSendQuote`.

**Adjacent capability audit**: the other 6 capabilities PR #80 introduced (`canTriageRequests`, `canCreateDirectWorkOrder`, `canEditEstimate`, `canApproveEstimatePricing`, `canCreateQuote`) all have confirmed real RPC-level enforcement. `canManageInspectionTemplates` is intentionally unused — no template-management RPC or UI ships in this PR (RLS policies exist for it, but the base table grant is SELECT-only, so it fails safe). No other live bypass was found.

**Validation before this hotfix was deployed**: `pnpm typecheck` clean, `pnpm test` 113/113 (104 + 9 new), `pnpm --filter web build` clean, workflow bot 20/20 (including capability parity), `quote-response-bot` and `estimates-lifecycle-bot` re-verified clean in isolation against `premier-crm-e2e`.

**Production role-verification results (post-hotfix, against real production data)**:
- Subcontractor (real signed-in session, real org lookup, real `hasCapability` check): denied `canSendQuote`. Quote remained `draft`/`sent_at: null` before and after the attempt.
- Employee (real signed-in session, real org lookup, real `hasCapability` check): allowed. Quote transitioned to `sent` exactly once, `sent_at` set.
- **Honest methodology note**: this was proven by calling the real `getActiveOrgContext()`/`hasCapability()` functions with genuine authenticated sessions and genuine production data, then replicating the real action's DB mutation verbatim — not by invoking the literal Next.js HTTP Server Action endpoint. A true black-box HTTP-level test was not performed because doing so would have required either signing out the real, actively-logged-in staff session sharing the same browser profile (unacceptable), or reverse-engineering Next.js's internal Server Action wire protocol (not attempted given time constraints). The unit tests in `actions.test.ts` additionally exercise the literal, unmodified action functions with mocked I/O, which is a second, independent proof of the same boundary.

## 3. Production migration result

18 migrations dry-run (clean) then applied via `supabase db push` (not the raw `apply_migration` MCP tool, so production's `schema_migrations` version numbers match the local filenames exactly — no cosmetic mismatch like the earlier e2e sandbox history).

All 18 confirmed applied via `list_migrations`. Post-apply verification: 6 new tables exist (`site_visits`, `site_visit_appointments`, `inspection_templates`, `inspection_template_versions`, `estimate_line_items`, `pending_uploads`), RLS enabled on all 6, all expected new columns present on `service_requests`/`estimates`/`jobs`/`vault_items`/`activity_log`, `save_site_visit_inspection` confirmed **not** executable by `authenticated` (only `postgres`/`service_role`), `site-visit-attachments` Storage bucket exists (`public: false`, 15MB limit, `image/jpeg`/`image/png` only), Storage policies scoped only to that bucket with the pending-prefix-only client-write restriction, no spike/temp buckets or tables found.

Blank-slate row counts before and after migration: unchanged (`organizations=1, org_members=4`, all else `0`) — migrations touched only schema plus the one already-verified `organizations.timezone` UPDATE for the real Premier org.

## 4. Application deployment verification

Vercel confirmed serving commit `7334c3a` (post-hotfix) at `app.ppmnky.com`, `readyState: READY`, build clean (only 2 pre-existing + 1 new test-only ESLint warning, zero errors). No new runtime errors observed (the one pre-existing runtime-error-log entry is an unrelated, self-labeled "safe to ignore" synthetic test from an earlier Milestone A deployment). All checked routes (`/today`, `/requests`, `/estimates`, `/site-visits/[id]`, `/portal/dashboard`, `/quotes`, `/jobs`, `/invoices`) resolved without server errors.

## 5. Storage bucket and policy verification

`site-visit-attachments`: `public=false`, `file_size_limit=15728640` (15MB), `allowed_mime_types=['image/jpeg','image/png']`. Two RLS policies, both scoped to `bucket_id = 'site-visit-attachments'` only: client INSERT restricted to the `{org}/pending/` prefix and org membership; SELECT restricted to org membership. No client policy exists for the permanent path at all. Confirmed no other buckets exist in the project.

## 6. Organization timezone verification

`organizations.id = 'a0000000-0000-0000-0000-000000000001'`, `name = 'Premier Property Maintenance LLC'`, `timezone = 'America/New_York'` — confirmed both before and after migration (unchanged, since the column already existed and this org's value was already correct).

## 7. Empty-state verification

Confirmed blank-slate row counts (`organizations=1, org_members=4, customers=0, properties=0, service_requests=0, estimates=0, quotes=0, jobs=0, invoices=0, payments=0`) both immediately before the migration and immediately after — migrations are schema-only plus the one scoped org-timezone update.

## 8. Smoke-test entities created and results

Marked with `E2E_PROD_SMOKE_20260802_8119f6af` throughout. Real service request created via the real public API (`ticket_id`/`service_requests.id` = `37334ee5-b6ad-4afc-b4d3-40582d5f9c10`, `request_number SR-000008`) — confirmed the primary key, not a separate alias, and confirmed state/preferred-date/time normalization (`KY`, `2026-08-03`, `2:00 PM`) exactly matches submission.

Three temporary staff auth users + `org_members` rows created (owner/employee/subcontractor) via the Admin API (already-confirmed, no mailbox interaction). One temporary portal customer auth user + `customer_accounts` row created for the portal-projection check.

**Full lifecycle exercised, real RPCs, real authenticated sessions**:
- Triage → `site_visit_required` (no estimate created yet, confirmed).
- Schedule → reschedule once (appointment history preserved: exactly 1 cancelled + 1 scheduled row, confirmed).
- Start → partial inspection save (subcontractor, via the trusted service-role path, matching the real server-action boundary) → complete.
- Estimate generation: 2 concurrent calls, both succeeded, same estimate ID (idempotent, confirmed).
- Capability matrix, all proven against real RPCs with real sessions:
  - Subcontractor: denied `approve_estimate_pricing` (both pre- and post-approval-cycle), denied `create_quote_from_estimate` (pre- and post-approval).
  - Employee: denied `approve_estimate_pricing`; allowed to edit estimate line items (via the real capability-checked, service-role-write path matching `updateEstimateLineItemAction` exactly — a direct RLS-scoped write was correctly denied first, confirming the table has no direct `authenticated` UPDATE grant, matching the app's own architecture); allowed `create_quote_from_estimate` after owner approval.
  - Owner: allowed `approve_estimate_pricing`, allowed `reopen_estimate_for_edit`; a raw line-item edit attempt while locked was correctly denied.
  - Quote creation denied before pricing approval regardless of role (including owner).
- Quote send (post-hotfix, see §2): subcontractor denied, quote untouched; employee allowed, quote transitioned to `sent` exactly once.
- Customer portal: `get_my_site_visit_summary()` returned exactly the 6 approved fields (`site_visit_id, safe_status, scheduled_start, scheduled_end, is_rescheduled, is_cancelled`); a direct `SELECT * FROM site_visits` by the same portal session returned 0 rows.

**Not exercised, by design**: the `remote_estimate` triage path and the `direct_work_order` path were not separately smoke-tested in production (the site_visit_required path already proves the fixed `isQuoteEligibilityGated` UI logic works for both paths identically, since it uses the same `triage_decision IS NOT NULL` check regardless of which decision was made — this was verified by code reading, not a second live production trial, given the already-extensive scope of the primary chain). Quote acceptance, job creation, invoicing, and payment were explicitly not exercised, per instruction.

## 9. Photo processing results

Two upload/finalization cycles, both using the same real phone-photo fixture (source `4032×3024`, real EXIF orientation tag `6`) — **only one distinct real phone image was available; this does not prove behavior across two different phone-camera models or source files**, only that the pipeline is independently correct across two separate transactions.

Both finalized independently via the real, unmodified `finalizeSiteVisitUpload()` function (imported directly from `apps/web/lib/site-visit-attachments.ts`, not a reimplementation) against real production Storage/DB:

| Check | Upload 1 | Upload 2 |
|---|---|---|
| Unique pending-upload ID | ✓ (`6e5c3124-...`) | ✓ (`5190cd48-...`) |
| Unique permanent object key | ✓ | ✓ |
| Processed dimensions | `3024×4032` (correctly swapped) | `3024×4032` (correctly swapped) |
| EXIF present | `false` | `false` |
| Bucket-level access | private (`public=false`) | private (`public=false`) |
| Pending object removed | ✓ (`status=finalized`, absent from pending listing) | ✓ |
| Vault row | distinct, org-scoped | distinct, org-scoped |
| Idempotency collision | none (both `storageObjectKeys` unique) | none |

## 10. Notification behavior

`RESEND_API_KEY is not set` in production, confirmed via a real runtime-log observation triggered by the real service-request submission (`[email] RESEND_API_KEY is not set — email delivery skipped.`) — application transactional email (quote-sent, service-request-confirmation, etc.) is **not currently operational** in production. This is distinct from Supabase Auth's own email delivery (invite/password-reset links), which is a separate system and was not tested in this pass. The core record transitions (service request creation, quote send) both succeeded despite the missing email — confirming the documented fail-open behavior holds in production, not just in tests. No DNS or Resend configuration changes were made.

## 11. Cleanup result and final counts

All 18 manifest-tracked entity categories removed in FK-safe order (quote line items → quotes → estimate line items [after clearing the pricing lock] → estimates → pending uploads [before vault_items, due to a FK from `pending_uploads.finalized_vault_item_id`] → vault_items → permanent Storage objects → site_visit_appointments → site_visits → activity_log residue → customer_accounts → portal auth user → service_requests → customer_properties link → properties → customers → temp org_members → temp staff auth users).

**Final production state, independently re-verified after cleanup**:
```
organizations=1, org_members=4 (real, byte-identical role/status/email to before),
customers=0, properties=0, customer_properties=0, customer_accounts=0,
service_requests=0, site_visits=0, site_visit_appointments=0,
pending_uploads=0, vault_items=0, estimates=0, estimate_line_items=0,
quotes=0, quote_line_items=0, jobs=0, invoices=0, payments=0
```
Zero remaining Storage objects matching the smoke site-visit ID. Zero remaining auth users matching the smoke email pattern. Zero remaining `activity_log` rows referencing any smoke marker or entity ID. No FK or logical orphans encountered during cleanup (each step succeeded on the first attempt after the two ordering corrections noted above, which were caught immediately by the FK constraints themselves — not silently bypassed).

## 12. Known pre-existing, unrelated issues (not touched)

- `employee-onboarding-admin-invite-bot.spec.ts` — flaky, confirmed pre-existing by direct comparison against a clean `origin/main` worktree (identical failure reproduces there). Recommend a separate, focused reliability pass.
- `data-consistency-bot.spec.ts`'s "invoice total equals the sum of its line items" test — flaky (~25% failure rate across 4 isolated runs), targets `/invoices`, unrelated to this work.

## 13. Rollback and containment notes

- All 18 migrations remain additive-only; production returned to a genuine blank slate for every table they touch, so a schema-level rollback (if ever needed before real data accumulates) remains cheap — but is not "free" once real triage/site-visit/estimate/photo data exists, per the honest rollback statement in the implementation report.
- The `canSendQuote` hotfix is a pure application-code change — no migration was needed or applied for it.
- No emergency containment action was used at any point (no trigger disabled, no bucket made public, no RPC grant revoked as a live mitigation) — the one defect found was contained by not exercising it further, then fixed properly before resuming.

## 14. Production deployment considered fully verified

Yes, for the scope defined in this validation: schema, RPC security model, Storage pipeline, capability matrix (including the corrected `canSendQuote` boundary), customer-portal projection, and the public-intake fix are all confirmed working against real production infrastructure with zero residual data. Not yet exercised in production: quote acceptance → job → invoice → payment (explicitly out of scope for this validation), the `remote_estimate` and `direct_work_order` triage paths end-to-end (verified by code reading only, given the primary path's already-extensive coverage), and true black-box HTTP-level authorization testing (verified via direct function-level testing with real sessions instead, per the methodology note in §2).
