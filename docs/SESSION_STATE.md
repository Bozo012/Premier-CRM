# Session State

## Last Updated
2026-08-02 (Premier CRM Demonstration organization **created and verified in production**. Multi-org support built and deployed as a prerequisite. Kevin has safe access to both PPM and Demo. Brandon inspected only, not added. Demo dataset proposed, not populated.)

## One coherent story so far

1. **Production stabilization (Milestone A) — ACHIEVED.** PR #78 and PR #79 merged and deployed.
2. **Production cleanup and Jobber-import purge — EXECUTED AND VERIFIED.** `docs/production/cleanup/2026-08-01-production-cleanup.md`. Production was a true blank slate going into everything below.
3. **Storage/upload architecture — verified via spikes, then implemented for real.**
4. **Site-visit workflow — implemented and verified on `premier-crm-e2e`.** `docs/implementation/request-site-visit-estimate-workflow.md`.
5. **Final merge-readiness audit on PR #80 — found and fixed 4 cross-org authorization defects** (TypeScript layer; SQL/RPC layer audited clean).
6. **Marketing-site PR #5 and CRM PR #80 merged and deployed to production.** Marketing-site merge commit `8807fa9`. CRM merge commit `15078a3`.
7. **A fifth production authorization defect was found during controlled production validation** — `sendQuoteAction()`/`resendQuoteEmailAction()` checked the wrong capability, letting a subcontractor send a quote. Found before it was exercised, contained, fixed (hotfix PR #81, commit `9a376b3`, merge `7334c3a`), covered by 9 regression tests, re-verified against real production data. `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md` §2.
8. **Full production smoke-test chain completed and fully cleaned up.** Real request → triage → site visit → estimate → quote → customer-safe portal projection, real RPCs, real temporary sessions, 2 real-phone-photo upload cycles. Production confirmed back to a verified blank slate afterward.
9. **Premier CRM Demonstration organization created in production (this phase).** Before this could safely happen, a real multi-tenant blocker was found: `getActiveOrgContext()` (called from ~36 places) hard-rejected any account with more than one active org membership — adding Kevin to a second org would have broken his real PPM login. Fixed with a minimal, zero-call-site-change mechanism (PR #82, merge commit `2d51546`): a `user_profiles.active_org_id` preference, written only by a guarded `switch_active_org()` RPC, with deterministic oldest-membership fallback. Migrations applied to production; app deployed and confirmed serving `2d51546`.
10. **Demo org bootstrapped via a repeatable, idempotent, `service_role`-only RPC** (`bootstrap_demonstration_organization()`), verified idempotent in production (called twice, identical org ID both times). Org ID `a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`, slug `premier-crm-demonstration`, timezone `America/New_York`. An existing (pre-existing, not built by this phase) `on_organization_created` trigger auto-seeded 12 generic system-default automation rules — confirmed desired platform behavior, not PPM-specific, not deleted.
11. **Kevin added to Demo as owner** (`org_members.id = 05521ad6-...`). His original PPM membership is unchanged. With no explicit preference set, `getActiveOrgContext()` was verified — against real production data — to still default him to PPM. A round-trip preference test (PPM → Demo → PPM) was performed and his original `null` preference state was fully restored.
12. **Multi-tenant isolation verified.** Full automated coverage (`packages/db/queries/org-context.test.ts`, `tests/e2e/multi-org-switching-bot.spec.ts`, `tests/e2e/demonstration-org-bootstrap-bot.spec.ts`) plus direct production verification of counts, grants, and Kevin's real resolution behavior. PPM and Demo both remain blank for customer/property/workflow data. Full report: `docs/implementation/premier-crm-demonstration-organization.md`.
13. **Brandon's real account status was inspected, not acted on.** Real unconfirmed auth user exists, no PPM membership, one currently-pending PPM invite (expires 2026-08-15). **Not added to Demo, not invited again, not modified.**
14. **A full serial E2E suite run came back completely clean**: 149 passed, 24 skipped, 0 failed — including the usually-flaky `employee-onboarding-admin-invite-bot` and every new spec from this phase.
15. **Stopping point reached**: Demo organization creation and multi-tenant verification are complete. **Demo dataset population, Brandon onboarding, and Platform v1.0 tagging remain explicitly not authorized.**

## Current Branches
- CRM: `main` at `2d51546` (includes PR #80, hotfix PR #81, and PR #82). Feature branches merged, not deleted.
- Marketing site (`premier-property-maintenance`): `main` at `8807fa9` (includes PR #5).

## Current Goal
Both real organizations (Premier Property Maintenance and Premier CRM Demonstration) exist in production with safe multi-org access for Kevin. Next phase (not yet authorized): populate the proposed Demo dataset, onboard Brandon, tag Platform v1.0, or begin Base44 work.

## Business policy decisions locked in
- Employee pricing-approval capability stays owner/admin-only (`canApproveEstimatePricing`).
- Multi-org accounts default to their **oldest** active membership when no explicit preference is set — never a random or newest-wins choice. This keeps Kevin's PPM experience unchanged by default even though he now also belongs to Demo.

## Known Issues and Limitations
1. `/auth/confirm/route.ts` — necessity is determined by Supabase's dashboard-configured email templates, not app-code references.
2. E2E coverage gap (pre-existing): `tests/e2e/portal-auth-bot.spec.ts` uses `generateLink()`, a different URL shape than the real configured email template.
3. Brandon Fleenor has a real, unconfirmed auth user and one currently-pending PPM invite (expires 2026-08-15) — not yet added to Demo, per instruction.
4. `docs/HANDOFF-current.md` and `docs/IMPLEMENTATION-STATUS.md` are stale/superseded.
5. `employee-onboarding-admin-invite-bot.spec.ts` and `data-consistency-bot.spec.ts`'s invoice-total test are both known-flaky, pre-existing, unrelated to any work in this session — both passed clean in the most recent full-suite run, consistent with genuine (not deterministic) flakiness.
6. HEIC/HEIF photo uploads are not supported (sharp's prebuilt binary limitation).
7. **Production application transactional email (Resend) is not configured** (`RESEND_API_KEY` unset) — confirmed via a real production runtime-log observation. Needs a deliberate decision on whether/when to configure it.
8. `canManageInspectionTemplates` capability exists but is intentionally unused — no template-management RPC/UI ships yet.
9. Numbering sequences (`service_request_number_seq`, `estimate_number_seq`, `invoice_number_seq`) are **global across all organizations**, not per-org — Demo's first request/estimate/invoice will continue PPM's counters, not start at 1. Pre-existing platform behavior, not introduced by this phase.
10. No public-facing intake path exists for Demo (the public API routes are correctly PPM-specific, since only PPM has a marketing site) — populating the Demo dataset's first service request will need a minimum controlled setup rather than the real public form. See the Demo-org doc §6.

## Environment State
- **premier-crm-prod** (`apnbpcauqrjvkoleisde`): live, serving commit `2d51546`. 2 organizations (PPM `a0000000-...`, Demo `a0c9b59d-...`), 5 total `org_members` (4 PPM + Kevin's Demo row), both orgs blank for customer/property/workflow data.
- **premier-crm-e2e** (`slbnizoskumwhleeiccv`): has all migrations through this phase applied and verified; confirmed clean of all spike/test residue.
- Production CRM: `app.ppmnky.com`, serving commit `2d51546`.
- Production marketing site: `www.ppmnky.com` / `ppmnky.com`, serving commit `8807fa9` (unchanged this phase).

## Test Status (final, this phase)
`pnpm typecheck` clean; `pnpm test` 118/118; full serial E2E suite (`premier-crm-e2e`) — **149 passed, 24 skipped, 0 failed**, including `request-site-visit-workflow-bot` (20/20 incl. capability parity), `multi-org-switching-bot` (6/6, new), `demonstration-org-bootstrap-bot` (4/4, new), and `employee-onboarding-admin-invite-bot` (clean this run). `pnpm --filter web build` clean.

## Next Exact Step
Awaiting explicit approval before: populating the proposed Demo dataset (`docs/implementation/premier-crm-demonstration-organization.md` §11), onboarding Brandon, or tagging Platform v1.0.

## Checkpoint Routine (unchanged)
Update this file after each meaningful milestone and before/after any production action. Commit in small logical checkpoints. Never commit secrets. Never leave important decisions only in chat history.
