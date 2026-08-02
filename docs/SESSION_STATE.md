# Session State

## Last Updated
2026-08-02 (Request → Site Visit → Estimate → Quote workflow **deployed to production**, migrated, smoke-validated, and cleaned up. A production authorization defect was found during validation, fixed, and re-verified before completing validation. Production is back to a verified blank slate for customer/property/workflow data.)

## One coherent story so far

1. **Production stabilization (Milestone A) — ACHIEVED.** PR #78 and PR #79 merged and deployed. All six Milestone A live-verification items confirmed on production.
2. **Production cleanup (Phase 1/2) — EXECUTED AND VERIFIED.** Full record: `docs/production/cleanup/2026-08-01-production-cleanup.md`.
3. **Full Jobber-import purge — EXECUTED AND VERIFIED.** Addendum in the same cleanup doc. Production was a true blank slate for customer/property/workflow data going into this deployment.
4. **Storage/upload architecture checkpoints (A and A.1) — verified via dedicated spikes, then implemented for real.** Quarantine-then-finalize architecture with server-side EXIF/GPS stripping.
5. **Site-visit workflow — backend, Storage, staff UI, customer portal, and permanent test coverage — implemented and verified on `premier-crm-e2e`.** Full report: `docs/implementation/request-site-visit-estimate-workflow.md`.
6. **Final merge-readiness audit performed on PR #80** — found and fixed 4 cross-org authorization defects in the TypeScript layer (SQL/RPC layer audited clean). See implementation doc §13.
7. **Marketing-site PR #5 and CRM PR #80 both merged and deployed to production.** Marketing-site merge commit `8807fa9`. CRM merge commit `15078a3`.
8. **A fifth production authorization defect was found during controlled production validation, after PR #80 was already merged and deployed** — `sendQuoteAction()`/`resendQuoteEmailAction()` checked the wrong capability (`canSendEstimates` instead of the new `canSendQuote`), letting a subcontractor send a quote. **Found by source inspection before it was exercised, contained (draft quote held unsent), fixed in hotfix PR #81 (commit `9a376b3`, merge commit `7334c3a`), covered by 9 new regression tests, and re-verified against real production data before the smoke chain resumed.** Full incident record: `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md` §2.
9. **Full production smoke-test chain completed and fully cleaned up.** Real service request → triage → site visit (schedule/reschedule/start/inspect/complete) → estimate (generate/edit/approve/reopen) → quote (create/send) → customer-safe portal projection, all exercised with real RPCs and real temporary staff/portal sessions against real production infrastructure, including 2 real-phone-photo upload/finalization cycles (EXIF stripped, correctly rotated, private, no residue). Full report: `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md`.
10. **Production is confirmed back to a verified blank slate**: `organizations=1, org_members=4` (real, unchanged), every workflow table `0`, zero smoke-test Storage objects, zero smoke-test auth users, zero smoke-test activity_log residue.
11. **Stopping point reached**: deployment, migration, hotfix, and full smoke validation are complete. **Demonstration organization creation, Brandon onboarding, and Platform v1.0 tagging remain explicitly not authorized** — awaiting further approval for that next phase.

## Current Branches
- CRM: `main` at `7334c3a` (includes PR #80 + hotfix PR #81). Feature branch `feature/request-site-visit-estimate-workflow` and hotfix branch `hotfix/enforce-can-send-quote` both merged, not deleted.
- Marketing site (`premier-property-maintenance`, formerly `PPMSITE`): `main` at `8807fa9` (includes PR #5).

## Current Goal
The request → site visit → estimate → quote workflow is now live in production, migrated, and validated. Next phase (not yet authorized): create the Premier CRM Demonstration organization, onboard Brandon, tag Platform v1.0, or begin Base44 work — none of these have been started.

## Business policy decisions locked in
- **Employee pricing-approval capability stays owner/admin-only** (`canApproveEstimatePricing`). Deliberate initial business policy — employees get `canEditEstimate`/`canCreateQuote`/`canSendQuote` but never pricing approval. Subcontractors get only `canEditEstimate`, never quote creation or sending (now correctly enforced end-to-end after the `canSendQuote` hotfix).

## Known Issues and Limitations
1. `/auth/confirm/route.ts` — its necessity is determined by Supabase's *dashboard-configured* email templates, not by grepping app code for references.
2. E2E coverage gap (pre-existing, understood): `tests/e2e/portal-auth-bot.spec.ts` uses `generateLink()`, a different URL shape than the real configured email template.
3. Brandon Fleenor's staff invite may still need a fresh resend via `/team` — not re-verified since Milestone A.
4. `docs/HANDOFF-current.md` and `docs/IMPLEMENTATION-STATUS.md` are stale/superseded — `docs/BASELINE_V1.md`, `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`, and this file are current ground truth.
5. **`employee-onboarding-admin-invite-bot.spec.ts`** — flaky, confirmed pre-existing and unrelated via a clean `origin/main` worktree comparison (identical failure reproduces there). Recommend a separate, focused reliability pass.
6. **`data-consistency-bot.spec.ts`'s invoice-total test** — flaky (~25% failure rate across 4 isolated runs), unrelated route, pre-existing.
7. HEIC/HEIF photo uploads are not supported (sharp's prebuilt binary limitation) — JPEG/PNG only for v1.
8. Kevin's staff account may still be on the Claude-set temporary password from the Milestone A investigation.
9. **Production application transactional email (Resend) is not configured** (`RESEND_API_KEY is not set`, confirmed via a real production runtime-log observation during this deployment's smoke test) — quote-sent/service-request-confirmation emails are not currently delivered. The application fails open (core record transitions succeed regardless), but no customer-facing email is actually sent right now. This is distinct from Supabase Auth's own email delivery (invite/reset links), which is a separate, unaffected system. Needs a deliberate decision on whether/when to configure Resend for production.
10. `canManageInspectionTemplates` capability exists (TS + SQL) but is intentionally unused — no template-management RPC or UI ships yet. RLS policies exist for it but the base table grant is SELECT-only, so it fails safe. Follow-up work if template authoring becomes a priority.

## Environment State
- **premier-crm-prod** (`apnbpcauqrjvkoleisde`): **live** — all 18 site-visit-workflow migrations applied, `canSendQuote` hotfix deployed, blank slate confirmed after full smoke-test cleanup (`organizations=1, org_members=4`, all workflow tables `0`).
- **premier-crm-e2e** (`slbnizoskumwhleeiccv`): has all 18 migrations applied and verified; confirmed clean of all spike/test residue.
- Production CRM: `app.ppmnky.com`, serving commit `7334c3a`.
- Production marketing site: `www.ppmnky.com` / `ppmnky.com`, serving commit `8807fa9`.

## Test Status (final)
See `docs/implementation/request-site-visit-estimate-workflow.md` §12-13 and `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md` for complete results. Summary: `pnpm typecheck` / `pnpm --filter web build` clean; `pnpm test` 113/113 (104 + 9 new `canSendQuote` regression tests); workflow bot 20/20; full E2E suite 122 passed, all non-passing results confined to the two known pre-existing/unrelated flaky specs; marketing-site `tsc`/`vite build` clean; full production smoke chain passed with zero residue after cleanup.

## Next Exact Step
Production deployment of the site-visit workflow is complete and verified. Awaiting explicit approval before the next phase: creating the Demonstration organization, onboarding Brandon, or tagging Platform v1.0.

## Checkpoint Routine (unchanged)
Update this file after each meaningful milestone and before/after any production action. Commit in small logical checkpoints. Never commit secrets. Never leave important decisions only in chat history.
