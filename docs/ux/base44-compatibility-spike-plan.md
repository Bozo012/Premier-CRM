# Base44 Compatibility Spike — Plan (Prepared, Not Run)

Status: **plan only.** This document defines the spike's scope, method, and acceptance criteria. Per instruction, the spike itself is not executed as part of this phase — it requires separate explicit approval to begin, after the Pre-Base44 Workflow Refinement phase and (per the most recent instruction) after the Forge/Foundry naming checkpoint reaches its approved stopping point.

## Goal

Prove — cheaply, on one real, already-shipped surface — that a Base44-produced UI can be integrated into this Next.js app without touching any backend boundary (queries, actions, RPCs, RLS, org context, capability enforcement). If it can't be proven cleanly on one page, that's exactly the signal to have before committing to a broader redesign.

## Preferred first surface: `/today`

Chosen because:
- It's read-heavy (snapshot counts + the new action queue), with a small, well-understood set of server-side data dependencies — lower risk than a page with complex mutating flows (estimates, jobs, invoices).
- It already has full e2e coverage for its most complex piece (the action queue, PR #87) and unit-level coverage is not applicable (server component).
- It just shipped in this phase, so its current behavior is fresh and fully documented (§5 of `docs/ux/base44-handoff.md`) — a good baseline to diff a redesigned version against.
- It's role-aware and mobile-relevant, so a successful spike here exercises the two riskiest integration points (capability-gated rendering, mobile layout) without touching a financial mutation flow.

## What the spike must prove

1. **Base44 UI integrates into the current Next.js app** — as a component tree rendered inside the existing `app/(app)/today/page.tsx` server component, not a standalone app, iframe, or separate deployment.
2. **Existing server queries/actions remain intact and unmodified** — the spike consumes the existing `Promise.all([...])` data (snapshot counts, `getTodayActionItems()` result, `pendingQuoteActivity`) exactly as already fetched; it does not add new queries, does not change `packages/db` in any way.
3. **Active-org context works** — the redesigned page still reflects `getActiveOrgContext()`'s resolved org with no client-side override or assumption.
4. **Role-aware rendering works** — the action queue's capability-gated task types (§5 of the handoff doc) render/hide correctly per role, using the same `hasCapability()`-driven data already returned by the query layer (the redesign consumes the already-filtered result; it must not re-implement or second-guess the filtering).
5. **Mobile layout works** — respects safe-area insets, meets the touch-target minimums in §12 of the handoff doc, and does not regress the bottom-nav fix shipped this phase.
6. **Typecheck/build stay clean** — `pnpm typecheck` and `pnpm --filter web build` pass with the spike's changes present.
7. **Supabase/RLS/RPC layer is completely untouched** — zero new migrations, zero RLS/RPC changes; provable by `git diff` showing no changes under `supabase/` or `packages/db/`.

## Exact files/routes in scope

- `apps/web/app/(app)/today/page.tsx` — the server component may be restructured to pass its already-fetched data into new presentation components, but its data-fetching (`Promise.all`, `getActiveOrgContext`, `getTodayActionItems`, etc.) stays as-is.
- New presentation-only components under a scoped directory, e.g. `apps/web/app/(app)/today/_components/` — this is where Base44-authored/derived UI would actually live.
- **Out of scope, must show zero diff**: everything under `packages/db/`, `packages/shared/`, `supabase/`, every other route in `app/(app)/*`, and `app/portal/*`.

## Integration method

Base44 output (component markup/styles) is adapted into standard React Server/Client Components following this repo's existing conventions (`"use client"` only where interactivity requires it, with the one-line comment convention already established in `CLAUDE.md`) — not embedded via iframe, not loaded as an external script, not introduced as a parallel routing layer. This keeps the integration testable with the same tools (Playwright, vitest, `tsc`) already used for everything else in the app.

## Rollback method

The spike happens on a dedicated branch (e.g. `spike/base44-today-compat`), never merged to `main` without the findings being reviewed and explicitly approved first. If the spike fails any acceptance criterion, the branch is simply abandoned/deleted — no partial merge, no "keep the good parts" cleanup needed, since nothing outside the scoped files in §"Exact files/routes in scope" would ever be touched. `/today` on `main` remains exactly as shipped in PR #87 unless and until the spike is reviewed and approved to merge.

## Acceptance criteria (all required to call the spike a success)

- [ ] All 7 "must prove" items above are demonstrated, not just asserted.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm --filter web build` clean.
- [ ] `pnpm test` — no regressions (138/138 baseline as of this phase).
- [ ] Existing `today`-relevant e2e coverage still passes: `today-action-queue-bot.spec.ts` (7 tests, this phase), plus a manual/E2E pass confirming the redesigned page still shows/hides the action queue correctly per role.
- [ ] `git diff main` shows zero changes outside the files listed in "Exact files/routes in scope."
- [ ] A visual/functional comparison against the current `/today` (screenshot or recording) confirming no loss of information or capability-gated content.

## Test plan

1. Run the full existing `today-action-queue-bot.spec.ts` suite against the spike branch unmodified — it calls `getTodayActionItems()` directly, so it should be unaffected by presentation changes and serves as a pure regression check on the data layer staying untouched.
2. Manual role-by-role walkthrough (owner, employee, subcontractor, viewer) against the Demo organization (never real PPM data — see handoff doc §10) confirming the redesigned action queue and snapshot cards render the same underlying information, correctly gated per role.
3. Mobile viewport walkthrough (at minimum: a narrow phone width) confirming touch targets, safe-area handling, and no horizontal overflow.
4. `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` — same three-command validation gate used throughout this session.

## Code-review boundaries

A reviewer approving the spike's findings should specifically verify:
- No file under `supabase/` or `packages/db/` appears in the diff.
- No new RPC calls, no new Supabase client queries beyond what `/today` already performs today.
- No capability check was removed, weakened, or reimplemented client-side in a way that could diverge from `hasCapability()`.
- No hardcoded org ID, role, or org-specific data appears anywhere in the new components (a common Base44-generated-UI risk — generated mockup code sometimes hardcodes sample data that must not survive into the integrated version).

## What happens after the spike

Per the handoff doc's stated sequencing: spike findings are written up and returned for review; nothing about a broader Base44 redesign begins until that report is explicitly reviewed and approved. A successful spike is evidence the integration pattern works — it is not itself authorization to proceed to other pages.
