# Forge Base44 UX Integration — Batch 7

## References

- Premier-CRM base branch: `main`
- Premier-CRM base commit: `901a0b17aae5ba3f8f51c082548b6148abf0a8f8`
- Forge-Base44-UX reference branch: `main`
- Forge-Base44-UX reference commit: `497d0693cccafd89315ec17c3be9885cfaae5c84`

## Implemented

- Reworked Customers into the Base44 list/table/card presentation while keeping `customers`, `customer_properties`, `service_requests`, and `estimates` as the only data sources.
- Reworked Properties into the Base44 list/table/card presentation while keeping Premier property ownership, request, and job data authoritative.
- Reworked Activity Logs into the Base44 "Quick Logs" visual model using existing `activity_log` rows; no quick-log persistence was invented.
- Reworked Service Catalog into the Base44 card grid and filter model while preserving the existing real catalog editors behind the manage section.
- Added the Today board toggle and mobile-safe board layout backed by real jobs and site visits.
- Added the Base44-style account dropdown to the app header using the existing profile, org context, theme control, and sign-out action.
- Reworked Settings into the Base44 sectioned layout with real org/profile data and a direct Website content entry point.
- Added counted Site Visit filter chips and kept "New visit" disabled because Premier creates visits from request triage.

## Backend Boundaries

- No Base44 auth, fixture harness, mocked persistence, drag-and-drop state mutation, or platform infrastructure was ported.
- Quick Logs still need a real writable domain model before the "New log" action should be enabled.
- Direct "New property" remains blocked until Premier has a dedicated real route/action for property creation outside customer context.
- Direct "New visit" remains blocked because Premier's authoritative workflow creates site visits from request triage.
- Settings fields are presented read-only except for existing linked actions; enabling saves should be a separate backend-backed settings action.
- The Today board is view-only. Moving cards between columns would require real job/site-visit lifecycle server actions before enabling drag-and-drop.

## Validation

- `pnpm vitest run apps/web/app/'(app)'/today/_lib/view-model.test.ts apps/web/lib/branding.test.ts`
- `pnpm --filter @premier/web typecheck`
