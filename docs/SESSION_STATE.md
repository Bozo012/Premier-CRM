# Session State

## Last Updated
2026-08-03 (Premier CRM Demonstration organization **fully populated with a permanent, verified dataset** covering all three triage paths. Three real production defects found and fixed during population. Kevin retains safe access to both PPM and Demo. Brandon still not added. PPM remains blank.)

## One coherent story so far

1. **Production stabilization (Milestone A) — ACHIEVED.** PR #78 and PR #79 merged and deployed.
2. **Production cleanup and Jobber-import purge — EXECUTED AND VERIFIED.** `docs/production/cleanup/2026-08-01-production-cleanup.md`. Production was a true blank slate going into everything below.
3. **Storage/upload architecture — verified via spikes, then implemented for real.**
4. **Site-visit workflow — implemented and verified on `premier-crm-e2e`.** `docs/implementation/request-site-visit-estimate-workflow.md`.
5. **Final merge-readiness audit on PR #80 — found and fixed 4 cross-org authorization defects** (TypeScript layer; SQL/RPC layer audited clean).
6. **Marketing-site PR #5 and CRM PR #80 merged and deployed to production.** Marketing-site merge commit `8807fa9`. CRM merge commit `15078a3`.
7. **A fifth production authorization defect was found during controlled production validation** — `sendQuoteAction()`/`resendQuoteEmailAction()` checked the wrong capability. Fixed (hotfix PR #81, commit `9a376b3`, merge `7334c3a`), covered by 9 regression tests. `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md` §2.
8. **Full production smoke-test chain completed and fully cleaned up.** Production confirmed back to a verified blank slate afterward.
9. **Premier CRM Demonstration organization created in production.** Multi-tenant blocker in `getActiveOrgContext()` fixed first (PR #82, merge `2d51546`) via a `user_profiles.active_org_id` preference + guarded `switch_active_org()` RPC, deterministic oldest-membership fallback, zero call-site changes.
10. **Demo org bootstrapped via a repeatable, idempotent, `service_role`-only RPC** (`bootstrap_demonstration_organization()`). Org ID `a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`, slug `premier-crm-demonstration`, timezone `America/New_York`. 12 system-default automation rules auto-seeded by the pre-existing `on_organization_created` trigger.
11. **Kevin added to Demo as owner** (`org_members.id = 05521ad6-...`). His original PPM membership is unchanged; `getActiveOrgContext()` still defaults him to PPM with no explicit preference set.
12. **Multi-tenant isolation verified** at both the mechanism level (Phase 3) and record-by-record throughout population (Phase 4) — every write confirmed `org_id`-scoped to Demo, PPM counts checked before/after every stage.
13. **Brandon's real account status was inspected, not acted on.** Real unconfirmed auth user, no PPM membership, one pending PPM invite (expires 2026-08-15). **Still not added to Demo, not re-invited, not modified.**
14. **The Premier CRM Demonstration organization was fully populated with a permanent dataset** covering all three triage paths, in production, verified. Full record: `docs/implementation/premier-crm-demonstration-organization.md` §11 and `docs/implementation/premier-crm-demo-dataset-manifest.md`.
    - **Stage 1**: Dana Whitfield (residential, 1 property) and Bramwell Retail Group (commercial, 2 properties) created; Dana's permanent customer-portal account created.
    - **Stage 2 (Scenario A — remote estimate)**: request → triage → estimate → pricing approval → quote sent, correctly totaling $230.00.
    - **Stage 3 (Scenario B — site-visit lifecycle, the polished showcase)**: request → triage → schedule → **reschedule** (history preserved) → start → 2-pass inspection (2 real photos) → complete → estimate (idempotency proven) → quote ($455.00) → accepted → job → scheduled → deposit ($150, paid) → change order (customer-approved, incorporated once) → working invoice ($520.00) → final invoice ($520.00, paid).
    - **Stage 4 (Scenario C — direct work order)**: request → triage `direct_work_order` (`standing_agreement`, NTE $350) → **authorization boundary proved live** (temporary Demo-only employee/subcontractor test accounts both correctly denied `canCreateDirectWorkOrder` at the RPC, zero mutation, then deleted) → exactly 1 job, no estimate/quote → scheduled → working invoice ($240, under NTE) → final invoice (paid).
    - **Stage 5**: temporary employee/subcontractor identities fully deleted. The temporary "driver" identity used to perform ~30 population actions could **not** be deleted (FK-referenced as the audit-trail actor on 32 permanent records — deleting it would falsify who performed the work) — retained but rendered fully inert (zero org memberships anywhere, banned ~100 years, synthetic non-deliverable email).
15. **Three real, pre-existing production defects were found and fixed during population** (all found, contained, hotfixed, tested, deployed before continuing — same discipline as the earlier `canSendQuote` incident):
    - **PR #83**: no application path ever created a `kind='deposit'` invoice (`job_deposits.deposit_invoice_id` existed but nothing set it). Added `createDepositInvoice()`, gated by the existing `canManageDeposits` capability.
    - **PR #84**: `create_quote_from_estimate()` never recalculated quote totals — every RPC-created quote was left at $0.00. Fixed with a SQL trigger (`recalc_quote_totals()`) on `quote_line_items`.
    - **PR #85**: `generateFinalInvoiceFromWorking()` had the identical bug on the invoice side. Fixed the same way (`recalc_invoice_totals()` trigger on `invoice_line_items`).
    - All three merged to `main`, migrations applied to both `premier-crm-e2e` and `premier-crm-prod`, deployed, covered by new permanent regression tests.
16. **Stopping point reached**: Demo organization population is complete and verified. **Brandon onboarding and Platform v1.0 tagging remain explicitly not authorized.**

## Current Branches
- CRM: `main` at `44cd6d5` (includes PR #80–#85). Feature/hotfix branches merged and deleted per-PR from this phase onward.
- Marketing site (`premier-property-maintenance`): `main` at `8807fa9` (unchanged this phase).

## Current Goal
Both real organizations (Premier Property Maintenance and Premier CRM Demonstration) exist in production; Demo now has a complete, permanent, verified demonstration dataset covering all three triage paths. Next phase (not yet authorized): onboard Brandon, tag Platform v1.0, or begin Base44 work.

## Business policy decisions locked in
- Employee pricing-approval capability stays owner/admin-only (`canApproveEstimatePricing`).
- Multi-org accounts default to their **oldest** active membership when no explicit preference is set.
- Direct-work-order creation stays owner/admin-only (`canCreateDirectWorkOrder`) — verified live during Demo population (employee and subcontractor both correctly denied).
- Demo dataset payments use only the manual/offline "check" method, clearly labeled fictional — no payment provider is connected for Demo.

## Known Issues and Limitations
1. `/auth/confirm/route.ts` — necessity is determined by Supabase's dashboard-configured email templates, not app-code references.
2. E2E coverage gap (pre-existing): `tests/e2e/portal-auth-bot.spec.ts` uses `generateLink()`, a different URL shape than the real configured email template.
3. Brandon Fleenor has a real, unconfirmed auth user and one currently-pending PPM invite (expires 2026-08-15) — not yet added to Demo, per instruction.
4. `docs/HANDOFF-current.md` and `docs/IMPLEMENTATION-STATUS.md` are stale/superseded.
5. `employee-onboarding-admin-invite-bot.spec.ts` and `data-consistency-bot.spec.ts`'s invoice-total test are both known-flaky, pre-existing, unrelated to any work in this session.
6. HEIC/HEIF photo uploads are not supported (sharp's prebuilt binary limitation).
7. **Production application transactional email (Resend) is not configured** (`RESEND_API_KEY` unset). Needs a deliberate decision on whether/when to configure it. Not touched during Demo population.
8. `canManageInspectionTemplates` capability exists but is intentionally unused — no template-management RPC/UI ships yet.
9. Numbering sequences (`service_request_number_seq`, `estimate_number_seq`, `invoice_number_seq`) are **global across all organizations**, not per-org — confirmed in practice: Demo's requests came in as `SR-000009`–`SR-000011`, continuing PPM's counter. Pre-existing platform behavior. **Recommended before Platform v1.0**: per-organization numbering.
10. No public-facing intake path exists for Demo (public API routes are correctly PPM-specific) — Demo service requests were created by calling the real `createServiceRequest()` function directly with Demo's `orgId`, a documented exception since no public form exists to submit through.
11. The temporary Demo population "driver" auth user could not be deleted (FK-referenced as audit-trail actor on 32 permanent records) — retained inert (zero memberships, banned, synthetic email). See the Demo dataset manifest's Stage 5 section.
12. The working invoice is not auto-seeded from an accepted quote — staff must manually confirm the quoted scope onto it via the standard line-item editor. Intentional architecture (actuals/extras ledger), not a defect.

## Environment State
- **premier-crm-prod** (`apnbpcauqrjvkoleisde`): live, serving commit `44cd6d5`. 2 organizations (PPM `a0000000-...` blank, Demo `a0c9b59d-...` fully populated with a permanent dataset). PPM confirmed blank across every entity type checked throughout population.
- **premier-crm-e2e** (`slbnizoskumwhleeiccv`): has all migrations through this phase applied and verified.
- Production CRM: `app.ppmnky.com`, serving commit `44cd6d5`.
- Production marketing site: `www.ppmnky.com` / `ppmnky.com`, serving commit `8807fa9` (unchanged this phase).

## Test Status (final, this phase)
`pnpm typecheck` clean; `pnpm test` 124/124 (was 118 at start of Phase 4; +6 deposit-invoice-action authorization tests). New permanent e2e coverage this phase: `deposit-invoice-creation-bot` (7/7), `quote-totals-recalc-bot` (4/4), `invoice-totals-recalc-bot` (4/4). Full regression re-verified against `premier-crm-e2e`: `request-site-visit-workflow-bot` (20/20), `integrated-lifecycle-bot` (3/3), `working-invoice-protection-bot` (2/2) — all clean when run without dev-server worker contention (parallel-worker runs showed a known, pre-existing timing flake unrelated to these changes, confirmed by clean isolated reruns). `pnpm --filter web build` clean throughout.

## Next Exact Step
Awaiting explicit approval before: onboarding Brandon, or tagging Platform v1.0. Base44 work not begun.

## Checkpoint Routine (unchanged)
Update this file after each meaningful milestone and before/after any production action. Commit in small logical checkpoints. Never commit secrets. Never leave important decisions only in chat history.
