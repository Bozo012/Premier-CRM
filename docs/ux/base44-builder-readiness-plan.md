# Base44 Builder Readiness Plan

Status: **planning document only. No Base44 GitHub connection has been made. No `Forge-Base44-UX` repository has been created. No Forge application code was changed to produce this document.** Prepared ahead of Kevin's one-month Base44 Builder subscription window, per explicit instruction to plan first and connect only after separate approval.

---

## 1. Official Base44 behavior — verified against current documentation

Source: `docs.base44.com` (GitHub Integration page, fetched live), `base44.com` (blog post, pricing/changelog pages — some blocked by anti-bot 403 and noted below), plus general web search corroboration. Each claim below is labeled by confidence.

| Claim | Status | Source |
|---|---|---|
| GitHub two-way sync requires the **Builder plan or higher** | **Confirmed, official docs** | docs.base44.com/developers/app-code/local-development/github |
| Only the **app owner** may initiate the repository connection | **Confirmed, official docs** | same |
| Changes made in Base44 (including via prompts) **sync to GitHub automatically** | **Confirmed, official docs** | same |
| **There is no manual push mode** — "There's no option to manually push updates from your Base44 app to GitHub" | **Confirmed, official docs, verbatim** | same |
| Base44 **creates a new repository** during setup (does not connect to an arbitrary existing repo you pre-created) — you choose the org/account and a name for the new repo | **Confirmed, official docs** | same |
| The connected repo's default branch **must be named `main`** — "other default branch names, such as `master`, currently aren't supported" | **Confirmed, official docs, verbatim** | same |
| GitHub integration is built around a **React + Vite** project (Tailwind CSS + shadcn/ui component library, React Router) | **Confirmed, official docs** (Introduction/stack overview page) | docs.base44.com/developers/app-code/overview/introduction |
| Base44 apps ship with a **fully managed backend by default**: NoSQL database, built-in user authentication, serverless functions (Deno runtime), realtime via WebSocket, all accessed through the **Base44 SDK** | **Confirmed, official docs** | same |
| **Disconnecting a repository is permanent** — "GitHub sync is permanent. You can't disconnect or transfer the project back to Base44." | **Confirmed, official docs, verbatim** | same |
| If disconnected, **reconnecting to the same repository is not possible** — a different repository name is required | **Confirmed, official docs** | same |
| After connecting GitHub, **Version History can no longer restore pre-connection versions** — "Only versions that exist in the connected GitHub repo are available to restore" | **Confirmed, official docs, verbatim** | same |
| GitHub App installation lets you **select specific repositories**, not all-repository access, during the Builder-app authorization step | **Confirmed, official docs** | same |
| Exact behavior of GitHub sync / backend functions / app editability **after a Builder-plan downgrade or subscription expiration** | **NOT found in official documentation** — the pricing page returned HTTP 403 (anti-bot) on direct fetch, and no changelog/support article surfaced this specific scenario | unresolved, see §9 |
| Whether repository access can be *expanded* later without a fresh install, and exact GitHub App permission scopes requested (contents, actions, webhooks, etc.) | **Not itemized in the fetched documentation** — docs describe the flow ("authorize," "select repositories," "install") but not a permission-by-permission breakdown | unresolved, see §9 |
| Base44's account-specific UI behavior (exact button labels, whether Kevin's specific plan tier shows the GitHub icon, any 2026 plan-model variations Kevin mentioned) | **Not verifiable from this session** — no access to Kevin's live Base44 account | unresolved, see §9 |

**Distinguishing the three categories explicitly, per Kevin's instruction**: everything in the table marked "Confirmed, official docs" is a documented fact, sourced and quoted where the docs used exact language. Nothing in this plan was verified against Kevin's actual account UI — I have no browser session logged into Base44. The three genuinely open items are listed again in §9 as unresolved uncertainties, not silently assumed.

---

## 2. Repository-safety verdict

**SAFE ONLY WITH REPOSITORY ISOLATION.** Direct connection to `Bozo012/Premier-CRM` is **not recommended under any configuration** — full assessment below.

| Option | Verdict | Why |
|---|---|---|
| **A. Connect directly to `Bozo012/Premier-CRM`** | **Rejected** | Automatic, one-way-from-Base44, no-manual-push sync means every Base44 prompt commits directly to a branch of Forge's production repository with no review gate before the commit lands in GitHub. Base44's default project scaffold (React+Vite, its own backend/SDK/auth) is structurally incompatible with Forge's Next.js 15 App Router + pnpm monorepo — Base44 would need to either overwrite Forge's actual app or coexist awkwardly inside it, and disconnection is **permanent** (§1) — there is no safe way to "try it and back out." Also risks exposing/generating references near real Supabase config, migrations, and RLS logic even if unintentional. |
| **B. Connect to a fork/mirror of Premier-CRM** | **Rejected** | Inherits the same "must be named `main`" + auto-sync-to-that-branch behavior on a repo that still contains the full Forge history, Supabase migrations, RLS, server actions, and (if not carefully stripped) `.env.example`/config patterns. A fork doesn't remove the backend-contamination risk — it just moves it one hop away while still carrying real architecture Base44 could plausibly "helpfully" try to modify or reference. No meaningful safety gain over Option A for the specific risk being managed. |
| **C. Dedicated Base44 presentation repository (`Forge-Base44-UX`)** | **Recommended** | Zero Forge backend code, zero Supabase credentials, zero production history ever exists in this repo. Base44's auto-sync-to-`main` behavior is fully contained to a throwaway/reviewable presentation workspace. Forge's own PR review process is completely undisturbed — nothing touches `Bozo012/Premier-CRM` until a human explicitly ports and opens an ordinary PR there (§5). Matches Base44's own default flow (it wants to *create* a new repo, not adopt an existing complex one) with the grain, not against it. |
| **D. Use Base44 without GitHub, transfer code manually (copy/paste or export)** | **Viable fallback, not primary** | Avoids GitHub entirely, so no auto-sync risk at all — but loses git history, diffing, and the "clone and inspect" workflow Option C gives for free. Slower for iterating across a month of generations. Worth knowing as a fallback if GitHub connection proves unexpectedly risky in practice (e.g. an undocumented permission scope), but not the default plan. |
| **E. Base44 local/eject tooling instead of two-way sync** | **Not confirmed to exist as a distinct mode** — the fetched documentation describes only the GitHub-sync path and a "Code Tab" for direct in-app editing; no separate "eject" mechanism was found. Practically equivalent to Option D (copy code out manually) if pursued. | unresolved, see §9 |

**Compatibility notes informing the verdict**:
- **Next.js vs. React/Vite**: incompatible project shapes — Base44 generates a Vite app; Forge is Next.js App Router. Presentation code (JSX/Tailwind/component structure) ports; build tooling, routing, and data-fetching conventions do not, and are not meant to (only Layer 3 markup is ever intended to transfer, per the whole V1.1 program's architecture).
- **pnpm monorepo**: Base44's generated repo will have its own `package.json`/lockfile (likely npm, per the docs' `npm install` reference) — never merge that lockfile or `package.json` into Forge's pnpm workspace. Only source files are ported (§5).
- **Root config conflicts**: a dedicated repo means zero conflict risk with Forge's `next.config`, `tailwind.config`, `tsconfig` — Forge's own config stays authoritative even for ported components (styling gets re-anchored to Forge's existing Tailwind setup during porting, not imported wholesale).
- **Vercel impact**: none — `Forge-Base44-UX` is never connected to Forge's Vercel project; nothing in this plan touches deployment.
- **Backend contamination risk**: **highest-priority risk in this whole plan.** Base44 apps ship a full managed backend (NoSQL DB, auth, serverless functions, WebSocket) behind the Base44 SDK by default (§1). The screening checklist in §6 exists specifically to catch and reject any of that before code ever reaches Forge.
- **Preserving ordinary Forge PR review**: fully preserved under Option C — Base44 never touches `Bozo012/Premier-CRM` directly; every change arrives as a normal, human-reviewed PR (§5).
- **Component portability**: shadcn/ui + Tailwind + React is close enough to Forge's own stack (also Tailwind + a shadcn-influenced `components/ui/` convention, per the V1.1 design system in `forge-v1.1-ux-modernization-plan.md` §4) that markup ports with modest adaptation — the exact seam this whole exercise targets.
- **Behavior after plan downgrade**: unresolved per §1/§9 — mitigated entirely by "export early, export often" regardless of what downgrade does (§9).
- **Rollback/disconnection constraints**: disconnection is permanent and non-reversible for a given repo name (§1) — another reason a disposable, isolated repo is strictly safer than connecting anything that matters.

---

## 3. Dedicated repository: `Bozo012/Forge-Base44-UX`

A presentation harness only — never given access to Forge's real backend, secrets, or data.

### Must contain
React, Vite, TypeScript, Tailwind, Base44-compatible/shadcn-style presentation components, fictional fixtures, presentation contracts (mirroring `docs/ux/base44-presentation-contracts.md`), route mockups, responsive states, accessibility states.

### Must never contain
Production Supabase credentials, E2E Supabase credentials, Supabase clients, service-role keys, Forge migrations, RLS logic, RPC implementations, Forge server actions, production API keys, customer data, Demo data, authentication secrets, direct production requests, or Base44 database entities pretending to be Forge's backend.

### Recommended structure

```
src/
  components/
    ui/            — Base44/shadcn-style primitives (button, card, badge, etc.) — SCAFFOLDING, freely regenerable
    forge/         — Forge-route-specific presentation components (Today, Estimates, Site Inspection, ...) — the REPLACEABLE deliverable
  routes/
    today/
    estimates/
    site-inspection/
    requests/
    customers/
    properties/
    quotes/
    jobs/
    invoices/
    portal/
  contracts/       — TypeScript interfaces mirrored from docs/ux/base44-presentation-contracts.md — READ-ONLY reference, never generated/edited by Base44 prompts
  fixtures/        — fictional mock data per §4 of docs/ux/base44-presentation-contracts.md — SCAFFOLDING
  states/          — named state combinations (empty/loading/error/populated) driving route mockups — SCAFFOLDING
  styles/          — Tailwind config, design tokens reproducing Forge's visual language — SCAFFOLDING, refined once then mostly stable
  docs/            — this repo's own local copy of the relevant contract/handoff docs for Base44's own context — SCAFFOLDING
```

**Replaceable vs. scaffolding, explicitly**: everything under `components/forge/` and `routes/*/` is the actual deliverable — what gets reviewed and ported into Forge. Everything else (`components/ui/`, `contracts/`, `fixtures/`, `states/`, `styles/`, `docs/`) is workspace scaffolding that exists to give Base44 something real to build against — it is never itself ported into Forge; Forge already has its own equivalents (`packages/db` types, `_lib/view-model.ts` contracts, real E2E fixtures).

---

## 4. Presentation contracts

Full contract package: `docs/ux/base44-presentation-contracts.md` (this same commit). Summary: `TodayViewModel` (mirrors the real, merged `apps/web/app/(app)/today/_lib/view-model.ts` + `_components/*.tsx` prop shapes exactly — not invented), `EstimateViewModel` and `SiteInspectionViewModel` (planned, derived from the modernization plan's §6.2/§6.3 requirements — Estimates/Site Inspection are not built yet, so these are forward-looking contracts, clearly labeled as such). All contracts are presentation-only: they describe *what data and callbacks a component receives*, never how Forge computes, authorizes, or persists any of it.

---

## 5. Component transfer workflow

1. Base44 commits generated presentation work to `Forge-Base44-UX`'s `main` (automatic, per §1 — no manual push exists).
2. Kevin/Claude review the generated diff **in that repository**, on GitHub or via local clone.
3. **Reject** anything that imports the Base44 SDK, defines Base44 "entities," implements backend/auth logic, or makes a direct data-access call of any kind (screening checklist, §6).
4. **Extract only** the approved Layer-3-equivalent markup/styles/components — nothing from `contracts/`, `fixtures/`, or any Base44-backend-adjacent file.
5. Create a **fresh feature branch in `Premier-CRM`** (e.g. `feature/forge-v1.1-estimates-redesign`, following the exact branch-per-batch pattern already established by PR #104/#105).
6. **Port** the presentation components into the established Forge route seam (e.g. `apps/web/app/(app)/estimates/_components/`), adapting import paths/styling conventions to match Forge's actual `components/ui/` and Tailwind setup — not a blind file copy.
7. **Bind** them to Forge's real Layer 2 props and callbacks (the actual `EstimateViewModel`-shaped data Forge's own `page.tsx` computes, and the actual server actions/RPCs already reviewed and proven in Forge — never anything Base44 invented).
8. Run unit, E2E, accessibility, responsive, typecheck, and build validation — the same gate every V1.1 batch has used (`pnpm test`, `pnpm typecheck`, `pnpm --filter web build`, the relevant Playwright suite, viewport checks).
9. Open an **ordinary Premier-CRM PR** — same review discipline as PR #104/#105 (scope check, architecture verification, no backend changes unless separately and explicitly authorized).
10. **Merge only after review** — never automatically, never as a side effect of Base44's own sync.
11. **Never merge `Forge-Base44-UX` git history directly into `Premier-CRM`** — no `git merge`/`git subtree`/history-preserving import across the two repos, ever. Porting is always a fresh, hand-reviewed extraction of specific files' content, not a repository merge.

---

## 6. Security screening checklist (apply to every extraction, step 3 above)

- [ ] No direct Base44 SDK import (`@base44/sdk` or equivalent) anywhere in the extracted files.
- [ ] No direct Supabase import — extracted files must only ever consume props/callbacks, never call `createClient`/`createBrowserClient`/anything backend-adjacent.
- [ ] No hard-coded mock data leaking into what's ported (fixtures stay in `Forge-Base44-UX`, never copied into Forge as if real).
- [ ] No hidden workflow assumption (e.g. a component that assumes "if status is X, show button Y" instead of receiving that decision as a prop — this is exactly the class of defect the spike's `buildQuoteActivityRows()` relocation caught, see `docs/ux/base44-compatibility-spike-report.md`).
- [ ] No duplicated status/eligibility rule that already exists in a Forge Layer 1/2 file.
- [ ] No unsafe HTML (`dangerouslySetInnerHTML` or equivalent) without a specific, reviewed reason.
- [ ] No inaccessible controls (non-semantic `<div onClick>` instead of `<button>`/`<a>`, missing accessible names, color-only status signals — matching the accessibility bar already established in `forge-v1.1-today-redesign.md`).
- [ ] No unsupported/unreviewed new dependency introduced into Forge's `package.json` merely to satisfy ported code — if a component needs a new library, that's a separate, explicit decision, not a silent side effect of porting.
- [ ] No fixed desktop-only widths — must degrade to phone/tablet per the V1.1 responsive rules.
- [ ] No leaked credentials, tokens, or API keys of any kind in any ported file (grep before every port).
- [ ] No generated backend file (Base44 "entity" definitions, Deno function stubs, auth config) accidentally swept into the extraction.

---

## 7. GitHub permissions plan

**Grant**: Base44 Builder app installed with **"only select repositories"** access, selecting **only `Forge-Base44-UX`**.

**Do not grant**: all-repositories access; access to `Premier-CRM`; access to `premier-property-maintenance` (the marketing-site repo).

**Secrets**: none placed in `Forge-Base44-UX` — it never needs real Supabase/Forge credentials for its stated purpose (presentation only, fictional fixtures).

**Branch protection**: per §1, Base44 requires unrestricted, automatic write access to `main` to function (no manual-push mode exists) — do **not** enable branch protection rules on `Forge-Base44-UX`'s `main` that would block Base44's own commits, since that would simply break the integration, not add safety (the actual safety boundary is "this repo contains nothing sensitive," not "protect this branch"). This is explicitly scoped to `Forge-Base44-UX` only — it says nothing about `Premier-CRM`'s own branch protection, which is untouched by any of this.

**Immediately after repository creation**: clone `Forge-Base44-UX` locally. Pull and inspect after every major Base44 generation step (not just at the end of the month). Commit/export approved checkpoints frequently — treat every Base44 session as potentially the last one you can cleanly review before the next auto-sync overwrites context.

---

## 8. One-month Builder execution plan

**Week 1 — Foundation + Today**
- Create `Forge-Base44-UX`, connect GitHub per §10's exact steps.
- Reproduce Forge's shared visual language (design tokens, spacing/typography scale from `forge-v1.1-ux-modernization-plan.md` §4) inside the dedicated repo.
- Load the `TodayViewModel` contract and fictional Today fixtures/states (`base44-presentation-contracts.md` §2/§5).
- Generate real Today alternatives with Base44; refine and select one direction.
- Export/commit the approved Today components; port into a fresh `Premier-CRM` branch per §5, bind to the real, merged Today Layer 1/2 (`packages/db/queries/today-actions.ts`, `apps/web/app/(app)/today/_lib/view-model.ts`), validate, open a normal PR.

**Week 2 — Estimates**
- Estimates list, detail/editing, line items, pricing-review handoff presentation.
- Mobile/tablet usability per the plan's §6.2 requirements.
- Export and integrate selected components the same way.

**Week 3 — Site Inspection**
- One-handed mobile workflow, photos (presentation only — §Photo boundary below), hazards, measurements/materials, dictation interaction design (presentation only — §Dictation boundary below).
- Export and integrate.

**Week 4 — Remaining routes + wrap-up**
- Requests, Customers/Properties, Quotes/Jobs/Invoices, portal visual direction.
- Shared-component consolidation (promote anything proven reusable across ≥2 routes, matching the existing UX-A promotion discipline).
- Export every remaining useful component; clone/pull the final `Forge-Base44-UX` state.
- Document unfinished work explicitly (don't let anything go unaccounted for).
- Verify all generated code is available locally, independent of Base44's own continued availability, before the subscription window closes (§9).

**Credit-efficiency rules**: never regenerate the entire app repeatedly; work one route/component family at a time; lock contracts before iterating visually; write explicit prompts describing only Layer 3 (never ask Base44 to "add a feature" — only "redesign this presentation given this exact data shape"); save approved checkpoints in git as you go; prioritize Today → Estimates → Site Inspection, in that order, matching Kevin's stated priority; never spend credits on backend entities/integrations (screening checklist catches anything that slips through, but the cheaper fix is never generating it); use screenshots + focused adjustment prompts for refinement rather than full-rebuild prompts; export early rather than batching everything to week four.

### Photo boundary (Site Inspection week)

Base44 **may design**: camera/gallery buttons, upload-progress UI, uploaded-thumbnail display, failure/retry states, remove controls, finalization indicators, internal/customer-visible indicators, completion-blocked messaging.

Base44 **must not implement**: Storage access, upload signing, quarantine paths, EXIF removal, finalization actions, organization association, customer-safe projection, or persistent visibility policy — all of these remain exactly as already built in `apps/web/app/(app)/site-visits/_components/photo-upload.tsx` and `apps/web/lib/site-visit-attachments.ts` (functional, authoritative, unmodified by any of this V1.1 work). The exact props/callbacks a ported Site Inspection Layer 3 photo component receives from Forge are specified in `base44-presentation-contracts.md` §3 (`onAddPhoto`, `onRetryPhoto`, `onRemovePhoto` as callback contracts only — never an implementation).

### Dictation boundary (Site Inspection week)

Base44 **may design**: idle button, microphone-permission state, listening state, stop control, processing state, transcript preview, append/replace controls, unavailable state, permission-denied state, error state.

Base44 **must not**: store audio, connect a transcription service, request microphone access automatically, bypass field authorization, save/submit records directly, assume universal browser support, or transmit production content. This month's scope is **browser-native Web Speech API presentation only** — no hosted provider integration, per Kevin's decision recorded in `forge-v1.1-ux-modernization-plan.md` §10. Dictation stays a callback contract (`onStartDictation`, `onStopDictation`) and a mocked state set until real Forge implementation is separately approved and scoped — not built this month, only designed.

---

## 9. Downgrade / expiration plan

**Verified from official docs**: GitHub sync itself, once established, is permanent at the *connection* level (§1) — disconnecting is a one-way action you take, not something that automatically happens on downgrade. **Not verified** (blocked by 403 on the pricing page, not found elsewhere): whether a downgrade from Builder to a lower tier silently disables the sync feature going forward (new commits stop syncing) while leaving the existing repo/history intact, versus some other behavior; whether the Base44 app editor itself remains viewable/editable at a lower tier; whether serverless backend functions stop executing; whether the GitHub connection keeps syncing or freezes.

**Given that uncertainty, the plan does not depend on any specific answer** — the mitigation is unconditional:

- Clone `Forge-Base44-UX` locally now, and keep it current (already required by §7).
- Ensure all generated work is actually pushed to GitHub before the subscription's final days (Base44's own auto-sync should guarantee this if you're regularly prompting, but verify explicitly at the end of each week).
- Create a final git tag/checkpoint in `Forge-Base44-UX` (e.g. `builder-month-final`) before the window closes.
- Archive screenshots and the contract documents used, outside of Base44 entirely (already living in `Premier-CRM`'s own docs).
- Record the exact dependency versions (`package.json`/lockfile) at that final checkpoint.
- Preserve the lockfile as committed.
- Document how to run the final `Forge-Base44-UX` state locally (a short README, if Base44 didn't already generate one worth trusting).
- Remove any accidental secret found during the final review pass (shouldn't exist per §3's "must never contain" list, but verify).
- **Do not disconnect merely because the month ends** — disconnection is permanent and irreversible for that repo name (§1); there's no benefit to disconnecting a dormant, already-isolated, already-cloned repository, and real downside if it turns out you need one more read of its history.

---

## 10. Click-by-click setup instructions (for Kevin, after approval — not executed this session)

1. In Base44, create a **new app** intended only as the Forge presentation workspace (not a fork of anything, not connected to any existing app) — this becomes the source for `Forge-Base44-UX`.
2. Open that app's **Dashboard**, then click the **GitHub icon** in the top-right.
3. Click **Connect to GitHub**, then **Authorize Base44 Builder** when prompted (requires the Builder plan, already active).
4. When GitHub's own authorization screen appears, select **your (Kevin's) GitHub account/organization** — the one that also owns `Bozo012/Premier-CRM`, but you are not selecting that repository.
5. On the repository-access step, choose **"Only select repositories"** — do **not** choose "All repositories."
6. Create the **new repository** Base44 offers to generate, named **`Forge-Base44-UX`** (per §3). Do **not** select or connect to `Premier-CRM`, `premier-property-maintenance`, or any existing repository.
7. Confirm the connection completed and that the repository's default branch is `main` (required, §1).
8. **Clone `Forge-Base44-UX` locally** immediately (`git clone https://github.com/Bozo012/Forge-Base44-UX.git`), in a location clearly separate from your `Premier-CRM` checkout.
9. Open the cloned repo and **verify by inspection**: no Forge secrets, no `.env` with real values, no direct Supabase/backend code exists anywhere in the initial scaffold Base44 generated.
10. Enter the **first controlled Base44 prompt** (§11) inside the Base44 app editor.

---

## 11. First Base44 prompt (exact text, prepared — not sent this session)

```
You are building the presentation layer only for a route called "Today" in a
larger product called Forge. This is a presentation-only exercise: you are
NOT building a backend, NOT building authentication, NOT connecting to any
database, and NOT making any API calls of any kind.

Today's data and every available action are supplied to your components as
props and callback functions — you never fetch, compute, authorize, or
decide anything yourself. Treat every prop as already correct and already
authorized by the time it reaches you.

First, establish this presentation-only architecture:
- Create fictional, clearly-labeled mock fixtures for a "Today" dashboard:
  a fictional company, a fictional signed-in staff member, a handful of
  fictional customers/properties/jobs/estimates/quotes — no real names,
  addresses, or amounts.
- Implement a TodayViewModel-shaped set of props (I will provide the exact
  TypeScript interface next) covering: organization identity, a role/
  capability-filtered list of "attention items" needing action, today's
  scheduled work, a small set of operational counts (never revenue/
  accounting totals), a capability-filtered list of quick actions, and
  simple navigation destinations.
- Implement loading, empty, and a controlled (non-technical) error state
  for this dashboard.
- Reproduce a clean, modern shared visual foundation (typography scale,
  spacing, a small status-color system, card treatments) that could
  plausibly extend to other dashboard-style screens later — but only build
  the Today screen itself right now.
- Generate one polished, complete Today design using only mock callback
  functions (e.g. onNavigate, onSwitchOrganization, onSignOut, onOpenAction)
  — every callback should just log or show a toast, never actually do
  anything, since real behavior is supplied separately by the host app.
- Make no backend entities, no authentication system, no Supabase
  connection, no production API calls of any kind.
- Clearly isolate the actual replaceable presentation components (the ones
  meant to be extracted later) from any workspace scaffolding you generate
  around them — put the real deliverable under a components/forge/today/
  path.

Do not build Estimates or Site Inspection yet — Today only, for now.
```

---

## 12. Final verdict

# READY AFTER LISTED ACTIONS

All planning prerequisites are complete: dedicated-repository strategy selected (§2/§3), GitHub permissions understood (§7), `Premier-CRM` fully protected from any Base44 access (§2/§7), presentation contracts defined (`base44-presentation-contracts.md`), fictional states specified (same doc, §5), component-transfer workflow defined (§5/§6), month-long plan defined (§8), downgrade/export plan defined (§9), click-by-click setup prepared (§10), first Base44 prompt prepared (§11).

**"Listed actions" required before connecting**: none are Forge-code actions — they are the account-side steps in §10, which this session explicitly did not execute, plus Kevin's own final go-ahead. No further planning work blocks readiness.

**Unresolved account-specific uncertainties** (do not block the verdict, but should be watched during Week 1): exact behavior on Builder-plan downgrade/expiration (§1/§9, mitigated unconditionally by early/frequent export regardless of the answer); the precise GitHub App permission scopes requested during authorization (§1); whether Kevin's specific account/plan shows any 2026 plan-model variation from the documented flow.
