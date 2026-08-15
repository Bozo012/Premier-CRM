// Google-specific — Routes API, Compute Routes (routes.googleapis.com).
// Replaces the legacy Directions API (maps.googleapis.com/maps/api/
// directions/json), which this codebase no longer calls anywhere.
// Server-only (GOOGLE_MAPS_API_KEY). Parses real response shapes only;
// never computes a fake straight-line distance/duration. Wired to the
// explicit "Calculate route" action (../../../actions.ts), only enabled
// when a key is configured AND at least two stops already have real
// geocoded coordinates — never called automatically.
import type { DirectionsOutcome } from '../types';

const COMPUTE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Field mask kept to exactly what Forge's domain model uses (DirectionsOutcome:
// total distance/duration, per-leg distance/duration, and the overview
// polyline for map rendering) — never requesting fields the app doesn't
// consume, per Google's own field-mask discipline for this API.
const FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration';

interface LatLng {
  lat: number;
  lng: number;
}

function toWaypoint(point: LatLng) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

export interface ComputeRoutesRequestArgs {
  origin: LatLng;
  destination: LatLng;
  /** Intermediate stops, in order — excludes origin/destination. Up to 25 per the Routes API's own limit. */
  waypoints?: LatLng[];
}

/** Realistic Routes API `computeRoutes` response shape — the subset this parser reads. */
export interface GoogleComputeRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string; // e.g. "165s"
    polyline?: { encodedPolyline?: string };
    legs?: Array<{ distanceMeters?: number; duration?: string }>;
  }>;
}

/** Standard Google API error envelope (AIP-193) — same shape as Geocoding API v4. */
export interface GoogleApiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

/** Parses a Routes API duration string ("165s") into whole seconds. Returns
 * 0 for anything that doesn't match the documented format, rather than
 * throwing — a malformed duration shouldn't crash parsing of an otherwise
 * real route. */
function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Math.round(Number(match[1])) : 0;
}

function formatDistanceText(meters: number): string {
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function formatDurationText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'} ${remaining} min${remaining === 1 ? '' : 's'}`;
}

/**
 * Pure parser — no fetch, fully unit-testable against fixture JSON mirroring
 * the real Routes API `computeRoutes` response shape (single route, no
 * route, multi-leg via intermediates).
 */
export function parseComputeRoutesResponse(response: GoogleComputeRoutesResponse): DirectionsOutcome {
  const route = response.routes?.[0];
  if (!route) {
    return { status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: 'No route returned' };
  }

  const legs = (route.legs ?? []).map((leg) => {
    const distanceMeters = leg.distanceMeters ?? 0;
    const durationSeconds = parseDurationSeconds(leg.duration);
    return {
      distanceMeters,
      distanceText: formatDistanceText(distanceMeters),
      durationSeconds,
      durationText: formatDurationText(durationSeconds),
    };
  });

  return {
    status: 'ok',
    legs,
    totalDistanceMeters: route.distanceMeters ?? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: parseDurationSeconds(route.duration) || legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    overviewPolyline: route.polyline?.encodedPolyline ?? null,
    errorMessage: null,
  };
}

/** Parses the standard Google API error envelope into a `DirectionsOutcome`
 * — covers invalid waypoints/malformed requests (400 INVALID_ARGUMENT),
 * authentication failure (401/403), and quota/rate-limit (429) uniformly. */
export function parseComputeRoutesError(body: GoogleApiErrorBody | null, httpStatus: number): DirectionsOutcome {
  const message = body?.error?.message ?? `Route calculation failed: HTTP ${httpStatus}`;
  return { status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: message };
}

/** Live call — never exercised without a real GOOGLE_MAPS_API_KEY. */
export async function computeRoute(apiKey: string, args: ComputeRoutesRequestArgs): Promise<DirectionsOutcome> {
  const body = {
    origin: toWaypoint(args.origin),
    destination: toWaypoint(args.destination),
    intermediates: (args.waypoints ?? []).map(toWaypoint),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
  };

  let response: Response;
  try {
    response = await fetch(COMPUTE_ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      status: 'error',
      legs: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      overviewPolyline: null,
      errorMessage: error instanceof Error ? error.message : 'Network error',
    };
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as GoogleApiErrorBody | null;
    return parseComputeRoutesError(errorBody, response.status);
  }

  const json = (await response.json().catch(() => null)) as GoogleComputeRoutesResponse | null;
  if (!json) {
    return { status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: 'Malformed route response' };
  }
  return parseComputeRoutesResponse(json);
}
