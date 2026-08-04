# Base44 Today Sync & Portability Audit

Status: **audit complete; controlled Today visual integration implemented on a feature branch, PR opened, not merged.** No push was made to `Forge-Base44-UX`. No Base44 output was modified. Estimates and Site Inspection remain untouched. See §13 for the integration record.

---

## Phase 1 — GitHub sync-state verification

**Classification: A — Base44 files are already committed to remote `main`.**

Evidence (live GitHub API + a fresh local clone, gathered this session):

- `gh repo view Bozo012/Forge-Base44-UX` confirms the repo exists, private, default branch `main`, created `2026-08-04T14:23:18Z`, last pushed `2026-08-04T14:55:08Z`.
- `git ls-remote` HEAD = `adee72ef881be3023ef78332c28540b2326b3a89`.
- A fresh clone to `C:\dev\Forge-Base44-UX` (separate from `C:\dev\Premier-CRM`) shows local `main` at the identical commit `adee72e`, "up to date with 'origin/main'," clean working tree — **no local/remote drift**.
- Commit history on `main` (newest first): five commits authored by `base44-builder[bot]` (`245833847+base44-builder[bot]@users.noreply.github.com`) between `14:32:27Z` and `14:55:06Z`, all titled "File changes"; below those, commits authored by `Bozo012` (`sommerskevin3@gmail.com`, Kevin's own account) at `14:17–14:21Z` (`Update base44 packages`, `chore: add base44 CLI config files`, `chore: stop committing base44/.app.jsonc; use base44 link`, `chore: add boilerplate auth templates`, and one more "File changes"); earliest is `base44-bot`'s `Initial commit` (`8bfec9a`, `2026-07-09T10:31:59Z`).
- Only one branch exists: `refs/heads/main` (`git branch -a` on the clone, and `gh api .../git/refs`) — no secondary/preview branches.
- Full repository tree (`git/trees/main?recursive=1`) contains **all 14** components Kevin listed under `src/components/forge/today/` (`TodayDashboard.tsx`, `TodayHeader.tsx`, `MobileStaffSheet.tsx`, `DesktopNavigation.tsx`, `MobileNavigation.tsx`, `AttentionSection.tsx`, `WorkSection.tsx`, `OperationalSnapshot.tsx`, `QuickActions.tsx`, `BrowseLinks.tsx`, `StatusBadge.tsx`, `ThemeControl.tsx`, `useForgeAppearance.ts`, `TodayState.tsx`, `ForgeMark.tsx`), plus `src/contracts/today.ts`, `src/styles/forge-today.css`, `src/docs/today-visual-reference.md`, and the three files Kevin explicitly said must not enter Forge (`src/routes/today/TodayRoute.tsx`, `src/states/todayScenarios.ts`, `src/fixtures/forgeToday.ts`) — all present remotely, exactly where expected. **No file listed by Kevin is missing.**
- One extra file exists beyond Kevin's list: `src/docs/today-presentation-boundary.md` — a self-generated portability guide from Base44 itself (reviewed, harmless, corroborates the same file classification independently — see Phase 4).
- No `.gitattributes`, no Git LFS pointers, no binary/generated artifacts of concern found in the tree.
- **Base44's chat claim is verified, not merely trusted**: "cannot directly commit from the builder" is consistent with the repo's single webhook (`https://app.base44.com/api/webhooks/github`, `push` events only, `active`, last delivery `200 OK`) — this is a **push-notification** webhook (GitHub → Base44), not a write credential. The actual write path (Base44 → GitHub, appearing as `base44-builder[bot]` commits) is a separate, already-installed GitHub App write credential, not visible via this webhook. "Local changes pushed to `main` sync back to Base44" is consistent with the same webhook mechanism (a push to `main` notifies Base44's backend) but was not tested this session — no push was made, per the explicit "do not push" constraint.

**Conclusion**: the complete, real Base44-generated Today output already exists in `Bozo012/Forge-Base44-UX`'s `main` branch and in the local clone. No sync-recovery action, manual export, or workaround is required (Phase 3 is not applicable — state A skips directly to Phase 4).

---

## Phase 2 — Base44 connection & permissions verification

| Check | Result | Evidence |
|---|---|---|
| Default branch is `main` | **Confirmed** | `gh repo view` |
| Repository sync active | **Confirmed** | webhook `active: true`, last response `200 OK` |
| `Forge-Base44-UX` has exactly one human collaborator | **Confirmed** | `Bozo012` (admin) only |
| `Premier-CRM` has no Base44 webhook | **Confirmed** | `gh api repos/Bozo012/Premier-CRM/hooks` → `[]` |
| `Premier-CRM` has no `base44-builder` bot as a collaborator | **Confirmed** | only `Bozo012` listed |
| `premier-property-maintenance` has no Base44 webhook | **Confirmed** | `gh api .../hooks` → `[]` |
| `premier-property-maintenance` has no `base44-builder` bot as a collaborator | **Confirmed** | only `Bozo012` listed |
| GitHub App's exact per-repository installation scope | **Not directly enumerable with this session's credentials** | `gh api user/installations` returned `403` — "You must authenticate with an access token authorized to a GitHub App" (the CLI's PAT-based token can't list App installations; this requires either the Base44 GitHub App's own token or a manual check in GitHub → Settings → Installed GitHub Apps). See "unresolved" below. |
| No production secret/env value in the repository | **Confirmed** | repo-wide grep across `src/components/forge/today`, `src/contracts`, `src/styles`, `src/routes/today`, `src/states`, `src/fixtures` for `process.env`, `import.meta.env`, `api[_-]?key`, `authorization` — zero matches in the Today-relevant tree |
| No Supabase URL/key anywhere in the Today-relevant tree | **Confirmed** | same grep pass, zero matches for `supabase` |
| Base44 backend/entity code exists in the repo, but is isolated | **Confirmed, isolated** | `base44/entities/User.jsonc` (a generic auth-role schema) and `src/api/base44Client.js` (imports `@base44/sdk`, wires `createClient`) exist at the workspace root — expected scaffolding for a Base44 app, but a direct grep confirms **zero references** to `base44Client` or `@/api` from any file in `src/components/forge/today`, `src/contracts`, or `src/styles` |
| No unexpected GitHub API connector attached | **No evidence of one** | only the single documented `app.base44.com` webhook exists on the repo |

**Direct, repo-level evidence** (webhooks + collaborators, checked on all three repositories) shows no footprint of Base44 access on `Premier-CRM` or `premier-property-maintenance`. This is strong circumstantial confirmation the isolation plan is holding, but it is **not the same** as a first-party read of the GitHub App's own installation-scope screen, which this session's credentials cannot query (see unresolved items below). **No violation was found**, so no permission change was made, per the instruction to leave permissions alone absent a real violation.

**Recommendation for Kevin** (not executed): open GitHub → **Settings → Applications → Installed GitHub Apps → Base44 Builder**, and visually confirm the "Repository access" list shows only `Forge-Base44-UX`. This is the one verification step this session's tooling cannot perform on your behalf.

---

## Phase 3 — Sync recovery decision

**Not applicable.** State is A (Phase 1), so per the task's own branching instructions, no export/recovery path is needed — the complete output already exists in git history on `main` and was pulled cleanly with zero duplicate commits and zero history rewriting.

---

## Phase 4 — Presentation-repository audit

### Dependency / contamination scan (repo-wide `package.json`, plus targeted greps)

`package.json` (root, `"name": "base44-app"`) confirms the workspace-level stack: `@base44/sdk`, `@base44/vite-plugin` (root build tooling — expected, isolated to the Base44 workspace, never referenced by Today files per the grep above), React 18, React Router 6, Vite 6, Tailwind 3, Radix UI primitives, `@stripe/react-stripe-js`/`@stripe/stripe-js` (present in the workspace dependency graph as generic Base44-boilerplate payment tooling — **not imported anywhere in the Today component tree**, confirmed by grep), `@tanstack/react-query`, and various presentational libraries (`framer-motion`, `lucide-react`, `recharts`, etc.) — none of which appear in the Today import graph beyond `lucide-react` (icons only).

Targeted contamination grep across every Today-relevant path (`src/components/forge/today`, `src/contracts`, `src/styles`, plus the three excluded files for completeness) for `@base44/sdk`, `base44Client`, `supabase`, `fetch(`, `axios`, `websocket`, `localStorage`, `sessionStorage`, `process.env`, `import.meta.env`, API-key/auth patterns:

**One finding**: `useForgeAppearance.ts` reads/writes `localStorage` (key `forge-presentation-appearance`) — a second, independent appearance-persistence mechanism. No other match anywhere in the Today tree. Zero Base44 SDK imports, zero Supabase references, zero network calls, zero hardcoded secrets in any portable component.

### Vite / Tailwind / tsconfig / alias notes

- `vite.config.js` wires the `@base44/vite-plugin` (HMR notifier, navigation notifier, analytics tracker, visual-edit agent — all Base44-platform build tooling) and resolves the `@/*` → `./src/*` path alias (declared in `jsconfig.json`). None of this transfers to Forge; Forge is Next.js, not Vite, and already has its own alias convention.
- `tailwind.config.js` is a standard Base44/shadcn scaffold config — not inspected line-by-line since the Today components' CSS is fully self-contained in `forge-today.css` (plain CSS custom properties + hand-written utility classes, not dependent on Tailwind's theme namespace, "so components don't depend on a Tailwind config namespace" per the file's own header comment) — this was clearly a deliberate portability choice by Base44/the prompt design and makes porting materially easier.
- `package-lock.json` (npm, not pnpm) exists as expected for a non-Forge workspace — never merged into Forge's pnpm lockfile.

### File-by-file classification

| File | Classification | Notes |
|---|---|---|
| `src/contracts/today.ts` | **Portable with adaptation** | Clean, self-contained TypeScript interfaces (`TodayViewModel`, `TodayCallbacks`, etc.) but field names/shape diverge from Forge's real, already-merged `TodayViewModel` (see Phase 5) — use as a naming/shape reference, do not import verbatim; Forge's real contract (`base44-presentation-contracts.md`) is authoritative. |
| `TodayDashboard.tsx` | **Portable with adaptation** | Pure composition, all data via props; contains one presentation-workspace-only string ("Fictional workspace preview") to strip; renders both `DesktopNavigation`/`MobileNavigation` internally — needs adaptation to defer to Forge's shared shell (Phase 5). |
| `TodayHeader.tsx` | **Portable with adaptation** | Clean, accessible, all data via props/callbacks. Needs its org-switcher `<select>` and staff/sign-out buttons rebound to Forge's real `OrgSwitcher`/`signOutAction`. |
| `MobileStaffSheet.tsx` | **Portable with adaptation** | Clean, self-contained dropdown with proper focus/escape handling; needs `"use client"` on port (uses `useState`/`useRef`/DOM listeners). |
| `DesktopNavigation.tsx` | **Reject as global nav / portable only as a route-local pattern reference** | Renders a full, second, Today-only left-nav shell. Forge already has a real, shared, persistent desktop nav (UX-A's `app-desktop-nav`/`app-shell`, live across every authenticated route). Kevin's instruction explicitly forbids auto-replacing Forge's shared nav — see Phase 5 mapping. |
| `MobileNavigation.tsx` | **Needs security/design review — reject as-is** | **Hardcodes its own nav item list internally** (`{id, label, Icon}` for Today/Requests/Jobs/More is not a prop — only `onNavigate` is a prop). This is exactly the "hidden workflow assumption / hard-coded data" pattern the screening checklist exists to catch. Forge already has its own real mobile bottom nav (UX-A). Do not port this file's data; if its visual treatment is wanted, it must be re-implemented driven by Forge's real nav destination list. |
| `AttentionSection.tsx` | **Portable as-is** | Fully props-driven, accessible (`aria-labelledby`, semantic `<article>`/`<button>`), no hidden logic. |
| `WorkSection.tsx` | **Portable as-is** | Fully props-driven, responsive grid, accessible `<time>`/`<ol>` structure. |
| `OperationalSnapshot.tsx` | **Portable as-is** | Fully props-driven; grid flexes to item count (matches Forge's real 3-item snapshot without hardcoding a count). |
| `QuickActions.tsx` | **Portable as-is** | Fully props-driven, correctly renders nothing when `items` is empty (matches Forge's capability-filtering pattern). |
| `BrowseLinks.tsx` | **Needs product decision — reject in current form** | Kevin's merged Today redesign **deliberately removed** the old "browse" grid to avoid duplicating the new persistent desktop nav (`forge-v1.1-today-redesign.md`, "What changed" section). Porting this component would reintroduce exactly the duplication Kevin already ruled out. Component code itself is clean/portable; whether it belongs on Today at all is a product question, not this audit's to decide. |
| `StatusBadge.tsx` | **Portable as-is** | Icon + text label always paired, matches Forge's existing accessibility bar exactly. |
| `ThemeControl.tsx` | **Portable as-is (presentation only)** | Pure, controlled component — no persistence of its own; safe regardless of how appearance state ends up managed (Phase 6). |
| `useForgeAppearance.ts` | **Reject as-is — workspace-only** | Second, independent `localStorage`-based appearance-persistence system. See Phase 6 — Forge currently has **no existing appearance/theme preference system to be authoritative**, which is itself a product decision Kevin needs to make, not something this audit or a "presentation port" should decide unilaterally. |
| `TodayState.tsx` | **Portable as-is** | Matches Forge's existing `LoadingSkeleton`/`ErrorState` shared-primitive pattern from UX-A closely enough to either reuse directly or trivially adapt. |
| `ForgeMark.tsx` | **Portable as-is** | Small, self-contained brand mark; trivial to adapt to Forge's existing branding constants (`packages/shared/brand.ts`). |
| `src/styles/forge-today.css` | **Portable with adaptation** | Clean, self-contained HSL custom-property tokens + hand-written utility classes, explicitly designed for portability (own file header says as much). Needs merging into Forge's actual Tailwind/CSS token source, not imported verbatim as a parallel CSS file (Phase 6). |
| `src/docs/today-visual-reference.md`, `src/docs/today-presentation-boundary.md` | **Workspace-only (reference material)** | Useful reading for the porting session; never themselves ported as application files. |
| `src/routes/today/TodayRoute.tsx` | **Reject — workspace-only, per Kevin's explicit exclusion list** | Confirmed: preview harness only, wires mock callbacks + scenario switcher, imports the two other excluded files. |
| `src/states/todayScenarios.ts` | **Reject — workspace-only, per Kevin's explicit exclusion list** | Not read in full this session (not needed — excluded outright by Kevin's own list; confirmed present and referenced only by `TodayRoute.tsx`). |
| `src/fixtures/forgeToday.ts` | **Reject — workspace-only, per Kevin's explicit exclusion list** | Spot-checked: clearly fictional (`Northstar Fictional Property Care`, `Customer Cedar`, `Cedar Demo Site`, etc.) — confirms no real Forge/Demo/PPM data leaked into Base44's workspace, but still correctly excluded from Forge per Kevin's instruction regardless. |
| `src/api/base44Client.js`, `base44/entities/User.jsonc`, `src/components/ui/*`, `src/pages/*`, `src/lib/AuthContext.jsx`, etc. | **Reject — not part of Today's portable set at all** | Base44 platform scaffolding (auth pages, SDK client, generic shadcn primitives outside the Today component tree). Not requested by Kevin's file list, not referenced by any Today component, never to be touched. |

**No unsafe HTML** (`dangerouslySetInnerHTML` or equivalent) found anywhere in the Today tree. **No fixed desktop-only widths** — every layout file uses responsive Tailwind breakpoint classes (`sm:`/`lg:`/`xl:`). **No inaccessible controls** — every interactive element is a native `<button>`/`<select>`, every icon-only control has an `aria-label`, focus-visible rings are present throughout.

---

## Phase 5 — Comparison to authoritative Forge Today

Authoritative Forge Today (unchanged, still the source of truth): `apps/web/app/(app)/today/_components/{action-queue,admin-links,quick-actions,snapshot-grid,today-header,today-schedule}.tsx`, `apps/web/app/(app)/today/_lib/view-model.ts`, `packages/db/queries/today-actions.ts`, plus UX-A's shared shell (`app-desktop-nav`, `app-shell`, `status-pill`, `page-header`, `empty-state`, `error-state`).

| Base44 component | Forge target | Disposition | Adaptation required | Dependency impact | Test impact |
|---|---|---|---|---|---|
| `TodayDashboard.tsx` | `today/page.tsx` composition | **Merge** | Strip its own nav rendering; delegate to Forge's `app-shell`; bind to real `TodayViewModel` prop shape | None (layout only) | Update `today-redesign-bot` snapshot/structure assertions if DOM structure changes |
| `TodayHeader.tsx` | `_components/today-header.tsx` | **Replace visual treatment, reuse structure** | Rebind org-switcher `<select>` to the real `OrgSwitcher`/`switchActiveOrgAction`; rebind sign-out to `signOutAction`; rebind staff menu to real capability-derived staff identity | None | `multi-org-switching-bot`, sign-out E2E paths must re-pass unchanged |
| `MobileStaffSheet.tsx` | new (Forge currently inlines this into `today-header.tsx`) | **Adopt as a new, separate component** | Add `"use client"`; wire same real callbacks as `TodayHeader` | None | Add focus/escape-key coverage to existing keyboard-focus E2E |
| `DesktopNavigation.tsx` | UX-A's `app-desktop-nav` | **Reject — do not replace shared shell nav** | N/A — Forge's persistent nav is already shared across every authenticated route (Customers/Properties/Requests/Estimates/Quotes/Jobs/Invoices/Catalog/Team), a scope well beyond Today. Per Kevin's explicit instruction, do not swap it out just because Base44 generated a Today-scoped alternative. If its **visual treatment** (near-black nav shell, burnt-orange active state) is wanted, that's a theming change to the existing `app-desktop-nav`, not a component replacement. | Theming only, see Phase 6 | None if theming-only |
| `MobileNavigation.tsx` | UX-A's mobile bottom nav | **Reject — do not port; theming-only if anything** | Same reasoning as above, compounded by the hardcoded nav-item-list defect (Phase 4) — Forge's real mobile nav already reflects the correct, capability-aware destination set. | Theming only | None if theming-only |
| `AttentionSection.tsx` | `_components/action-queue.tsx` | **Replace visual treatment** | Rebind to real `TodayActionItem` union (`pricing_review_requested`/`create_quote`/`send_quote`), not the Base44 `AttentionItem` shape; preserve `onOpenAction` semantics exactly | None | `today-action-queue-bot` (7 tests) must re-pass; extend `today-redesign-bot` for the new visual states |
| `WorkSection.tsx` | `_components/today-schedule.tsx` | **Replace visual treatment** | Rebind to real `ScheduleEntry[]` (`job`/`site_visit` kind, `formatScheduledTime` output) instead of Base44's `ScheduledWorkItem` shape | None | Re-verify the phone-overflow fix (390×844) still holds with the new layout — this was a real, previously-fixed bug (`forge-v1.1-today-redesign.md`) |
| `OperationalSnapshot.tsx` | `_components/snapshot-grid.tsx` | **Replace visual treatment** | Rebind to real `SnapshotItem[]` (exactly 3 items: New requests / Today's work / Invoices needing action) — grid already flexes correctly for that count | None | Re-verify the "no `$` ever appears" assertion from the original E2E suite still holds |
| `QuickActions.tsx` | `_components/quick-actions.tsx` | **Replace visual treatment** | Rebind to real `QuickActionItem[]`, already capability-filtered by Forge before this component ever sees it | None | Capability-filtered quick-action E2E cases must re-pass unchanged |
| `BrowseLinks.tsx` | `_components/admin-links.tsx` | **Reject** | Do not reintroduce — conflicts with Kevin's already-made decision to remove the duplicate browse grid in favor of the single conditional "Website content" admin link. If Kevin wants to revisit that decision, it's a separate product call, not something this integration should silently reverse. | N/A | N/A |
| `StatusBadge.tsx` | Shared `StatusPill` (UX-A) | **Merge — adopt new visual treatment into the existing shared primitive** | `StatusPill` is used across more than just Today; adopting Base44's icon+color treatment there (rather than as a Today-local component) keeps one shared primitive instead of forking a second status-badge implementation. Needs a mapping from Forge's existing status vocabulary to Base44's `TodayStatus` union — not a 1:1 match today. | Touches every current `StatusPill` consumer, not just Today — treat as a separate, reviewed shared-component change, not an implicit side effect of the Today PR | Any existing `StatusPill`-dependent test must be re-run, not just Today's |
| `ThemeControl.tsx` | new (Forge has no existing control) | **Adopt as new, pending Phase 6's product decision** | Depends entirely on whether Kevin wants to introduce a real Forge-wide appearance setting this cycle (see Phase 6) — do not add in isolation just for Today | Potentially app-shell-wide if adopted | New E2E: light/dark/system switching |
| `useForgeAppearance.ts` | none exists in Forge today | **Reject as-is; replace with Forge's own single mechanism if/when Kevin approves adding appearance support** | See Phase 6 — this is a real open product question, not a mechanical port | App-shell-wide if adopted | New E2E if adopted |
| `TodayState.tsx` | `EmptyState`/`ErrorState`/loading pattern (UX-A) | **Merge — adapt visual treatment into existing shared primitives** | Same reasoning as `StatusBadge` — avoid forking a second loading/error primitive | Touches shared primitives, review separately from Today-only changes | Existing `EmptyState`/`ErrorState` consumers must re-pass |
| `ForgeMark.tsx` | none exists as a discrete component today (brand references are inline/CSS) | **Adopt as new** | Trivial; wire to `packages/shared/brand.ts`'s `PRODUCT_NAME` | None | None |
| `forge-today.css` tokens | none exists as a discrete token file today (Tailwind config + ad hoc classes) | **Merge selectively — see Phase 6** | Requires a genuine design-system decision (Phase 6), not a blind copy | Tailwind config change | Visual-regression risk across every themed surface, not just Today |

**Reused unchanged, confirmed untouched by any of this**: Forge's authentication, active-org resolution, capability system, `TodayViewModel`'s real Layer 1/2 computation (`packages/db/queries/today-actions.ts`, `apps/web/app/(app)/today/_lib/view-model.ts`), every route destination, and the entire Today E2E suite's assertions about *behavior* (as opposed to visual treatment).

---

## Phase 6 — Theme integration plan

**Exact semantic tokens** (from `forge-today.css`, light + `.forge-dark` variants): surfaces (`background`, `foreground`, `card`, `card-foreground`, `muted`, `muted-foreground`, `border`, `input`), brand (`primary`/`primary-foreground` — burnt copper/rust, `secondary`, `accent`), semantic (`destructive`, `warning`, `success`, `ring`), a distinct **navigation-shell** sub-palette (`nav-background`, `nav-foreground`, `nav-active`, `nav-active-foreground`, `nav-border` — near-black), and eight paired status-surface tokens (`st-{urgent,warning,scheduled,progress,waiting,success,error,neutral}-{bg,fg}`) designed so status is never conveyed by color alone.

**Contrast risk**: not independently re-measured this session (no browser/contrast-checker tool run against the actual rendered output) — should be spot-checked with a real contrast tool during implementation, particularly the `forge-st-*` pairs at their darker/lighter extremes, before treating any token as final.

**Token overlap with Forge's current design system**: **none by name** — Forge's `tailwind.config.js` currently has `darkMode: ['class']` enabled but, confirmed by direct inspection, **no ThemeProvider, no `next-themes` usage, and no actual light/dark/system UI control exists anywhere in the app today** (`apps/web/app/layout.tsx` only sets a static `themeColor` metadata value). This means:

- There is currently **no existing Forge appearance-persistence system for `useForgeAppearance.ts` to conflict with** — the file isn't duplicating a first system, there simply isn't one yet.
- This is a genuine, open **product decision for Kevin**, not something this audit or a future integration PR should decide unilaterally: does Forge V1.1 want to introduce a real light/dark/system toggle at all this cycle, or is Base44's `forge-today.css` + burnt-orange palette meant to define Forge's **one and only** visual identity (i.e., replace the current default look outright, no toggle)?
- **Recommendation, not a decision**: introduce the burnt-orange/near-black palette as Forge's new default design-token values (merged into the existing Tailwind config's CSS-variable source, replacing whatever ad hoc values are there today), and treat "does light/dark/system switching ship in V1.1" as a separate, explicitly-scoped follow-up — not bundled silently into the Today visual port. This avoids inventing a second persistence system (`useForgeAppearance.ts` gets discarded either way) while not blocking the higher-priority visual redesign on an unrelated feature decision.
- **CSS variables can be merged safely** — `forge-today.css`'s custom properties are additive (new `--forge-*` names) and don't collide with anything Forge currently defines; a straightforward literal merge into the existing global stylesheet/Tailwind CSS-variable layer is viable once Kevin confirms the token *values* (the actual colors) are approved, not just the mechanism.
- **Tailwind config changes required**: yes, if Forge's `bg-forge-*`/`text-forge-*` utility-class approach is adopted as-is; alternatively, the token values could be mapped onto Forge's existing Tailwind theme extension (`colors: { primary: ..., ... }`) instead of parallel `forge-` prefixed classes, which would be less invasive to existing markup outside Today. This choice should be made deliberately during implementation, not assumed here.
- **Shared `StatusPill` should adopt the new visual treatment** — recommended in Phase 5's mapping table, since forking a second status-badge component would create exactly the kind of duplicate-status-rule risk the screening checklist exists to catch.
- **Navigation theme belongs in the shell, not in Today** — `DesktopNavigation.tsx`/`MobileNavigation.tsx`'s near-black/burnt-orange visual treatment is a shell-wide styling concern (UX-A's `app-desktop-nav`/mobile nav), not something Today should own or duplicate a second implementation of.

**Do not add a second appearance-persistence system** — confirmed as an explicit constraint, and directly actionable: `useForgeAppearance.ts` is discarded regardless of Kevin's eventual decision on whether Forge gets an appearance toggle at all; if one is added, it belongs to the app shell (a single hook/provider consumed everywhere), never route-local to Today.

---

## Phase 7 — Today integration plan (proposed, not implemented)

**Branch**: `feature/forge-v1.1-today-base44-visual-integration`

**Preserves unconditionally**: Layer 1 (`packages/db/queries/today-actions.ts`, unchanged), Layer 2 (`apps/web/app/(app)/today/_lib/view-model.ts`, unchanged), authentication, active-org resolution, capabilities, route destinations, all existing callback/action wiring, and the full existing Today E2E behavioral assertions.

**Proposed files to change** (Layer 3 only, plus the two shared-primitive extensions called out below):

- `apps/web/app/(app)/today/_components/today-header.tsx` — adopt `TodayHeader.tsx`'s visual structure, rebind to real org-switcher/sign-out/staff-identity props; add a new `mobile-staff-sheet.tsx` sibling component adapted from `MobileStaffSheet.tsx`.
- `apps/web/app/(app)/today/_components/action-queue.tsx` — adopt `AttentionSection.tsx`'s visual treatment, rebind to the real `TodayActionItem` union.
- `apps/web/app/(app)/today/_components/today-schedule.tsx` — adopt `WorkSection.tsx`'s visual treatment, rebind to the real `ScheduleEntry[]`.
- `apps/web/app/(app)/today/_components/snapshot-grid.tsx` — adopt `OperationalSnapshot.tsx`'s visual treatment, rebind to the real `SnapshotItem[]`.
- `apps/web/app/(app)/today/_components/quick-actions.tsx` — adopt `QuickActions.tsx`'s visual treatment, rebind to the real `QuickActionItem[]`.
- `apps/web/app/(app)/today/page.tsx` — adopt `TodayDashboard.tsx`'s composition/layout shell, without its own nav rendering (delegates to the existing `app-shell`).
- New: `apps/web/app/(app)/today/_components/today-mark.tsx` (adapted from `ForgeMark.tsx`), wired to `packages/shared/brand.ts`.
- Shared-primitive extensions (reviewed and scoped separately from the Today-only diff, since they touch more than one route): `apps/web/components/ui/status-pill.tsx` (adopt `StatusBadge.tsx`'s icon+color treatment), `apps/web/components/ui/{empty-state,error-state,loading-skeleton}.tsx` (adopt `TodayState.tsx`'s visual treatment).
- New global stylesheet/Tailwind token source update carrying the approved `forge-today.css` token values, scoped per Kevin's Phase 6 decision on mechanism (parallel `forge-` utility classes vs. Tailwind theme-extension mapping).
- **Explicitly excluded from this branch**: `DesktopNavigation.tsx`, `MobileNavigation.tsx` component code (theming-only follow-up to the existing shared nav, not a replacement — see Phase 5), `BrowseLinks.tsx` (rejected outright), `ThemeControl.tsx`/`useForgeAppearance.ts` (pending Kevin's separate appearance-toggle decision), and everything under Kevin's original exclusion list (`TodayRoute.tsx`, `todayScenarios.ts`, `forgeToday.ts`).

**Mechanical removals during port** (per the task's explicit requirements): fictional fixtures never copied in; mock callbacks replaced with real Forge callbacks at every binding point; the Base44 preview/scenario harness never ported; `localStorage` theme persistence removed (`useForgeAppearance.ts` discarded); `@/*` path aliases replaced with Forge's actual import paths; zero `@base44/sdk` or other Base44-workspace dependency added to `package.json`; zero backend/Supabase change of any kind.

---

## Phase 8 — Test plan

Required before any merge of the eventual integration branch:

- `pnpm test` (full suite, expect the current 205+/205+ baseline plus any new unit tests for adapted components).
- `pnpm typecheck` — clean across all packages.
- `pnpm --filter web build` — clean.
- `tests/e2e/today-redesign-bot.spec.ts` — full re-run; expect visual-structure assertions to need updates for the new markup, but all *behavioral* assertions (role visibility, cross-org isolation, navigation, task disappearance + empty state, org switching, sign-out, capability-filtered quick actions, operational-count accuracy) must continue to pass unchanged.
- `tests/e2e/today-action-queue-bot.spec.ts` — full re-run, 7/7, unchanged (this suite is the authoritative coverage for `getTodayActionItems()`'s role/capability filtering and must not need to change just because the visual layer changed).
- Organization switching, sign-out, role visibility, task disappearance — all already covered by the two suites above; explicitly re-verify none regress.
- Phone (390×844) / tablet portrait (768×1024) / tablet landscape (1024×768) / desktop (1440×900) — re-run the existing viewport-overflow assertions; the WorkSection→`today-schedule.tsx` change is the highest-risk file for reintroducing the previously-fixed phone-overflow bug.
- Light/dark/system — **only if Kevin approves adding an appearance toggle in Phase 6**; otherwise not applicable this cycle.
- Keyboard focus — re-run the existing `.focus()`/`toBeFocused()` assertion on the action-queue's primary action; extend to the new `MobileStaffSheet`-derived component's focus-trap/escape-key behavior.
- No overflow, accessible names, no raw errors — covered by the existing suites; the accessibility bar established in `forge-v1.1-today-redesign.md` (native semantic elements, `StatusPill` never color-only, accessible `EmptyState` text) must hold for every adapted component.
- **No new screenshot/visual-regression framework** — the existing Playwright E2E setup doesn't currently include pixel-diffing, and none should be introduced solely for this integration, per the explicit instruction; manual before/after screenshots (already captured as part of Base44's `today-visual-reference.md`) are sufficient for this cycle's visual review.

---

## Rollback plan

Identical in shape to the original Today redesign's rollback plan (`forge-v1.1-today-redesign.md`): this integration touches only presentation-layer files (Layer 3 components, plus the two shared-primitive files if that scope is included) — `git revert` the merge commit; zero Supabase schema/RLS/RPC/migration changes exist in this branch to unwind; Layer 1/2 remain completely untouched, so reverting the visual layer carries zero data-layer risk.

---

## Risk assessment

- **Low risk**: the majority of components (`AttentionSection`, `WorkSection`, `OperationalSnapshot`, `QuickActions`, `StatusBadge`, `TodayState`, `ForgeMark`) are clean, fully props-driven, and require only prop-shape rebinding — a mechanical, low-risk port.
- **Medium risk**: `TodayHeader`/`MobileStaffSheet` (new interactive dropdown, needs careful focus/escape/keyboard-accessibility re-verification), the CSS token merge (Phase 6 mechanism choice affects every themed surface, not just Today), and the shared-primitive changes to `StatusPill`/`EmptyState`/`ErrorState` (touch more than Today, need their own regression pass).
- **Higher risk, explicitly deferred/rejected in this plan**: `DesktopNavigation`/`MobileNavigation` (would duplicate/fork Forge's real shared shell nav if ported wholesale — rejected), `BrowseLinks` (would silently reverse a prior product decision — rejected), `ThemeControl`/`useForgeAppearance` (depends on an unmade product decision about whether Forge gets an appearance toggle at all — deferred, not decided here).
- **Unresolved account-level item**: this session's GitHub credentials could not directly enumerate the Base44 GitHub App's installation-scope screen (`user/installations` returned 403); repo-level evidence (no webhook, no bot collaborator on `Premier-CRM`/`premier-property-maintenance`) is strong but indirect. Kevin should do the one-time visual confirmation described in Phase 2.

---

## Recommendation

Proceed to integration **only after** Kevin makes the one open product decision this audit surfaced (Phase 6: does Forge V1.1 introduce a real appearance toggle this cycle, or does the burnt-orange palette simply become the new fixed default look) and confirms the GitHub App installation-scope screen in Phase 2. Everything else needed to begin implementation — file classification, component mapping, theme mechanism options, integration branch/scope, and test plan — is fully defined above.

---

## Final verdict

# READY AFTER LISTED FIXES

Complete Base44 output exists in GitHub and was cloned locally with zero drift (Phase 1) — satisfied. Sync state is understood, and Base44's own claim was independently verified against real repository evidence rather than trusted at face value — satisfied. Repository permissions show no violation at the repo-evidence level; one manual confirmation step remains for Kevin (Phase 2) — **listed fix**. No secrets/backend contamination found in the portable Today file set (Phase 4) — satisfied. Portable files are identified, and Base44-specific files are correctly excluded (Phase 4) — satisfied. A theme-integration path is defined, but it depends on one explicit product decision from Kevin before implementation can start cleanly (Phase 6) — **listed fix**. Forge component mapping is fully defined (Phase 5) — satisfied. An exact integration branch/scope is proposed, deliberately excluding the shared-nav and appearance-toggle items pending Kevin's decisions (Phase 7) — satisfied as a plan, not yet authorized to implement. Tests are fully defined (Phase 8) — satisfied.

**Listed fixes required before implementation begins**: (1) Kevin's Phase 6 decision on whether Forge V1.1 introduces a real light/dark/system appearance toggle this cycle, or whether the burnt-orange palette simply replaces the current default look with no toggle; (2) Kevin's one-time visual confirmation of the Base44 GitHub App's installation-repository-access screen (Phase 2).

Both listed fixes resolved by Kevin (see §13) — integration implemented on `feature/forge-v1.1-today-base44-visual-integration`, PR opened, **not merged**.

---

## 13. Integration record (post-audit, this session)

### Kevin's decisions

1. **Appearance**: Forge V1.1 introduces a real, Forge-owned Light/Dark/System setting, defaulting to System, persisted client-side only (no database/backend). Base44's `useForgeAppearance.ts` was **not** ported.
2. **GitHub App scope**: manually confirmed by Kevin — `Forge-Base44-UX` only; `Premier-CRM` and `premier-property-maintenance` confirmed to have no access. No further confirmation requested during implementation, per Kevin's explicit instruction.
3. **Navigation**: Base44's `DesktopNavigation.tsx`/`MobileNavigation.tsx` were **not** ported as components (would fork/duplicate Forge's existing shared UX-A nav, and `MobileNavigation.tsx` hardcoded its own item list — see §4). Instead, Forge's existing, already-shared `AppDesktopNav`/`AppBottomNav` components were re-themed to match Base44's visual treatment, with their pre-existing, unchanged route list/active-state/badge logic serving as the "Forge-supplied navigation items" Base44's presentation now renders.

### Integration branch

`feature/forge-v1.1-today-base44-visual-integration`, created from `main` @ `cc795b5` (PR #109's merge commit).

### Base44 source commit

`Bozo012/Forge-Base44-UX` @ `adee72ef881be3023ef78332c28540b2326b3a89` — unchanged from the audit; verified via `gh api repos/Bozo012/Forge-Base44-UX/commits/main` immediately before implementation began (Phase 0 checkpoint), no new commits appeared.

### Files ported / adapted / rejected

| Base44 source | Disposition | Forge file |
|---|---|---|
| `src/styles/forge-today.css` | **Adapted** — token values merged into Forge's existing shadcn CSS-variable convention (not a parallel stylesheet) | `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` |
| `ThemeControl.tsx` | **Adapted** — same interaction pattern, bound to Forge's own `useTheme()` | `apps/web/components/theme/theme-control.tsx` |
| `useForgeAppearance.ts` | **Rejected** — replaced by a Forge-owned, app-wide mechanism (see below) | `apps/web/components/theme/theme-provider.tsx` |
| `StatusBadge.tsx` | **Merged into existing shared primitive** — token mapping only, tone API unchanged | `apps/web/components/ui/status-pill.tsx` |
| `TodayHeader.tsx` | **Adapted (partial)** — `ThemeControl` mounted; org-switcher/sign-out kept as already-real Forge bindings, not re-implemented | `apps/web/app/(app)/today/_components/today-header.tsx` |
| `AttentionSection.tsx` | **Adapted (visual only)** — eyebrow label, item count, primary-color accent border, icon-bearing buttons; row-based responsive structure (with its previously-fixed phone-overflow behavior) deliberately kept instead of switching to Base44's 2-column card grid | `apps/web/app/(app)/today/_components/action-queue.tsx` |
| `WorkSection.tsx` | **Adapted (visual only)** — eyebrow label, time-first row layout | `apps/web/app/(app)/today/_components/today-schedule.tsx` |
| `OperationalSnapshot.tsx` | **Adapted (visual only)** — eyebrow label, rounded-2xl cards, icon | `apps/web/app/(app)/today/_components/snapshot-grid.tsx` |
| `QuickActions.tsx` | **Adapted (visual only)** — icon-badge row treatment | `apps/web/app/(app)/today/_components/quick-actions.tsx` |
| `DesktopNavigation.tsx` | **Rejected as a component** — theming-only, applied to the existing shared nav instead | `apps/web/components/navigation/app-desktop-nav.tsx` |
| `MobileNavigation.tsx` | **Rejected as a component** (hardcoded item list) — theming-only, applied to the existing shared nav instead | `apps/web/components/navigation/app-bottom-nav.tsx` |
| `ForgeMark.tsx` | **Not ported this pass** — `AppDesktopNav`'s existing inline brand mark was re-themed instead (flame icon + "Forge" wordmark) rather than extracting a new shared component; can be factored out later if reused elsewhere | — |
| `BrowseLinks.tsx` | **Rejected** — would reintroduce the browse-grid duplication Kevin already removed from Today | — |
| `MobileStaffSheet.tsx` | **Not ported this pass** — kept the diff focused; Forge's header already fits `ThemeControl` inline at every breakpoint without needing a dropdown-sheet indirection. Can be revisited if header crowding becomes a real problem on narrow phones. | — |
| `TodayDashboard.tsx`, `contracts/today.ts` | **Reference only** — Forge's own `page.tsx` composition and real `TodayViewModel`/Layer 1/2 types remain authoritative; not imported | — |
| `TodayState.tsx` | **Not touched this pass** — Forge's existing `EmptyState`/`ErrorState` already picked up the new token palette automatically via the shared CSS-variable change; no separate port needed | — |
| `TodayRoute.tsx`, `todayScenarios.ts`, `forgeToday.ts` | **Excluded**, per Kevin's original instruction — not read into any Forge file | — |

### Appearance-setting implementation

- **Mechanism**: `apps/web/components/theme/theme-provider.tsx` — a single React context (`ThemeProvider`/`useTheme`), mounted once in `app/layout.tsx`, wrapping the entire app (not Today-local).
- **Persistence**: `window.localStorage`, key `forge-appearance` — client-side only, no database/backend/Supabase involvement, one single key app-wide (replaces, not duplicates, Base44's Today-local `forge-presentation-appearance` key, which is not ported).
- **Default**: `system`.
- **Anti-flash**: a small inline script (`THEME_ANTI_FLASH_SCRIPT`, exported from `theme-provider.tsx` and inlined into `app/layout.tsx`'s `<head>`) reads the same storage key and applies the `dark` class to `<html>` before first paint — `<html suppressHydrationWarning>` avoids a false-positive hydration warning for the one attribute the script may set ahead of React.
- **System-preference tracking**: `window.matchMedia('(prefers-color-scheme: dark)')` with a `change` listener — updates live without a reload when `appearance === 'system'`.
- **Control**: `apps/web/components/theme/theme-control.tsx`, mounted in `today-header.tsx`'s `PageHeader` actions slot. Three-way toggle, `aria-pressed` per option, `aria-label="{Light|Dark|System} appearance"`, focus-visible ring, label text hidden below `sm` (icon-only on phones, matching Base44's reference).
- **Cascading effect**: because Forge's shared token source (`globals.css`) was updated rather than forked, the appearance setting affects every route that already used `bg-background`/`text-foreground`/etc. (i.e., the whole app), not just Today — expected and intended per Kevin's Phase 6 instruction to extend shared tokens rather than fork a second namespace.

### Navigation adaptation

No hardcoded route list was ported from Base44. `AppDesktopNav`/`AppBottomNav` keep their pre-existing, Forge-owned `href`/`label`/`isActive` data (unchanged) and gained an `Icon` field (Forge's own choice, `lucide-react`, already a project dependency) plus the new `nav-*` token-based visual treatment (near-black shell, burnt-orange active state, active state indicated by both a left accent bar and bold text — not color alone). Role/capability filtering, organization context, and route authorization were not touched. Desktop and mobile navs remain mutually exclusive by breakpoint (`hidden md:flex` / `md:hidden`, unchanged). Mobile safe-area padding preserved (`env(safe-area-inset-bottom)`).

### Theme-token integration

Base44's `forge-today.css` custom properties were merged directly into `apps/web/app/globals.css`'s existing `:root`/`.dark` blocks (same variable-naming convention Forge already used — `--background`, `--foreground`, `--card`, `--primary`, etc.) rather than introduced as a parallel stylesheet or a second Tailwind namespace. New tokens added: `--warning`/`--warning-foreground`, `--success`/`--success-foreground`, `--nav-*` (5 tokens), and 8 status-surface pairs (`--st-*-bg`/`--st-*-fg`). `tailwind.config.ts` extended with `warning`, `success`, and `nav` color families mapping to the new variables. `StatusPill`'s tone→class mapping was updated to reference the new status-surface tokens instead of literal Tailwind colors (`amber-50` etc.) — this makes every existing `StatusPill` consumer dark-mode-correct automatically, without a per-tone rewrite; tone names (`amber`/`emerald`/`blue`/`red`/`neutral`) are unchanged so no call site elsewhere in the app needed to change.

### Tests

**Unit**: `pnpm test` — 205/205 (pre-existing suite, none of it exercises Layer 3 markup, so unaffected by this visual-only change).

**Typecheck / build**: `pnpm --filter web typecheck` clean; `pnpm --filter web build` clean (dev server stopped first, per instruction) — all 35 routes generate successfully including `/today`.

**E2E** (against `premier-crm-e2e`, dev server started with explicit env vars exported from `.env.test`, not `apps/web/.env.local` — which was found, and left untouched, still pointing at `premier-crm-prod`'s project ref; verified via `/api/e2e-health` that the running server was actually on `premier-crm-e2e` before running anything):

- `today-redesign-bot.spec.ts` — 20/20 (one selector fixed: `snapshot-grid.tsx`'s value element changed from `<p class="text-4xl">` to `<span class="text-3xl">` as part of the visual adaptation; the test's structural CSS-class selector was replaced with a scoped text-content assertion, per the explicit instruction to update selectors, not weaken assertions, when presentation markup changes).
- `today-action-queue-bot.spec.ts` — 7/7, unmodified, unaffected.
- `multi-org-switching-bot.spec.ts` — 7/7, unaffected.
- `operator-workflow-bot.spec.ts` — 1/1, unaffected.
- **New**: `today-appearance-bot.spec.ts` — 6/6, purpose-built for this integration: defaults to System; Light/Dark force regardless of OS preference; System responds live to an OS-preference change (`page.emulateMedia`); preference survives a reload; keyboard focus + accessible names on the appearance control.
- Component-level (jsdom/testing-library) unit tests were **not** added for `ThemeProvider`/`ThemeControl` — this repo has no existing React-component-testing infrastructure (`packages/*`/`apps/web` unit tests are all pure-logic `.test.ts`, no `@testing-library/react` dependency), and introducing one solely for this would be a disproportionate new pattern for one component, plus a new dependency not strictly required (Phase 10 constraint). The 6 new E2E tests exercise the real DOM/class-toggling behavior directly, which is arguably the more meaningful check for this specific mechanism.

**Responsive** (via `today-redesign-bot.spec.ts`'s existing viewport suite, all passing post-integration): phone (390×844), tablet portrait (768×1024), tablet landscape (1024×768) — no horizontal overflow. Desktop (1440×900) nav render/navigation — passing.

**Accessibility**: action-queue keyboard-focus test passing; appearance control keyboard/`aria-pressed`/`aria-label` coverage new this pass; `StatusPill` continues to pair every status with a text label, never color alone (unchanged); every interactive element remains a native `<button>`/`<a>`/`<select>`.

### Remaining risks / follow-ups (not blocking this PR)

- `ForgeMark.tsx` and `MobileStaffSheet.tsx` were not extracted as standalone components this pass (see table above) — low risk, purely a scope decision to keep the diff focused; can be revisited.
- The new `warning`/`success`/`nav` Tailwind color families and status-surface tokens are currently only consumed by Today/shared-nav/`StatusPill` — safe to leave unused elsewhere, but worth keeping in mind during the Estimates/Site Inspection passes so the same tokens get reused rather than a third parallel system invented.
- No pixel-level visual-regression tooling exists in this repo (per the original instruction, none was added) — the visual comparison against Base44's approved reference was manual (screenshots + `today-visual-reference.md`), not automated.
- `apps/web/.env.local` still points at `premier-crm-prod`'s project ref — this predates this session and was not touched, but is a standing hazard for anyone running `pnpm dev` without following the explicit-env-var pattern documented in `tests/e2e/README.md` and used throughout this integration; worth a dedicated fix outside this PR's scope.

### Rollback procedure

Identical in shape to the original Today redesign's rollback plan: `git revert` the integration PR's merge commit once merged — this branch touches only presentation-layer files (`app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, the new `components/theme/` files, `components/ui/status-pill.tsx`, `components/navigation/*`, Today's `_components/*.tsx`, and one E2E selector fix) plus one new E2E spec file. Zero Supabase schema/RLS/RPC/migration changes exist anywhere in this branch. Layer 1 (`packages/db/queries/today-actions.ts`) and Layer 2 (`apps/web/app/(app)/today/_lib/view-model.ts`) are completely untouched.
