# Forge/Base44 UX Integration Batch 1

## Source Reference

- Base44 repository: `Bozo012/Forge-Base44-UX`
- Base44 `main` commit used as visual reference: `497d0693cccafd89315ec17c3be9885cfaae5c84`
- Premier repository base commit: `6ab3d5dc77368e03164312e81935a56c3b869f65`

## Scope Implemented

- Kept Premier-CRM backend, Supabase schema/RLS, auth, permissions, queries, server actions, and test framework authoritative.
- Reused the existing Forge shell/theme tokens already present in Premier and added shared presentation primitives in `apps/web/components/forge/presentation.tsx`.
- Added URL-backed Forge-styled Requests list/detail surfaces mapped from real `service_requests` reads and existing request actions.
- Preserved existing request triage server actions and handoffs to estimates, site visits, and direct work orders.
- Added an org-scoped `listSiteVisits` query and a real `/site-visits` list route.
- Converted `/site-visits/:siteVisitId` into a summary/handoff page.
- Added `/site-visits/:siteVisitId/inspection` as the dedicated inspection route, backed by existing trusted inspection save/complete actions.

## Portable Component Mapping

| Base44 visual reference | Premier integration |
| --- | --- |
| Forge shell/navigation/theme | Existing `AppShell`, `AppDesktopNav`, `AppBottomNav`, and CSS tokens remain authoritative; this batch adds only shared presentation primitives. |
| `RequestsList` / `RequestDetail` | Recreated as server-rendered Next.js routes using `listRequests`, `getRequestById`, and pure view-model adapters. |
| Request triage controls | Existing server actions/RPC wrappers remain; the UI keeps real handoff links and redirects. |
| `SiteVisitList` / `SiteVisitDetail` | Recreated as server-rendered routes using new `listSiteVisits` and existing `getSiteVisitById`. |
| `InspectionWorkflow` | Integrated as a real dedicated route using Premier's template-driven inspection fields and trusted save/complete server actions rather than Base44 fixtures. |

## Explicitly Not Ported

- Base44 auth/platform infrastructure.
- Base44 fixture stores, mocked persistence, scenario harnesses, or route harness callbacks.
- Unrelated Base44 routes outside Requests and Site Visits.
- Any Supabase schema, RLS, RPC, auth, permission, or financial authority changes.

## Validation Notes

- Added unit coverage for request and site-visit view-model adapters.
- Full E2E coverage should run against a non-production Supabase test environment because these flows create and mutate real lifecycle records.

## Blocked / Deferred

- Visual parity is intentionally limited to the first integration batch. Estimates, invoices, jobs, services, customer portal, and other Base44 detail routes remain out of scope.
- The inspection route uses Premier's existing dynamic template form rather than Base44's fixture-specific five-step harness, because Premier's template schema and server validation are authoritative.
