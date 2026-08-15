# Maps Modernization: Legacy Directions/Geocoding → Routes API + Geocoding API v4

Status: implemented on `feature/maps-modernization-routes-api`, base `origin/main @ fa195db3b4f5861847f598a0920690183884d0bb`. Not merged, not deployed. No production migration, no production credential, and no production infrastructure change is part of this slice.

## Live verification findings (PR preview, Demo Key)

**Maps JavaScript API: PASS.** Confirmed rendering successfully on the PR preview after allowlisting the preview URL as an HTTP referrer for the Demo Key.

**Geocoding API v4: FAIL — root cause identified, not a code defect.** A real scheduled job (21 Millers Ridge Dr, Warsaw, KY 41095 — an address Google Maps independently resolves correctly) failed to geocode through Forge: "Missing location: 1," no marker, map stayed at the default continental-US extent.

Investigated by independently reproducing the exact request this codebase makes, directly against Google's live servers (no key, to isolate infrastructure/format issues from credential issues):

- `GET https://geocode.googleapis.com/v4/geocode/address/{urlEncodedAddress}` — confirmed live and correctly routed for both `v4` and `v4beta` (returns a real `403 PERMISSION_DENIED` in the exact AIP-193 shape this code's parser expects, not a 404 "no such route").
- The exact problem address, URL-encoded exactly as this code encodes it (`encodeURIComponent`), reproduced against the same real endpoint: same clean `403 PERMISSION_DENIED`, no 400 `INVALID_ARGUMENT` — rules out an address-encoding/format defect.
- `X-Goog-Api-Key` header mechanism confirmed correct (this is literally how the reproduction request above authenticates, or rather fails to).

This rules out, with direct evidence rather than inference: wrong endpoint, wrong URL/address encoding, wrong header name, and wrong error-response parsing.

**Most likely remaining cause**: an HTTP referrer (website) restriction. Google's own key-restriction documentation is explicit that website restrictions are for browser-originated requests only — a request must carry a `Referer` header matching the allowed pattern, and server-side `fetch()` calls (this app's Geocoding v4 and Compute Routes calls both run server-side, in Next.js server components/actions) do not send one. If the same Demo Key value populates both `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY` (as this doc originally suggested for testing convenience — see "correction" below), and it now carries an HTTP referrer restriction (added to fix Maps JS loading on the preview), every server-side call against that key would be rejected for this reason alone, regardless of which server API it targets. This has not been confirmed against the actual key (no access to it, and it should never be pasted into chat per your own instruction) — it is the conclusion best supported by process of elimination after ruling out every code-level explanation, not a certainty.

**Correction to this doc's original Demo Key guidance**: the earlier claim that "the same demo key value may be used for both variables" was about which *APIs* a Demo Key's product tier supports (confirmed true — Maps JS, Geocoding v4, and Routes API are all in scope). It did not account for *restriction type* incompatibility, which is a separate, more fundamental Google Cloud API-key mechanic (HTTP-referrer vs. no-restriction/IP-restriction) that applies to Demo Keys exactly the same as billed keys. **The correct setup, even for Demo Key testing, is two separate key values** — matching the "two separate keys, two separate restriction models" plan this doc always specified for *production* (§ "Final production credential plan"), just pulled forward to the testing phase too:
- One Demo Key, HTTP-referrer-restricted to the preview/production domain(s), for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- A second Demo Key (or the same key with no restriction, if Google's Cloud Console allows an unrestricted Demo Key — restriction-free is the only mode compatible with a referrer-less server call) for `GOOGLE_MAPS_API_KEY`.

**Diagnostic logging added** (`page.tsx`'s `geocodeAddressKeys()`): a geocoding failure now logs Google's own returned error message (never the API key) to server console/Vercel function logs, rather than silently collapsing into "Location unavailable" with no trace of why. Once a second, unrestricted server key is configured and this branch is redeployed, re-visiting `/routes` for a date with a real address will produce a log line with Google's exact rejection reason (or confirm success) — turning this from inference into direct confirmation.

**Compute Routes: NOT EXERCISED.** No day currently has ≥2 geocoded stops (confirmed by you; not independently re-verified against a second data source, since doing so would require the same credential fix above to even attempt). If the diagnosis above is correct, Compute Routes would hit the identical referrer-restriction rejection once real multi-stop data existed — this is a credential-configuration risk to close before merge, not a reason to believe the Compute Routes *code* itself is defective (its request construction was verified the same way as Geocoding's — see the "Compute Routes architecture" section above, and its own fixture-based test suite remains green).

**No production data was created, mutated, or read-write-touched** to investigate this — every check above was either a read-only query against already-existing production rows, or a request against Google's own public endpoint using no real credential.

## Forward-looking architecture note (not implemented in this PR)

You flagged that the next planned slice is canonical `properties.location` persistence (coordinates captured once, at Places-selection time, on the property record itself), with Geocoding API v4 becoming a fallback/backfill path rather than the routine per-page-load behavior this PR implements. That's a real, larger architectural shift — persisted coordinates, a write path, a backfill job for existing properties, and a different call pattern for `/routes` (read `properties.location` first, geocode only on a genuine cache-miss). None of that is implemented here; this PR's `/routes` page continues to geocode ephemerally, every load, exactly as it did before this change (only the underlying API target moved from v3 to v4). Recorded here so the next slice has this context without re-deriving it.

## Why

Production has no Google Maps credentials configured (confirmed via manual Vercel dashboard check, 2026-08-14). Rather than provision credentials for the pre-existing legacy Directions API implementation and immediately owe a migration, this modernizes the Google provider layer *before* any real key is ever used against it — Route Planning has never been live-verified, so there is no live behavior to preserve compatibility with.

## Google API research (current as of this writing)

- **Directions API (legacy REST, `maps.googleapis.com/maps/api/directions/json`)**: not on Google's formal deprecation list, but the JS-side `DirectionsService`/`DirectionsRenderer`/`DistanceMatrixService` classes were deprecated 2026-02-25 (functional, no discontinuation date set) — a clear signal Directions is in maintenance mode in favor of the Routes API. [Deprecations](https://developers.google.com/maps/deprecations)
- **Routes API — Compute Routes**: Google's current, actively-developed routing product. Endpoint `POST https://routes.googleapis.com/directions/v2:computeRoutes`. [Reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- **Geocoding API v3 (legacy, `maps.googleapis.com/maps/api/geocode/json`)**: not deprecated, still generally available — but Google has shipped an entirely new **Geocoding API v4** (`geocode.googleapis.com/v4/geocode`) with a different data model (camelCase, richer destination data) and different auth (`X-Goog-Api-Key` header vs. a `key` query param). [v4 overview](https://developers.google.com/maps/documentation/geocoding/geocoding-v4-overview)
- **Maps Demo Key**: confirmed (Google's own demo-key documentation) to support Maps JavaScript API, **Geocoding API v4**, and **Routes API (Compute Routes)** — not confirmed to support legacy v3 Geocoding or the legacy Directions API. This is the deciding factor for targeting v4/Routes: it's both the current product *and* the only path this app can actually exercise with a no-billing demo key. [Demo key docs](https://developers.google.com/maps/demo-key)
- **Maps JavaScript API**: unchanged — already the current product, already loaded via Google's own `<script>` bootstrap pattern. `google.maps.Marker` is deprecated-but-functional (no discontinuation date); migrating to `AdvancedMarkerElement` was evaluated and explicitly deferred — out of this slice's scope (marker rendering, not routing/geocoding, and the guardrails exclude unrelated UI work).
- **Error format**: both Routes API and Geocoding API v4 are modern Google Cloud-style REST services; Routes API's error shape is confirmed via Google's own error-design standard (AIP-193) as `{ "error": { "code": <http status>, "message": <string>, "status": <ENUM> } }`. Geocoding v4's exact error/zero-result shape was not spelled out in the fetched docs at the time of writing — the implementation defensively assumes the same AIP-193 envelope (matching Routes API and Google's own cross-platform standard) and treats a missing/empty `results` array as "not found" on any 2xx response. This is a documented assumption, not a confirmed contract — flagged here rather than silently relied on.

## Provider boundary (preserved, not rewritten)

`_lib/map-provider/types.ts` already defined provider-agnostic `GeocodeOutcome`/`DirectionsOutcome` shapes before this change — no domain type changed. All Google-specific parsing stays inside `_lib/map-provider/google/`; the view-model (`forge-routes-view-model.ts`) and presentational layer (`route-planning-view.tsx`, `route-list.tsx`) never import Google-specific code, exactly as before.

## Geocoding architecture (Step 4)

`_lib/map-provider/google/geocode.ts` — rewritten against Geocoding API v4.

- `GET https://geocode.googleapis.com/v4/geocode/address/{urlEncodedAddress}`, header `X-Goog-Api-Key`.
- Three-state honest model preserved exactly: `ok` (real coordinate), `not-found` (empty/missing `results`), `error` (network failure, malformed JSON, non-2xx response — auth/quota/etc. all share the standard error envelope). Coordinates are never fabricated.
- Server-only; the `GOOGLE_MAPS_API_KEY` credential never reaches client code (unchanged call site discipline in `page.tsx`: `geocodeAddressKeys()` only runs when `process.env.GOOGLE_MAPS_API_KEY` is truthy).
- Records with a failed/missing geocode remain in the route list (`locationStatus: 'unavailable' | 'missing-address'`) — unchanged behavior, verified via `forge-routes-view-model.ts` (untouched).
- Fixture/unit coverage: `geocode.test.ts`, rewritten against v4 response shapes (single result, multiple results — takes first, empty results, missing results, standard error envelope for `PERMISSION_DENIED`/`RESOURCE_EXHAUSTED`, malformed-body fallback).

## Compute Routes architecture (Step 5)

`_lib/map-provider/google/compute-routes.ts` — new file, replaces the deleted `directions.ts`.

- `POST https://routes.googleapis.com/directions/v2:computeRoutes`, headers `Content-Type: application/json`, `X-Goog-Api-Key`, `X-Goog-FieldMask`.
- **Field mask** (exactly what Forge's domain model uses, nothing else): `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration`.
- Request body: `origin`/`destination`/`intermediates` as `{ location: { latLng: { latitude, longitude } } }`, `travelMode: "DRIVE"` (the only mode relevant to a field-service crew), `routingPreference: "TRAFFIC_AWARE"`, `computeAlternativeRoutes: false` (Forge shows one route, not a picker — matches the existing domain model, which has no concept of route alternatives).
- Response parsing: per-leg `distanceMeters`/`duration` (Google returns duration as a string like `"780s"` — parsed to whole seconds via a small regex, never `NaN`-propagated), summed for the total when the top-level `distanceMeters`/`duration` are absent, real `polyline.encodedPolyline` passed straight through (never computed client-side).
- Errors handled uniformly via the standard envelope: invalid waypoint / malformed request (400 `INVALID_ARGUMENT`), auth failure (401/403), quota (429 `RESOURCE_EXHAUSTED`), no route (empty `routes` array on 200), network failure, malformed JSON.
- Fixture/unit coverage: `compute-routes.test.ts` — single-leg route, multi-leg route (N intermediates → N+1 legs), empty-routes error, missing-routes-field error, legs-sum fallback when top-level totals are absent, zero-leg edge case (no divide-by-zero), hour-scale duration formatting, and all four error classes above.

## Calculate Route UI trigger (Step 7 — the previously-missing V1 gap)

New files: `actions.ts` (server action `calculateRouteAction`) and `_components/calculate-route-panel.tsx` (client trigger + result display), wired into `route-planning-container.tsx` / `route-planning-view.tsx`.

- **Behavior**: uses the exact scheduled-time + crew-filter order already computed server-side in `page.tsx` (`orderStopsByScheduledTime` → `filterStopsByCrew`) — the action takes that ordered list of already-geocoded coordinates as input and never reorders, optimizes, or persists anything. No new table, no `route_stop_order` column, no Route Optimization API call.
- **Auth**: the action re-authenticates (`supabase.auth.getUser()`) and confirms active org membership (`getActiveOrgContext`) — the same bar as viewing `/routes` at all. No new capability was introduced; this mirrors the original (never-wired) Directions adapter's own comment, which never gated on anything beyond "a key is configured AND at least two stops are geocoded."
- **Disabled state**: the button is disabled (with an honest inline explanation) whenever fewer than two stops currently have real coordinates — never sends a doomed single-point request to Google.
- **Display**: real total distance (miles) and estimated travel time on success; the real polyline is drawn on the map (new `Polyline` support added to `google-route-map.tsx` + `script-loader.ts`, using `google.maps.geometry.encoding.decodePath()` against the real encoded polyline — never a client-computed straight line). Failures show the real provider error message, never a fabricated number.
- **Scheduled order stays authoritative**: nothing in this slice writes back to `jobs.scheduled_start`/`site_visit_appointments.scheduled_start` or any other scheduling-authoritative column — Calculate Route is read-only against Google, using data Forge already computed.

## Legacy dependency removal (Step 6)

`directions.ts` and `directions.test.ts` deleted outright (not left as dead code). Repo-wide search after the change confirms zero remaining references to `maps.googleapis.com/maps/api/directions` or `maps.googleapis.com/maps/api/geocode` in source, tests, or non-historical docs — the only surviving string match is a comment inside the new `geocode.ts` explicitly noting what is *not* used and why (historical context, not a dependency).

## Demo Key support (Step 8)

Per Google's own Demo Key documentation, there is no separate browser/server variant described — the same demo key value may populate both `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY` for testing. `.env.example` was updated to make the distinction between demo/testing and final production credentials explicit, without ever containing an actual key value. No key was committed anywhere in this change (verified via `git diff`/`git status` before every commit).

## Live Demo-Key verification plan (Step 10 — for you to execute)

Once you place a demo key into both Vercel env vars and redeploy this branch to a preview (or merge, per the release-safety note below), the following becomes checkable against the real Google APIs:

1. `/routes` loads the real Google map (replaces the "Maps not configured" fallback).
2. Maps JavaScript tiles render.
3. A real property address geocodes via Geocoding API v4 — check the network tab for a `geocode.googleapis.com/v4/...` call, 200 response.
4. The resulting marker appears at the geographically correct location.
5. An intentionally bad/missing address still shows in the route list as "Location unavailable"/"Missing address" — never a crash, never a fabricated pin.
6. Marker click ↔ list-row selection sync still works (unchanged code path, but only visually confirmable with a live map).
7. Priority-marker visual distinction (icon vs. default) is visible — unchanged in this slice.
8. Clicking "Calculate route" (with ≥2 geocoded stops) issues a `routes.googleapis.com/directions/v2:computeRoutes` POST.
9. Real total distance is displayed.
10. Real estimated travel time is displayed.
11. The real polyline renders on the map (blue line following actual roads, not a straight line between pins).
12. Deliberately triggering a quota/auth failure (e.g. temporarily revoking the demo key's API access in Cloud Console) produces the honest error message in the Calculate Route panel, not a silent failure or a fabricated number.

If any Demo Key restriction blocks a specific check (e.g. a daily quota is hit mid-verification), that is a **Demo Key limitation to report**, not a code defect — do not reinterpret it as a bug in this implementation without first confirming against Google Cloud Console's quota/usage page for the demo project.

**A successful Demo Key verification is not production credential sign-off** — see below.

## Final production credential plan (Step 11)

**Browser credential — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`**
- Enabled API: Maps JavaScript API only.
- Restriction: HTTP referrers — `https://app.ppmnky.com/*` (and any legitimate preview domains you want to test against; do not leave this open to `*`).
- Never grant Geocoding or Routes API access to this key — it's intentionally browser-visible, so it must be unable to do anything beyond rendering map tiles.

**Server credential — `GOOGLE_MAPS_API_KEY`**
- Enabled APIs: Geocoding API (v4) and Routes API only.
- Application restriction: standard Vercel serverless functions do not expose a fixed outbound IP by default, so an IP-address restriction is **not a legitimate option** here unless you've separately provisioned a static-egress setup (e.g. a NAT gateway) — do not invent one. Absent that, rely on API restriction (Geocoding + Routes only, nothing else) as the primary boundary, matching how every other server-only secret in this codebase is scoped (least-privilege by API, not by network).
- Never expose this key to the browser bundle — confirmed unchanged: it is read only in `page.tsx` (server component) and `actions.ts` (server action), never passed as a prop to client components.

**Billing**: both Geocoding API v4 and Routes API require a billing account once usage exceeds the Demo Key's no-cost tier — this is a genuine cost center, not a one-time setup step. Recommend:
- Enable budget alerts in Google Cloud Console before switching from the demo key to a billed key (e.g. an alert at a conservative dollar threshold well below what a full day of the demo key's own daily cap would represent).
- Start with Google's default per-API quotas; raise only if real usage data shows a legitimate need — do not pre-provision headroom "just in case."

**Credential rotation**: standard practice — generate the new key in Cloud Console, add it as a new Vercel env var value, redeploy, confirm the new key works in production, then delete the old key in Cloud Console. Never delete the old key before confirming the new one is live, and never rotate both the browser and server key in the same change window (isolate the blast radius if one rotation goes wrong).
