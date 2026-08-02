# Session State

## Last Updated
2026-08-02 (Checkpoint B — request/site-visit/estimate workflow backend)

## Important note on this file's history
This file was previously maintained on a different local branch (`fix/auth-confirm-route`), which accumulated production-stabilization, cleanup, and Jobber-purge checkpoint history — **but that branch was never pushed or merged to `origin/main`**. This branch (`feature/request-site-visit-estimate-workflow`) was created fresh from `origin/main` and does not have that history. A future session should reconcile the two branches (either push/merge `fix/auth-confirm-route` first, or manually carry its final state forward) rather than treat this file as a continuous record — it isn't one yet.

## Current Branch
`feature/request-site-visit-estimate-workflow`, created fresh from `origin/main`. Not pushed. Not merged. Not deployed.

## Current Goal
Implement the approved Request → Site Visit → Estimate → Quote workflow (see `C:\Users\somme\.claude\plans\mighty-watching-raven.md` for the full approved design) against `premier-crm-e2e` only, per the "Checkpoint B" instruction. Full report: `docs/implementation/request-site-visit-estimate-workflow.md`.

## Current Phase
**Checkpoint B — backend implemented and verified against `premier-crm-e2e`. UI not built. Not applied to production.**

Completed:
- 17 migrations applied to `premier-crm-e2e` (schema + RPCs + triggers + capability system + Storage bucket/policies).
- Golden-path E2E bot (`tests/e2e/request-site-visit-workflow-bot.spec.ts`, 11 tests) — all pass.
- Capability parity test (95 role×capability pairs, TS vs SQL) — passes.
- Full existing E2E suite regression check (serial run) — 130/131 pass, one pre-existing unrelated failure.
- One real regression found and fixed (quote-eligibility trigger over-scoping — see the implementation doc §7).
- `pnpm typecheck` and `pnpm --filter web build` both clean.
- Public request-intake timezone/state-code fix (`apps/web/app/api/v1/service-requests/route.ts`, `packages/shared/schemas/website-service-request-payload.ts`).

Not completed (explicitly deferred, not silently dropped — see the implementation doc §8):
- Full UI (request triage panel, site-visit screens, estimate review, quote-send, portal summary display).
- The trusted photo-upload finalization server action (Storage architecture verified via spike, not yet wired into real app code).
- Full Zod template-aware inspection-field validation schema.
- ~8 of the 19 required test categories not preserved as permanent named specs (backend logic verified manually during spikes, not all re-captured as lasting test coverage).

## Next Exact Step
Await Kevin's review of the Checkpoint B report. Do not begin: UI implementation, production migration, Demo org creation, Brandon onboarding, or Platform v1.0 tagging until explicitly approved.

## Environment State
- **premier-crm-e2e**: `slbnizoskumwhleeiccv` — has all 17 new migrations applied, live and verified. Confirmed clean of all test/spike residue after this session (organizations=1, org_members=2, matching pre-session baseline).
- **premier-crm-prod**: `apnbpcauqrjvkoleisde` — **untouched**, no migration applied, no write of any kind performed against it this session.
- Local dev server: not running (stopped at end of session).

## Known Issues and Limitations
See `docs/implementation/request-site-visit-estimate-workflow.md` §9 for the full list (capability dual-maintenance, employee pricing-approval policy flag, HEIC/HEIF unsupported, the one pre-existing unrelated E2E failure).

## Test Status
- `pnpm typecheck` — clean.
- `pnpm --filter web build` — clean (real production build, two pre-existing unrelated lint warnings).
- New E2E spec (`request-site-visit-workflow-bot.spec.ts`) — 11/11 pass.
- Full existing E2E suite — 130/131 pass (serial run), one pre-existing unrelated failure (`employee-onboarding-admin-invite-bot`).

## Working Tree
Clean except this session's real changes (migrations, `packages/shared/permissions.ts`, `packages/db/queries/site-visits.ts` + `index.ts`, `packages/db/types.ts`, the public-intake fix, the new E2E spec, this documentation) plus the same four pre-existing untracked local-tooling files noted in prior sessions (`.claude/hooks/`, `.claude/settings.json`, `.dev-server-err.log`, `.dev-server.log`).
