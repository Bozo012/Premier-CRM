# Base44-exact rebuild: Route Planning (`/routes`)

Branch: `rebuild/base44-routing-map` (worktree `C:\dev\Premier-CRM-base44-routing-map`)
Base commit: `96f0d22edf13fe3a9cf64ebf0ba09fb3319e9d59` (PR #133 merged — Finance slice, including the DB-level expense-invoice double-billing fix)
This is a new slice of the Base44-exact rebuild program (after Customers; Properties + Team; Requests + Site Visits + Inspection; Estimates + Service Catalog + Quotes; Jobs + Calendar; Finance).

**Scope-honesty note, up front.** This slice is different in kind from every prior one: **Forge-Base44-UX @ `497d0693` has no `/routes`, map, or dispatch-planning page at all.** I fetched the reference repo's full route tree (`gh api .../git/trees/497d0693...?recursive=1`) and confirmed `src/routes/` contains exactly: activity-logs, calendar, customer-portal, customers, estimates, expenses, invoices, jobs, properties, quotes, requests, service-catalog, settings, shared, site-photos, site-visits, team, today — no `routes`, `map`, `dispatch`, or similar. There is nothing to port markup from. Every presentation component in this slice is **originated**, not ported — built in the same forge design language (shadcn tokens, the same Card/badge/button conventions) every other ported page in this program already uses, rather than invented from scratch. This is the honest characterization of Layer 1 for this slice: "portable presentation component in the Base44 idiom," not "ported Base44 markup."

## What was built, by phase

**Phase 1 (audit) — relied on, not re-derived.** `properties.location GEOGRAPHY(POINT,4326)` + `geocoded_at` exist and are genuinely unused by any application code (confirmed again via grep before writing code); the separate `location_events`/`trips`/`geofences`/`*_location_prefs` live-GPS domain (migration `0005_location_and_automation.sql`) was not touched, queried, or referenced anywhere in this slice; no map/routing npm dependency existed before this slice.

**Phase 3 (dataset)** — `packages/db/queries/route-planning.ts`: `listRouteJobsForDate`, `listRouteSiteVisitsForDate` (both day-scoped, excluding `cancelled`), `listUnscheduledRouteJobs`, `listUnscheduledRouteSiteVisits` (active work with no scheduled time, kept visible rather than dropped). Reuses the exact same source columns Calendar/Today already read (`jobs.scheduled_start`/`scheduled_end`, `site_visit_appointments`) — no new table. Added `listJobAssignmentsForJobs` to `packages/db/queries/job-assignments.ts` (full crew roster per job, not just the lead — an additive sibling to the existing `listJobLeadsForJobs`).

**Phase 4 (route)** — `/routes` under `(app)/(forge)/routes/`, matching the flat naming Base44 uses elsewhere for top-level workspaces (there was no Base44 precedent to match specifically, so `/routes` was kept as instructed). Added `{ href: '/routes', label: 'Route Planning' }` to the shared `forgeNavigationLinks` array (`apps/web/components/navigation/navigation-links.ts`), positioned right after Calendar — it now appears automatically in every consumer of that list (desktop sidebar, mobile "More" sheet, and the standalone `AppDesktopNav`, which needed one added icon-map entry since it iterates the same shared list independently).

**Phase 5 (page structure)** — `route-planning-view.tsx`: header (title, date `<input type=date>`, conditional "Today" shortcut, crew `<select>`), 5 real summary tiles (scheduled stops / jobs / site visits / unassigned / missing location — never mileage/drive-time), a `md:hidden` Route/Map segmented toggle (`role="tablist"`), and a desktop `grid-cols-[1fr_380px]` map+list split that collapses to whichever tab is active on mobile.

**Phase 6 (markers)** — `_lib/forge-routes-view-model.ts`'s `buildMarkers()` produces one `MapMarker` per stop **only when a real geocode succeeded** (`locationStatus === 'geocoded'`); `isPriority` (emergency/high) is carried as a separate boolean so the map layer can render a distinct icon/badge, not just a color, per the task's accessibility requirement (the live pin-icon differentiation itself is unverified without a real key — see Testing). Marker click routes through `onSelectMarker`, which drives the same `selectedId` state the list uses.

**Phase 7 (route list)** — `_components/route-list.tsx`: order number, scheduled time, job/site-visit icon, customer, address, crew names or an "Unassigned" flag, status badge, priority badge (emergency/high only), a location-warning badge, a real `<Link href={stop.detailHref}>` ("Open job"/"Open site visit"), and a real `<a href={mapsUrl} target="_blank">` ("Open in Maps") when a destination exists. Row click sets `selectedId`, shared with the map via `route-planning-container.tsx`.

**Phase 8 (route ordering)** — `orderStopsByScheduledTime()` sorts by `scheduled_start` ascending (id as a tiebreaker) and assigns 1-based `order`. Confirmed (again, independently in this slice) via grep across every job/site-visit/scheduling migration that no `route_stop_order`/`sort_order`/`sequence_number`/`stop_order`/`visit_order` column exists anywhere. **No reorder UI was built** — the safer, simpler option the task explicitly allowed. See "Future persisted-ordering proposal" below for the smallest additive model, documented but not built.

**Phase 9 (crew filtering)** — `parseCrewFilterId`/`matchesCrewFilter`/`filterStopsByCrew`: `all` / `user:<id>` / `lead` (has a resolved lead/assigned technician) / `unassigned`. Jobs are matched against the full `job_assignments` roster (`crewUserIds`, built from `listJobAssignmentsForJobs`); site visits are matched against the single `assigned_user_id`. These are genuinely different real models and are **not merged** — a site visit's "lead" is just its one assignee; a job can have several crew members with one flagged lead. Filtering happens server-side in `page.tsx` against the real per-day dataset (not client-side over a fixed fetch).

**Phase 10 (missing location)** — `locationStatusFor()` in the view-model produces exactly three states: `geocoded` (real coordinate), `unavailable` (usable address, no coordinate — either geocoding failed/returned zero results, or no key is configured at all), `missing-address` (no `address_line_1` on the record). All three keep the stop in the list, always with a working "Open job"/"Open site visit" link; only `missing-address` also surfaces a text badge distinguishing it from `unavailable`. Coordinates are never fabricated — `geocodeByAddressKey` is an empty `Map` whenever `GOOGLE_MAPS_API_KEY` is unset, which collapses every addressed stop to `unavailable` honestly (not a lie about *why*, just an honest "no position available").

**Phase 11 (directions)** — `_lib/map-provider/google/directions.ts`: `parseDirectionsResponse()` (pure, fixture-tested — `OK`/`ZERO_RESULTS`/`REQUEST_DENIED`, multi-leg summation, never a straight-line fallback) and `getDirections()` (live call, server-only key, never invoked in this pass — no UI trigger was wired to it this slice given the time budget; it's ready for a future pass to bind to a "Calculate route" action). This is the one sub-phase where I stopped short of full UI wiring — the adapter, types, and tests exist and are real; the interactive trigger button described in the task ("wire the UI to call it when a key exists") was not added this pass. Flagged here rather than silently claimed complete.

**Phase 12 (Open in Maps)** — `apps/web/lib/maps/external-maps-url.ts`: `buildOpenInMapsUrl()`, Google's key-free universal `https://www.google.com/maps/search/?api=1&query=...` scheme. Shared by the routes list (via the routes-domain re-export at `_lib/map-provider/google/external-maps-url.ts`) and by the three detail-page integrations below. Prefers a real geocoded coordinate over the address string when both exist; returns `null` (hide the action) when there is truly no destination. **Fully live-verifiable in this pass** — no key required, unit-tested, and exercised in the (typechecked, not live-run) E2E spec.

**Phase 13 (Calendar/Today integration)** — Job Detail gained a "Location" card with "View location" (Open in Maps) and, only when `job.scheduled_start` is real, "Open scheduled route" → `/routes?date=<that real date>`. Calendar itself was **not** touched/redesigned, and Today was **not** redesigned — per the task's explicit instruction, this pass added the smallest real link-out rather than a broader integration. A "Route today" quick link from Today was **not** added this pass (time budget) — listed under Known limitations.

**Phase 14 (detail-page integration)** — real, address-driven, link-out only, no embedded map widgets:
- **Property Detail**: a new `secondaryActions: [{ id: 'view-on-map', label: 'View on map' }]` entry in `forge-property-detail-view-model.ts`, resolved in `property-detail-container.tsx`'s `onAction` to `window.open(mapsUrl, '_blank', 'noopener,noreferrer')` using the property's real address — a genuine navigation, not a toast.
- **Job Detail**: the "Location" card described above (Phase 13).
- **Site Visit Detail**: a "View location →" link in the existing `VisitContextCard`. `getSiteVisitById` doesn't carry the denormalized `property_address_*` columns, so `page.tsx` does one small additive `service_requests` read by the visit's already-real `serviceRequestId` — not a new query file, not a fabricated address.

**Phase 15 (privacy)** — `buildOpenInMapsUrl`'s `MapsDestination` type structurally cannot carry `access_notes`/`gate_code` (its fields are `addressLine1`/`addressLine2`/`city`/`state`/`zip`/`coordinates` only) — every call site in this slice passes only address/coordinate fields, verified by reading each call site. No RLS/permission changes were made anywhere; every query in `route-planning.ts` is `org_id`-scoped identically to its Jobs/Site-Visits/Calendar siblings. The `location_events`/`trips`/live-GPS domain was not touched.

## Map-provider architecture

`app/(app)/(forge)/routes/_lib/map-provider/` is the isolation boundary:

- `types.ts` — provider-agnostic `LatLng`/`MapMarker`/`GeocodeOutcome`/`DirectionsOutcome`. This is the **only** surface `_lib/forge-routes-view-model.ts` (the domain/adapter layer) imports from the map-provider folder — it never imports anything Google-specific.
- `google/geocode.ts` / `google/directions.ts` — server-only (`GOOGLE_MAPS_API_KEY`), pure `parse*Response()` functions (fixture-tested) plus a live-call wrapper that is only ever invoked from `page.tsx` behind an explicit `if (!apiKey) return` guard.
- `google/script-loader.ts` / `google/google-route-map.tsx` — the one client component that touches `window.google.maps` directly (a minimal hand-declared ambient interface for the handful of SDK members used — no `@googlemaps/js-api-loader` or `@types/google.maps` dependency was added, keeping this to a handful of files with zero new runtime dependencies).
- `google/external-maps-url.ts` — re-exports the shared, key-free `apps/web/lib/maps/external-maps-url.ts` implementation (also used directly by the three detail pages).

`_components/route-map-panel.tsx` is the seam: it dynamically imports `GoogleRouteMap` (`next/dynamic`, `ssr:false`, since the Maps JS SDK is browser-only) and renders the honest `MapsNotConfigured` fallback whenever no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is present — this is the **only** file outside `map-provider/` that imports Google-specific code; `route-planning-view.tsx` (the presentational layer) receives the whole map area as an injected `mapSlot: ReactNode` prop and never imports either the domain view-model's Google-adjacent pieces or the SDK.

## Google Maps provisioning checklist (for the user, before live verification)

| Item | Detail |
|---|---|
| APIs to enable | Geocoding API, Maps JavaScript API, Directions API (Google Cloud Console → APIs & Services) |
| `GOOGLE_MAPS_API_KEY` | **Server-only.** Never sent to the browser — called only from `page.tsx`'s `geocodeAddressKeys()` and the (currently unwired) Directions adapter. Restrict by **IP address** (your server/deploy egress IPs) and by **API** (Geocoding + Directions only — do not grant Maps JavaScript API to this key). |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **Intentionally browser-visible** — the Maps JavaScript API requires this by Google's own design; there is no way to keep a Maps JS key secret. Restrict by **HTTP referrer** (your app's real domain(s)) and by **API** (Maps JavaScript API only — do not grant Geocoding/Directions to this key). |
| Both documented | `.env.example`, with the restriction guidance inline. |
| What must be live-tested once a key exists | (1) `GoogleRouteMap` actually renders a map and pins at real coordinates; (2) `geocodeAddress`/`parseGeocodeResponse` against a real API response (fixtures only cover shape, not the live network path); (3) a Directions "Calculate route" trigger — **not yet wired to any UI button this pass**, needs that UI hookup before it's testable at all; (4) marker click ↔ list-row selection sync visually confirmed on a real map, not just the shared `selectedId` state (already unit/E2E-covered); (5) priority-marker visual distinction (icon, not just color) confirmed on a real render. |

## Location-data audit (relied on)

`properties.location GEOGRAPHY(POINT,4326)` + `geocoded_at` (migration `0002_crm_core.sql`) remain **completely unused** by any application code — re-confirmed by grep before writing this slice's code, not assumed from the task brief. This slice does **not** persist geocode results there. Geocoding in this slice is **ephemeral, server-side, per-request**: `page.tsx`'s `geocodeAddressKeys()` geocodes the day's distinct addresses on every page load when a server key exists, with no caching/persistence layer. This is a deliberate, honestly-scoped decision, not an oversight — see "Future persistence proposal" below.

## Route-ordering semantics

Scheduled-time only (`orderStopsByScheduledTime()`), confirmed via unit test that ties break deterministically on id. **Future persisted-ordering proposal (documented, not built):** the smallest additive model would be a single nullable `route_stop_order INTEGER` column added independently to `jobs` and to `site_visit_appointments` (two columns, not a new join table — avoids the FK/polymorphism complexity of a shared `route_stops` table for a same-day, dispatcher-editable integer), defaulting to `NULL` (meaning "use scheduled-time order," preserving today's behavior for every existing row), settable only via a new `reorder_route_stop(id, new_order)`-style RPC scoped to a single calendar day and org, with the route list's sort falling back to scheduled-time whenever the column is null. This was assessed but **not built** in this slice — it is schema-adjacent (a genuine migration) and out of this slice's authorization per the task's explicit instruction.

## Crew integration

Jobs: `job_assignments` via `listJobAssignmentsForJobs` (full roster) — `crewUserIds`/`crewNames`/`leadTechnicianName` on each `RouteStopModel`. Site visits: `site_visit_appointments.assigned_user_id` (single person) via a batched `user_profiles` lookup. **Documented mismatch, not papered over**: a job can show multiple crew members with one lead; a site visit can only ever show zero or one assignee, and that one person is treated as both "the crew" and "the lead" for filtering purposes (`matchesCrewFilter`'s `lead` case: `leadTechnicianName !== null`, which for a site visit just means "has an assignee"). This is called out in code comments in `forge-routes-view-model.ts` and in `route-planning.ts`.

## Missing-location handling

Three states, never a fabricated fourth: `geocoded` / `unavailable` / `missing-address` (see Phase 10 above). Verified by unit test that a stop with an address but no geocode reads `unavailable`, and a stop with `address: null` reads `missing-address` — and that both remain in the route list with a working detail link.

## Directions/routing support — fixture-tested only, not live

`parseDirectionsResponse()` is fully unit-tested against realistic Google Directions API response shapes (`OK` with multi-leg summation, `ZERO_RESULTS`, `REQUEST_DENIED` with `error_message` propagation, and a defensive `OK`-with-empty-`legs` case). The live `getDirections()` call exists and is correctly gated behind a server-only key, but **no UI trigger calls it in this pass** — this is the one sub-phase left short of the task's full ask ("wire the UI to call it when a key exists"). Flagged explicitly rather than claimed done.

## Privacy boundaries

`MapsDestination`'s type shape structurally excludes `gate_code`/`access_notes`/internal notes — verified by reading every one of the ~5 call sites in this slice (route list, Property/Job/Site-Visit detail pages) to confirm none passes anything beyond address/coordinate fields. No RLS changes. `location_events`/`trips`/live-GPS tracking domain untouched — grepped again at the end of this slice to confirm no accidental import crept in.

## Gap table

| Item | Classification | Notes |
|---|---|---|
| No Base44 `/routes`/map reference exists | Confirmed via full route-tree fetch | Every presentation component in this slice is originated in the forge design language, not ported markup — see the scope-honesty note. |
| `properties.location`/`geocoded_at` persistence | Intentionally not built | Ephemeral per-request geocoding instead; documented future opportunity, not a migration in this slice. |
| `route_stop_order` persisted reordering | Intentionally not built (task stop-condition) | Smallest additive model documented above; requires a genuine migration, out of this slice's authorization. |
| Directions "Calculate route" UI trigger | Not wired this pass | Adapter + parser + unit tests exist and are real; no button calls `getDirections()` yet. Flagged as a real shortfall, not silently skipped. |
| "Route today" quick link on Today | Not built this pass | Task allowed as a "consider" item; time-budget cut. Today itself was correctly left un-redesigned. |
| Site visit crew = single `assigned_user_id` vs. job multi-person `job_assignments` | Found-real, not merged | Two genuinely different models; documented, filtering handles both correctly but distinctly. |
| Priority-marker visual distinction (icon/shape, not just color) | Built, not live-verified | `MapMarker.isPriority` is real and passed through; `GoogleRouteMap`'s pin-icon swap is unverified without a live key. |
| Live geocoding / live Directions / live map render / marker↔list sync on a real map | Not live-verifiable in this environment | No `GOOGLE_MAPS_API_KEY` configured anywhere in this worktree — see provisioning checklist. |

## Testing

**Unit (`pnpm test`)**: before this slice, 391 tests passing across 47 test files (baseline, reconstructed by isolating this slice's 31 new tests from the 422 now passing). After: **48 passed / 1 skipped test files, 416 passed / 6 skipped tests (422 total), all green** — no regressions. New: `routes/_lib/forge-routes-view-model.test.ts` (job/site-visit projection, scheduled-time ordering, crew/lead/unassigned filtering, marker generation only for geocoded stops, honest summary counts, address-key deduping), `routes/_lib/map-provider/google/geocode.test.ts` (OK/ZERO_RESULTS/REQUEST_DENIED/OVER_QUERY_LIMIT/multi-result-first-wins), `routes/_lib/map-provider/google/directions.test.ts` (multi-leg summation, ZERO_RESULTS, empty-legs, REQUEST_DENIED), `lib/maps/external-maps-url.test.ts` (address URL, coordinate-preference, null-destination, no-gate-code-in-signature). `navigation-links.test.ts` updated for the new nav entry.

**Typecheck (`pnpm typecheck`)**: clean across all 5 packages.

**Build (`pnpm --filter web build`)**: succeeds. `/routes` appears exactly once in the route output, server-rendered (`ƒ`).

**E2E (`tests/e2e/routes-base44-shell-bot.spec.ts`)**: written and typechecked (`npx tsc --noEmit -p tests/e2e/tsconfig.json` introduces **zero new errors** — confirmed by diffing against the pre-existing baseline via `git stash`, which showed the same 8 pre-existing files with pre-existing errors both with and without this spec present). **Not run live** — no `.env.test`/Supabase credentials exist in this worktree, per the standing convention for this program; that is the independent-verification pass's job. Covers: redirect-to-login, 4-viewport no-overflow, shell chrome presence, real (never fabricated) summary tile labels, the honest "Maps not configured" fallback, date-input URL update, crew-filter URL update, keyboard focus on the date input, mobile Route/Map segmented toggle, list-row selection (`aria-current`) state, conditional missing-location-badge assertions, and real `<Link>` click-through to Job/Site Visit detail.

**What is NOT YET LIVE-VERIFIED** (needs a real `GOOGLE_MAPS_API_KEY`/`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, provisioned by the user later): actual Google map rendering, live geocoding against the real Geocoding API, live Directions API calls (also blocked on the UI-wiring gap above), real marker pixel placement, and marker-click ↔ list-row selection sync verified against an actual rendered map (the underlying `selectedId` state itself is provider-independent and is E2E-covered).

## Known limitations / follow-ups

1. No Base44 reference existed for this page — visual fidelity to "what Base44 would have built" cannot be claimed or verified, only fidelity to this program's own established design conventions.
2. Directions API adapter is not wired to any UI trigger this pass (see Gap table) — the next natural step is a "Calculate route" button gated on `mapsApiKey && geocoded stop count >= 2`.
3. "Route today" quick link from Today was not added (time-budget cut, task marked it a "consider," not a requirement).
4. Ephemeral per-request geocoding has no caching layer — every page load re-geocodes the day's distinct addresses when a key exists. Acceptable at this codebase's current scale; the documented future persistence path (`properties.location`/`geocoded_at`) would remove this cost entirely for stable addresses.
5. `route_stop_order` persisted reordering was intentionally not built — see the documented smallest-additive-model proposal above.
6. E2E spec is typechecked only, not run live in this pass, per the standing verification split for this program.

## Commits on this branch (in order)

1. `e2cbb7d` — db: Route Planning dataset queries for jobs/site visits by date (`route-planning.ts`, `listJobAssignmentsForJobs`).
2. `cf36b4f` — `/routes` page, Google Maps provider boundary, view-model, presentation components, nav wiring.
3. `3b87a29` — Shared `external-maps-url` lib + Property/Job/Site Visit "View on map"/"View location" link-outs, `.env.example` documentation.
4. `8a99135` — `routes-base44-shell-bot.spec.ts` E2E spec + `routePlanning` selector.
