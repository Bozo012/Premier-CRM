// Google-specific — Geocoding API v4 (geocode.googleapis.com), not the
// legacy v3 web service (maps.googleapis.com/maps/api/geocode/json).
// Server-only: called from server components/actions using
// GOOGLE_MAPS_API_KEY (never the NEXT_PUBLIC_ browser key). Never called
// unless that env var is actually set — see callers in ../../../page.tsx,
// which check `Boolean(process.env.GOOGLE_MAPS_API_KEY)` before invoking
// geocodeAddress.
//
// v4 is a server-to-server API (Google's own guidance: "you shouldn't call
// Geocoding API v4 methods directly from client-side JavaScript"), uses
// lowerCamelCase field names (unlike v3's snake_case), and is one of the
// APIs a Maps Demo Key is documented to support — v3 support under a Demo
// Key was not confirmed in Google's current documentation, so v4 is the
// correct target for both the "current API" and "Demo Key compatible"
// requirements at once.
import type { GeocodeOutcome } from '../types';

const GEOCODE_V4_ADDRESS_ENDPOINT = 'https://geocode.googleapis.com/v4/geocode/address';

/** The subset of a Geocoding API v4 successful result this parser reads. */
export interface GoogleGeocodeV4Result {
  location: { latitude: number; longitude: number };
  formattedAddress: string;
}

export interface GoogleGeocodeV4Response {
  results?: GoogleGeocodeV4Result[];
}

/**
 * Standard Google API error envelope (AIP-193 — the same shape confirmed
 * for the Routes API and used across Google Cloud/Maps Platform REST
 * services): `{ error: { code, message, status } }`, returned on any
 * non-2xx response. `code` mirrors the HTTP status; `status` is the enum
 * string (e.g. `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`).
 */
export interface GoogleApiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Pure parser — no fetch, fully unit-testable against fixture JSON. A
 * missing/empty `results` array is treated as "not found," never an error
 * and never a fabricated position — this mirrors v3's ZERO_RESULTS handling
 * even though v4's exact zero-result response shape is not fully documented
 * (Google's public docs did not show one at the time this was written); an
 * empty-results-on-200 response is the idiomatic shape for this class of
 * Google Cloud "read" method, and is treated the same as an explicitly
 * empty array either way.
 */
export function parseGeocodeV4Response(response: GoogleGeocodeV4Response): GeocodeOutcome {
  const first = response.results?.[0];
  if (!first) {
    return { status: 'not-found', position: null, formattedAddress: null, errorMessage: null };
  }
  return {
    status: 'ok',
    position: { lat: first.location.latitude, lng: first.location.longitude },
    formattedAddress: first.formattedAddress,
    errorMessage: null,
  };
}

/** Pure parser for the standard Google API error envelope — covers
 * authentication failure (401/403), quota/rate-limit (429), and malformed
 * requests (400) uniformly, since they all share one response shape. */
export function parseGeocodeV4Error(body: GoogleApiErrorBody | null, httpStatus: number): GeocodeOutcome {
  const message = body?.error?.message ?? `Geocoding failed: HTTP ${httpStatus}`;
  return { status: 'error', position: null, formattedAddress: null, errorMessage: message };
}

/**
 * Live call — never exercised without a real GOOGLE_MAPS_API_KEY. Wrapped
 * in try/catch by callers so a geocoding failure degrades to "Location
 * unavailable" rather than breaking the page. Handles network failure,
 * malformed JSON, and non-2xx responses explicitly rather than letting any
 * of them throw uncaught.
 */
export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodeOutcome> {
  const url = `${GEOCODE_V4_ADDRESS_ENDPOINT}/${encodeURIComponent(address)}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKey } });
  } catch (error) {
    return {
      status: 'error',
      position: null,
      formattedAddress: null,
      errorMessage: error instanceof Error ? error.message : 'Network error',
    };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as GoogleApiErrorBody | null;
    return parseGeocodeV4Error(body, response.status);
  }

  const json = (await response.json().catch(() => null)) as GoogleGeocodeV4Response | null;
  if (!json) {
    return { status: 'error', position: null, formattedAddress: null, errorMessage: 'Malformed geocoding response' };
  }
  return parseGeocodeV4Response(json);
}
