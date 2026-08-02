# Session State

## Last Updated
2026-08-02 (Checkpoint B — request/site-visit/estimate workflow backend + upload/template/UI work in progress)

## One coherent story so far

1. **Production stabilization (Milestone A) — ACHIEVED.** PR #78 (portal auth, working-invoice DB lock, client-error instrumentation, timeline, scheduling toast fix) and PR #79 (missing `/auth/confirm` route, found live) both merged and deployed. All six Milestone A live-verification items confirmed on production: deployment serves the merged commit, `/api/e2e-health` 404s, portal signup works end-to-end, password reset works end-to-end (a third real defect — Auth email templates linking directly to `supabase.co`, exposing them to link-prescanning — found and fixed via Supabase dashboard config, no code change), client-error logging reaches Vercel runtime logs, timeline renders real entries on a real production job.
2. **Production cleanup (Phase 1/2) — EXECUTED AND VERIFIED.** Both Approval A (general smoke-test/dev-artifact cleanup) and Approval B (the $2.00 paid smoke-test invoice + its full dependent change-order/audit chain, granted mid-execution) completed. Full record: `docs/production/cleanup/2026-08-01-production-cleanup.md`.
3. **Full Jobber-import purge — EXECUTED AND VERIFIED, same day, broader scope change.** Kevin explicitly reclassified the previously-preserved 38 `jobber_import` customers and 43 linked properties as legacy import/test data, not trusted production history, and approved full deletion. Addendum in the same cleanup doc. **Production is now a true blank slate** for customer/property/workflow data — only org config, real staff (`organizations`=1, `org_members`=4), schema/RLS/permissions/infrastructure (including 4 supplier geofences) remain.
4. **Storage/upload architecture checkpoints (A and A.1) — verified via dedicated spikes against `premier-crm-e2e`, all spike scaffolding removed afterward.** Proved: private-bucket + signed-upload-URL mechanics, cross-org Storage/DB denial, MIME/size/malformed-path rejection, retry-safe finalization, and — critically for A.1 — that the real production flow needs a **quarantine-then-finalize** split (client uploads the original to a private pending path; a trusted server-side step downloads, validates actual content, processes with `sharp` — auto-orient + full EXIF/GPS strip — and only then writes the sanitized permanent object and creates the `vault_items` row). Real-phone orientation test passed: source `4032×3024`/EXIF orientation `6` → processed `3024×4032`, zero EXIF remaining. HEIC/HEIF confirmed unsupported by sharp's prebuilt binary — MIME allow-list narrowed to JPEG/PNG.
5. **Site-visit workflow backend foundation (Checkpoint B) — implemented and verified against `premier-crm-e2e` only.** 17+ migrations (site_visits linked to service_requests, not estimates; structured appointment history; versioned immutable inspection templates; DB-enforced quote eligibility via trigger; capability system), a full RPC-only mutation surface, an 11-test golden-path E2E bot, a 95-pair capability-parity test, full existing-suite regression check (130/131 serial pass, one pre-existing unrelated failure), typecheck/build clean. **One real regression found and fixed**: the quote-eligibility trigger initially gated every estimate-linked quote, breaking the pre-existing manual-estimate flow — narrowed to only gate estimates that went through the new triage system. Full report: `docs/implementation/request-site-visit-estimate-workflow.md`.
6. **Currently in progress**: UI, the real upload/finalization server action, template-aware inspection validation, customer portal presentation, permanent test coverage for the remaining categories, and the public-intake fix's marketing-site half. **Production deployment for any of this is not yet authorized.**

## Current Branch
`feature/request-site-visit-estimate-workflow`, created fresh from `origin/main`. **Not yet pushed to origin** — pushing requires interactive user approval (blocked by the local permission-classifier for `git push`, not a decision left undone). Local HEAD includes the full Checkpoint B backend commit plus this documentation-reconciliation work.

**Important housekeeping note**: `docs/SESSION_STATE.md`, `docs/CLAUDE_CONTEXT.md`, `docs/RESUME_PROMPT.md`, and `docs/production/cleanup/2026-08-01-production-cleanup.md` previously existed only on a separate local branch, `fix/auth-confirm-route`, which was **never pushed or merged to `origin/main`** even though its one real PR (#79, commit `6314024`/merged as `81dd9da`) already landed. This session reconciled that: the cleanup/context/resume docs were brought forward as-is (no conflicts, they didn't exist on this branch), and this file was rewritten to tell one coherent story instead of two divergent ones. `fix/auth-confirm-route` itself is now safe to delete once its content is confirmed fully captured here — not done yet, flagged for a deliberate decision rather than silently deleted.

## Current Goal
Complete the originally-approved Checkpoint B (request → site visit → estimate → quote workflow) — backend, UI, upload finalization, template validation, customer portal, public-intake fix, and permanent test coverage — against `premier-crm-e2e` only, per the approved plan at `C:\Users\somme\.claude\plans\mighty-watching-raven.md`. Production deployment, Demo org creation, Brandon onboarding, and Platform v1.0 tagging all remain explicitly blocked until Checkpoint B is reported complete and approved.

## Business policy decisions locked in during Checkpoint B
- **Employee pricing-approval capability stays owner/admin-only** (`canApproveEstimatePricing`). This is the deliberate initial business policy, not an unresolved blocker — employees get `canEditEstimate`/`canCreateQuote`/`canSendQuote` but never pricing approval. Subcontractors get only `canEditEstimate` (findings/draft scope), never quote creation or sending. Revisit only on an explicit future decision.

## Known Issues and Limitations
1. `/auth/confirm/route.ts` — its necessity is determined by Supabase's *dashboard-configured* email templates, not by grepping app code for references (it was deleted once as apparently-dead code, then needed again). Do not repeat that mistake.
2. E2E coverage gap (pre-existing, understood): `tests/e2e/portal-auth-bot.spec.ts` uses `generateLink()`, which returns a different URL shape than the real configured email template produces — this is why the full suite passing didn't originally catch the `/auth/confirm` 404.
3. Brandon Fleenor's staff invite (`b373d9a3-2cc0-4eb4-9ec3-3e8ef1a5c7b6`, `brandonjfleenor28@gmail.com`) may still need a fresh resend via `/team` — not re-verified since Milestone A.
4. Email-link prescanning can silently consume single-use auth tokens (mitigated by routing all auth email links through `/auth/confirm` on our own domain instead of directly to `supabase.co`).
5. `docs/HANDOFF-current.md` and `docs/IMPLEMENTATION-STATUS.md` are stale/superseded — `docs/BASELINE_V1.md`, `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`, and this file are current ground truth.
6. **`employee-onboarding-admin-invite-bot.spec.ts` has a failing test** ("invited user should exist in auth.users by now") observed during Checkpoint B's regression run. **Confirmed pre-existing and unrelated** — not caused by this branch (see the Checkpoint B implementation doc). Recommended for a separate, focused repair pass; deliberately not fixed on this feature branch per explicit instruction not to absorb unrelated fixes here. Will be re-run once near Checkpoint B completion to check if it's reproducible or was transient.
7. HEIC/HEIF photo uploads are not supported (sharp's prebuilt binary limitation) — JPEG/PNG only for v1.
8. Kevin's staff account (`kevinsommers@ppmnky.com`) may still be on the Claude-set temporary password from the Milestone A investigation — no urgency, "Forgot password" whenever convenient.

## Environment State
- **premier-crm-prod** (`apnbpcauqrjvkoleisde`): blank slate for customer/property/workflow data (see story item 3 above). No migration from this workflow has been applied here. No write of any kind performed against it during Checkpoint B.
- **premier-crm-e2e** (`slbnizoskumwhleeiccv`): has all Checkpoint B migrations applied and verified; confirmed clean of all spike/test residue after each checkpoint.
- Local dev server: not running.

## Test Status (updated — backend + upload/finalization + template validation + server actions)
- `pnpm typecheck` / `pnpm --filter web build`: clean.
- `pnpm test` (Vitest, full suite): 102/102 pass, including the new real upload/finalization integration test (6/6, against premier-crm-e2e, using both synthetic and a real phone-photo fixture).
- `tests/e2e/request-site-visit-workflow-bot.spec.ts`: 11/11 pass (re-verified standalone after all subsequent changes).
- Capability parity (95 role×capability pairs): pass.
- Full existing E2E suite (serial, re-run near completion): 135 passed, 1 flaky-then-passed (unrelated), 27 skipped. `employee-onboarding-admin-invite-bot` re-run in isolation and reproduced consistently — confirmed pre-existing/unrelated, not fixed here per instruction.
- One real regression found and fixed: a pre-existing unit test's fixture used free-text `preferredDateTime`, correctly rejected by the new stricter validation — fixture updated, not the validation weakened.

## Next Exact Step
Backend, upload/finalization, template validation, and the full server-action layer are complete and tested on this branch. **Remaining for Checkpoint B**: full staff UI (request triage panel, site-visit screens, estimate review), customer portal presentation (wire `get_my_site_visit_summary()` into a portal page), the marketing-site (second repo) half of the public-intake fix, and the remaining handful of test categories not yet preserved as permanent specs (see the implementation doc §8 for the exact list). Push to origin was attempted but blocked by the local permission classifier both times — needs the user's interactive approval, not something resolvable from chat alone. Do not merge, deploy, create the Demo org, onboard Brandon, or tag v1.0 until Checkpoint B is reported complete and explicitly approved.

## Checkpoint Routine (unchanged)
Update this file after each meaningful milestone and before/after any production action. Commit in small logical checkpoints. Never commit secrets. Never leave important decisions only in chat history.
