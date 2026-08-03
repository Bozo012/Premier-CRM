# Session State

## Last Updated
2026-08-03 (**Pre-Base44 Workflow Refinement phase complete.** Today-page role-aware "Needs your attention" action queue, mobile bottom-nav containment fix, and inspection-form list-field clarity all shipped (PR #87, commit `cca3ba7`, deployed to `app.ppmnky.com`, verified READY). Hazards-section proposal, request-list density recommendation, `docs/ux/base44-handoff.md`, and `docs/ux/base44-compatibility-spike-plan.md` written as design-only deliverables — none implemented. **Forge/Foundry naming audit is the next checkpoint** (approved naming model: product = Forge, umbrella = Foundry, business = Premier Property Maintenance, unchanged); the Base44 compatibility spike waits behind it. **Forge V1 has not yet been tagged.** Base44 work has not begun.)

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
16. **Brandon's Demo onboarding was started, then explicitly deferred by Kevin** before first-login verification. A real structural conflict was found first (the real accept-invite flow refuses to activate anything when a user has more than one pending invite — Brandon already had a pending PPM one, which Kevin's instructions forbid touching) and Kevin approved a one-time exception: Demo `org_members` row created directly (`ebdd5826-...`, employee), email confirmed via the Admin API, a Supabase-native password-reset email triggered. Kevin then changed plans before Brandon's first login — Brandon's account is preserved exactly as left (Demo membership intact, PPM invite untouched), but no login/capability verification was performed. Full status: `docs/implementation/brandon-demo-onboarding-and-observation.md`.
17. **Kevin created his own dedicated Demo employee test account** — his real, pre-existing `sommerskevin3@gmail.com` account (already a legitimate PPM employee, one of the 4 pre-existing PPM members) was added to Demo as `employee` (`org_members.id = ec13d3e3-...`). A repeatable "Kevin UI Observation Scenario" training record (`SR-000012`, site visit `2422de29-...`, left `awaiting_scheduling`) was prepared for him to work through manually via the real UI. Observation framework: `docs/implementation/kevin-demo-ui-observation.md`.
18. **Kevin's first UI-observation checkpoint fixed** (PR #86, commit `96a40e6`): raw "Approve pricing" button/error shown to employees replaced with a real employee-to-owner pricing-review handoff (`pricing_review_status`, submit-for-review, return-for-changes-with-note, line-item locking while pending); stale "Schedule site visit" control removed from site-visit-generated estimates.
19. **Pre-Base44 Workflow Refinement phase complete** (PR #87, commit `cca3ba7`, deployed and verified): role-aware "Needs your attention" Today action queue (pricing-review/create-quote/send-quote tasks, capability-gated, org-scoped, no separate dismissal state — see `packages/db/queries/today-actions.ts` and `docs/ux/base44-handoff.md` §5); mobile bottom-nav badge-crowding fix (corner-positioned badge, safe-area padding); inspection-form measurement/quantity/material list fields given visible per-column labels (`COLUMN_META` in `inspection-form.tsx`) fixing the ambiguous raw-key placeholder issue from Kevin's observation. New `today-action-queue-bot.spec.ts` (7 tests). Design-only deliverables written, not implemented: `docs/ux/hazards-section-proposal.md`, `docs/ux/request-list-density-recommendation.md`, `docs/ux/base44-handoff.md`, `docs/ux/base44-compatibility-spike-plan.md`.

## Clean Checkpoint (established this phase, per instruction)
- `main` HEAD: `cca3ba7` (PR #87 squash-merge).
- Production deployment: `dpl_7KiYKjW6rdb7r2ZHYWDaDV7KFvCj`, state `READY`, aliased to `app.ppmnky.com`, confirmed serving commit `cca3ba7`.
- Working tree: clean at time of this checkpoint (only this doc-update commit pending).
- `pnpm test`: 138/138 pass. `pnpm typecheck`: clean across all packages. `pnpm --filter web build`: clean.
- No uncommitted naming edits exist. Base44 work has not begun. Forge V1 has not been tagged.
- **Next checkpoint**: Forge/Foundry naming audit (read-only, `docs/architecture/forge-foundry-naming-audit.md`, on a dedicated branch, e.g. `chore/forge-brand-separation`) — not started as of this checkpoint. The Base44 compatibility spike remains queued behind it; Forge V1 will not be tagged until the naming checkpoint and spike are both complete and approved.

## Current Branches
- CRM: `main` at `cca3ba7` (includes PR #80–#87). Feature/hotfix branches merged and deleted per-PR from this phase onward.
- Marketing site (`premier-property-maintenance`): `main` at `8807fa9` (unchanged this phase).

## Current Goal
Both real organizations (Premier Property Maintenance and Premier CRM Demonstration) exist in production; Demo has a complete, permanent, verified demonstration dataset. The Pre-Base44 Workflow Refinement phase (Today action queue, mobile-nav fix, inspection-form clarity, plus the hazards/request-list/Base44-handoff/spike-plan design deliverables) is complete, tested, and deployed. Next, in order: (1) Forge/Foundry naming audit — read-only, for Kevin's approval, not yet started; (2) approved naming implementation, if any; (3) Base44 compatibility spike (plan prepared in `docs/ux/base44-compatibility-spike-plan.md`, not run); (4) Forge V1 baseline tag, only after the above. Not yet authorized: Brandon's further onboarding, any V1 tag, Base44 implementation work, Resend configuration.

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
`pnpm typecheck` clean across all packages; `pnpm test` 138/138 (up from 124 — includes the pricing-review handoff and Today-action-queue unit coverage added across PRs #86–#87). New permanent e2e coverage this phase: `today-action-queue-bot` (7/7) — role visibility, task-lifecycle transitions, cross-org isolation, capability-restricted roles. Full regression re-verified against `premier-crm-e2e`: `request-site-visit-workflow-bot` (20/20), `integrated-lifecycle-bot` (3/3, isolated — confirmed the same known pre-existing worker-contention flake when run alongside other suites, not a regression), `estimate-pricing-approval-presentation-bot` + `estimate-pricing-review-handoff-bot` (14/14, no regression to the PR #86 handoff). `pnpm --filter web build` clean.

## Next Exact Step
Begin the read-only Forge/Foundry naming audit on a dedicated branch (e.g. `chore/forge-brand-separation`), producing `docs/architecture/forge-foundry-naming-audit.md` for Kevin's review. Do not implement any rename yet. Base44 compatibility spike and Forge V1 tagging remain queued behind Kevin's approval of that audit. Brandon's further onboarding remains separately not authorized.

## Checkpoint Routine (unchanged)
Update this file after each meaningful milestone and before/after any production action. Commit in small logical checkpoints. Never commit secrets. Never leave important decisions only in chat history.
