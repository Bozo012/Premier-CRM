// Pure, DOM-free decisions extracted from google-route-map.tsx so the
// actual marker-construction logic is unit-testable without a browser/DOM
// environment (this repo has no jsdom/@testing-library setup — see
// vitest.config.ts — so anything that touches `window.google.maps`
// directly can only be covered by Playwright E2E, not vitest).

import type { MapMarker } from '../types';
import type { GooglePinElementOptions } from './script-loader';

/**
 * Markers must always render above the route polyline. AdvancedMarkerElement
 * (vector-map, DOM-based) and Polyline (drawn on the map's own render layer)
 * do not share an implicit z-order the way legacy `google.maps.Marker` and
 * `Polyline` did on raster maps — a Polyline added after markers (exactly
 * what happens when "Calculate route" succeeds) can visually occlude them
 * without either an error or the markers actually being removed from the
 * map. This was a live regression: markers were visible before Calculate
 * Route and invisible after, despite `markerInstancesRef` never being
 * touched by the polyline effect (confirmed by code audit — the two
 * `useEffect`s have fully disjoint dependency arrays, `[markers,
 * onSelectMarker]` vs. `[overviewPolyline]`, so Calculate Route cannot
 * trigger the marker-cleanup/recreation loop at all). Explicit zIndex
 * values are the documented fix for this class of marker/polyline
 * stacking issue.
 */
export const MARKER_Z_INDEX = 10;
export const POLYLINE_Z_INDEX = 1;

/**
 * Pure decision: does this marker need a custom `PinElement` (priority —
 * shape/glyph/scale distinction, never color alone), or the default pin
 * (non-priority, `content` left undefined)? Returns `null` for "use the
 * default" — deliberately returns a plain options object, never a shared
 * `PinElement` instance, so every caller constructs its own fresh
 * `PinElement` per marker (see google-route-map.tsx's per-iteration `new
 * maps.marker.PinElement(...)` — there is no caching/reuse path for this
 * function to accidentally short-circuit).
 */
export function resolvePriorityPinOptions(marker: Pick<MapMarker, 'isPriority'>): GooglePinElementOptions | null {
  if (!marker.isPriority) return null;
  return {
    background: '#dc2626',
    borderColor: '#7f1d1d',
    glyphColor: '#ffffff',
    glyphText: '!',
    scale: 1.2,
  };
}
