# Forge Base44 UX Integration — Batch 4 Shell, Today, and Lower Sidebar Pages

## Source References

- Premier-CRM base commit: `3ceb1590a784b698abd919cab79367699bb3d9e1`
- Forge-Base44-UX visual reference commit: `497d0693cccafd89315ec17c3be9885cfaae5c84`
- Branch: `agent/forge-ux-batch-4-shell-nav-pages`

## Implemented

- Expanded the desktop Forge sidebar to match the Base44 order through Settings:
  Today, Requests, Customers, Properties, Site Visits, Estimates, Service Catalog, Quotes, Jobs, Invoices, Calendar, Activity Logs, Site Photos, Expenses, Team, Settings.
- Added a shared desktop top bar with active organization, real org switching, real sign out, existing Premier theme control, and real route shortcuts.
- Reworked Today toward the Base44 layout:
  quick actions across the top, Today/Board toggle visual, Priority Queue cards, Today's Work rows, and Browse Forge side card.
- Added real routed lower-sidebar pages:
  `/calendar`, `/activity-logs`, `/site-photos`, `/expenses`, and `/settings`.
- Reused Premier's backend, auth, org context, RLS-scoped Supabase reads, server actions, and existing presentation primitives.

## Backend Mapping

- Calendar uses existing `jobs.scheduled_start` and `site_visit_appointments` via `getTodaySiteVisits()`.
- Activity Logs uses existing `activity_log` rows under org RLS.
- Site Photos uses existing `vault_items` plus signed private Storage read URLs.
- Settings maps to the existing website settings and team access flows.

## Explicit Backend Gaps

- Expenses cannot be made real yet without a Premier expense model. Needed:
  org-scoped expenses table, receipt/vault link, billable flag, approval/reimbursement status, invoice eligibility, RLS, and server actions.
- Calendar is currently a 30-day agenda, not the full Base44 month/week/board calendar. A full match needs an authoritative cross-record scheduling view or query helper.
- Site Photos can list and preview private vault photos, but Base44's richer gallery filters/detail route need approved metadata fields and a photo detail route.
- Today's Board tab is visual-only and disabled. A real board needs a Premier-owned workflow stage model/actions; Base44 drag/drop behavior was not ported.

## Guardrails Preserved

- No Base44 auth/platform infrastructure was ported.
- No fixture harnesses or mocked persistence were added.
- No Supabase schema, RLS, RPC, or permission changes were made in this batch.
- No backend workflow authority moved into presentation components.

## Validation

- `pnpm vitest run apps/web/components/navigation/navigation-links.test.ts` passed.
- `pnpm --filter @premier/web typecheck` passed.
- `pnpm test` passed: 30 files, 226 tests.
- `pnpm --filter @premier/web build` passed.
- Changed-file ESLint passed for the Batch 4 files.
- Repo-wide `pnpm lint` remains blocked by pre-existing generated/script lint errors in `apps/web/public/sw.js`, `apps/web/public/workbox-5194662c.js`, existing scripts, and existing type-import lint findings outside this batch.
