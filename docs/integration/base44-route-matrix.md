# Base44 → Forge Route Matrix

Statuses: **integrated** (Forge has a mature real implementation, Base44 used only for visual refinement) · **partial** (real route exists, visual/UX gap remains) · **missing** (no real Forge route yet) · **excluded** (intentionally out of scope for this program) · **manager-owned** (shared/global, not a single worker's scope).

Verified against Forge `origin/main@76bbad7c` route tree (`apps/web/app/(app)/**`, `apps/web/app/portal/**`) and Base44 reference `497d0693` (`Forge-Base44-UX/src/routes/**`) on 2026-08-05.

| Route / workflow | Base44 ref | Forge state | Status | Backend contract | Permissions/RLS | Assigned | Branch | Notes |
|---|---|---|---|---|---|---|---|---|
| `/` (today) | `TodayRoute.tsx` | `today/page.tsx` + view-model | integrated | today view-model queries | role-scoped | — | main (done, Batch 6/7) | Batch 7 merged; uses `components/ui/*`, the one outlier presentation system (see decision log) |
| `/requests` | `RequestsRoute.tsx` | `requests/page.tsx` | integrated, refinement pending | `packages/db/queries/requests.ts` | `canTriageRequests` etc. | manager (Batch 8) | `agent/forge-ux-batch-8-*` | |
| `/requests/:requestId` | `RequestDetailRoute.tsx` | `requests/[taskId]/page.tsx` (param named `taskId`, not renamed) | integrated, refinement pending | `getRequestById` | triage/direct-work-order gates | manager (Batch 8) | `agent/forge-ux-batch-8-*` | two competing triage UIs to consolidate — see decision log |
| `/customers` | (Base44 directory pattern) | `customers/page.tsx` | integrated | customers queries | org-scoped | agent/base44-customer-directory | worker | |
| `/customers/:customerId` | — | `customers/[customerId]/page.tsx` | integrated | — | — | agent/base44-customer-directory | worker | |
| `/properties` | `PropertiesRoute.tsx` | `properties/page.tsx` | integrated | — | — | agent/base44-customer-directory | worker | |
| `/properties/:propertyId` | `PropertyDetailRoute.tsx` | `properties/[propertyId]/page.tsx` | integrated | — | — | agent/base44-customer-directory | worker | |
| `/site-visits` | `SiteVisitsRoute.tsx` | `site-visits/page.tsx` | integrated, refinement pending | `packages/db/queries/site-visits.ts` | — | manager (Batch 8) | `agent/forge-ux-batch-8-*` | |
| `/site-visits/:siteVisitId` | `SiteVisitDetailRoute.tsx` | `site-visits/[siteVisitId]/page.tsx` | integrated, refinement pending | `SiteVisitDetail` | — | manager (Batch 8) | `agent/forge-ux-batch-8-*` | |
| `/site-visits/:siteVisitId/inspection` | `InspectionRoute.tsx` | `site-visits/[siteVisitId]/inspection/page.tsx` | integrated, refinement pending (visible seam: `InspectionForm`) | `saveSiteVisitInspectionAction`, `completeSiteVisitWithValidationAction` | service-role-only trusted save boundary | manager (Batch 8) | `agent/forge-ux-batch-8-*` | |
| `/estimates` | (estimateScenarios fixtures) | `estimates/page.tsx` | integrated | estimates queries | pricing-review gates | agent/base44-estimates-quotes | worker | |
| `/estimates/:estimateId` | — | `estimates/[estimateId]/page.tsx` | integrated | — | — | agent/base44-estimates-quotes | worker | |
| `/service-catalog` | `ServiceCatalogRoute.tsx` | `services/page.tsx` (naming differs — confirmed intentional, not renamed) | integrated | — | — | agent/base44-estimates-quotes | worker | naming: Base44 `service-catalog` vs Forge `services`, do not rename Forge route without manager sign-off |
| `/service-catalog/:serviceId` | `ServiceDetailRoute.tsx` | `services/_components/*` (no dedicated detail route found) | partial/missing | — | — | agent/base44-estimates-quotes | worker | confirm whether a detail route is required or catalog is list+modal only |
| `/quotes` | `QuotesRoute.tsx` | `quotes/page.tsx` | integrated | — | — | agent/base44-estimates-quotes | worker | |
| `/quotes/:quoteId` | `QuoteDetailRoute.tsx` | `quotes/[quoteId]/page.tsx` | integrated | — | — | agent/base44-estimates-quotes | worker | |
| `/jobs` | `JobsRoute.tsx` | `jobs/page.tsx` (via services? confirm) | integrated | — | — | agent/base44-jobs-scheduling | worker | |
| `/jobs/:jobId` | `JobDetailRoute.tsx` | `jobs/[jobId]/page.tsx` | integrated | — | — | agent/base44-jobs-scheduling | worker | |
| `/calendar`, `/calendar/:eventId` | — | `calendar/page.tsx` | integrated/partial | — | — | agent/base44-jobs-scheduling | worker | confirm event-detail route exists or is modal-based |
| `/invoices` | `InvoicesRoute.tsx` | `invoices/page.tsx` | integrated | — | — | agent/base44-finance-records | worker | |
| `/invoices/:invoiceId` | `InvoicePresentationBar.tsx` (component, not route) | `invoices/[invoiceId]/page.tsx` | integrated | invoice/payment queries, immutable snapshot rules | payment/financial calcs stay server-side | agent/base44-finance-records | worker | reject any client-side financial calc |
| `/expenses` | — | `expenses/page.tsx` | integrated | — | — | agent/base44-finance-records | worker | |
| `/expenses/:expenseId` | — | `expenses/[expenseId]/page.tsx` | integrated | — | — | agent/base44-finance-records | worker | |
| `/team` | `TeamRoute.tsx` | `team/page.tsx` | integrated | — | — | agent/base44-customer-directory or finance (confirm) | worker | |
| `/team/:memberId` | `TeamMemberDetailRoute.tsx` | none found in current tree | missing | — | invite/role permissions | worker (assign) | worker | real gap — confirm before building whether detail route or modal is intended pattern |
| `/activity-logs` | — | `activity-logs/page.tsx` | integrated | — | — | agent/base44-independent-audit | worker | |
| `/site-photos` | `SitePhotosRoute.tsx` | `site-photos/page.tsx` | integrated | — | — | agent/base44-independent-audit | worker | |
| `/site-photos/:photoId` | `PhotoDetailRoute.tsx` | none found in current tree | missing | — | — | agent/base44-independent-audit | worker | confirm intended pattern (route vs lightbox) before building |
| `/settings` | `SettingsRoute.tsx` | `settings/page.tsx`, `settings/website/*` | integrated | — | — | manager-owned (touches org config) | manager | |
| `/portal` (marketing doorway → Forge) | — | `apps/web/app/portal/**` (login, dashboard, scheduling, change-orders, handoff/*) | integrated | portal RLS, magic-link auth | customer-safe visibility boundary | agent/base44-portal-handoff | worker | never let portal expose internal-only fields |
| Public marketing → portal handoff | — | `premier-property-maintenance` repo, request-service form → `/api/v1/service-requests` | integrated | intake API | rate limiting/honeypot present | agent/base44-portal-handoff | worker | marketing repo stays read-only except this handoff path |

## Manager-owned shared surfaces (not in a worker's route scope)

- Root route registries / global nav / mobile nav (`components/navigation/*`)
- Providers, global types, `packages/shared`, `packages/db/types.ts`
- Migrations, package manifests
- Final conflict resolution across worker branches

## Open items to resolve during audit (not stop conditions — resolve from evidence)

- `/service-catalog/:serviceId` and `/team/:memberId` and `/site-photos/:photoId`: confirm via existing modal/drawer patterns before deciding these are real gaps vs. intentional list+overlay design.
- `/jobs` and `/calendar` exact current file locations to be confirmed by the jobs-scheduling worker on first pass (not verified path-by-path in this baseline sweep).
