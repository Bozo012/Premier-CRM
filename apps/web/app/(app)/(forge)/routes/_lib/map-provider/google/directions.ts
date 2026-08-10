// Google-specific — Directions API. Server-only (GOOGLE_MAPS_API_KEY).
// Parses real response shapes only; never computes a fake straight-line
// distance/duration. Not called automatically — wired to an explicit
// "Calculate route" action, only enabled when a key is configured AND at
// least two stops already have real geocoded coordinates.
import type { DirectionsOutcome } from '../types';

const DIRECTIONS_ENDPOINT = 'https://maps.googleapis.com/maps/api/directions/json';

export interface GoogleDirectionsResponse {
  status: string;
  error_message?: string;
  routes: Array<{
    overview_polyline?: { points: string };
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
  }>;
}

/** Pure parser — unit-testable against fixture JSON (OK, ZERO_RESULTS, REQUEST_DENIED, etc.). */
export function parseDirectionsResponse(response: GoogleDirectionsResponse): DirectionsOutcome {
  if (response.status !== 'OK') {
    return {
      status: 'error',
      legs: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      overviewPolyline: null,
      errorMessage: response.error_message ?? `Directions failed: ${response.status}`,
    };
  }
  const route = response.routes[0];
  if (!route) {
    return { status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: 'No route returned' };
  }
  const legs = route.legs.map((leg) => ({
    distanceMeters: leg.distance.value,
    distanceText: leg.distance.text,
    durationSeconds: leg.duration.value,
    durationText: leg.duration.text,
  }));
  return {
    status: 'ok',
    legs,
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    overviewPolyline: route.overview_polyline?.points ?? null,
    errorMessage: null,
  };
}

/** Live call — never exercised without a real GOOGLE_MAPS_API_KEY. */
export async function getDirections(
  apiKey: string,
  args: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; waypoints?: Array<{ lat: number; lng: number }> }
): Promise<DirectionsOutcome> {
  const url = new URL(DIRECTIONS_ENDPOINT);
  url.searchParams.set('origin', `${args.origin.lat},${args.origin.lng}`);
  url.searchParams.set('destination', `${args.destination.lat},${args.destination.lng}`);
  if (args.waypoints && args.waypoints.length > 0) {
    url.searchParams.set('waypoints', args.waypoints.map((point) => `${point.lat},${point.lng}`).join('|'));
  }
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return { status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: `HTTP ${response.status}` };
  }
  const json = (await response.json()) as GoogleDirectionsResponse;
  return parseDirectionsResponse(json);
}
