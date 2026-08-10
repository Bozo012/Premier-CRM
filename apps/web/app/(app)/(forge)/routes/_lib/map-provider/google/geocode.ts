// Google-specific — Geocoding API. Server-only: called from server
// components/actions using GOOGLE_MAPS_API_KEY (never the NEXT_PUBLIC_
// browser key). Never called unless that env var is actually set — see
// callers in ../../../page.tsx, which check `Boolean(process.env.
// GOOGLE_MAPS_API_KEY)` before invoking geocodeAddress.
import type { GeocodeOutcome } from '../types';

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Realistic Google Geocoding API response shape — the subset this parser reads. */
export interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
      location_type?: string;
    };
  }>;
}

/**
 * Pure parser — no fetch, fully unit-testable against fixture JSON that
 * mirrors real Google Geocoding API response shapes (ZERO_RESULTS,
 * OVER_QUERY_LIMIT, REQUEST_DENIED, OK with one or more results).
 */
export function parseGeocodeResponse(response: GoogleGeocodeResponse): GeocodeOutcome {
  if (response.status === 'ZERO_RESULTS') {
    return { status: 'not-found', position: null, formattedAddress: null, errorMessage: null };
  }
  if (response.status !== 'OK') {
    return {
      status: 'error',
      position: null,
      formattedAddress: null,
      errorMessage: response.error_message ?? `Geocoding failed: ${response.status}`,
    };
  }
  const first = response.results[0];
  if (!first) {
    return { status: 'not-found', position: null, formattedAddress: null, errorMessage: null };
  }
  return {
    status: 'ok',
    position: { lat: first.geometry.location.lat, lng: first.geometry.location.lng },
    formattedAddress: first.formatted_address,
    errorMessage: null,
  };
}

/**
 * Live call — never exercised without a real GOOGLE_MAPS_API_KEY. Wrapped
 * in try/catch by callers so a geocoding failure degrades to "Location
 * unavailable" rather than breaking the page (Phase 10).
 */
export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodeOutcome> {
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return { status: 'error', position: null, formattedAddress: null, errorMessage: `HTTP ${response.status}` };
  }
  const json = (await response.json()) as GoogleGeocodeResponse;
  return parseGeocodeResponse(json);
}
