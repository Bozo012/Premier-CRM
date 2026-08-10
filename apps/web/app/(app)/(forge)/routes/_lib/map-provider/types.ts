// Map-provider boundary — provider-agnostic types. The Forge route-planning
// domain/view-model layer (../forge-routes-view-model.ts) only ever produces
// and consumes these shapes; nothing here mentions Google, an SDK, or an
// API key. Everything Google-specific lives under ./google/ and is only
// imported by the thin adapter components/functions in this folder — never
// by the view-model.

export interface LatLng {
  lat: number;
  lng: number;
}

/** A single point the map should render. Only ever produced when a real
 * geocode succeeded (or a coordinate was already known) — never fabricated. */
export interface MapMarker {
  id: string;
  kind: 'job' | 'site-visit';
  position: LatLng;
  isPriority: boolean;
  label: string;
}

export type GeocodeStatus = 'ok' | 'not-found' | 'error';

export interface GeocodeOutcome {
  status: GeocodeStatus;
  position: LatLng | null;
  formattedAddress: string | null;
  errorMessage: string | null;
}

export interface DirectionsLeg {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
}

export interface DirectionsOutcome {
  status: 'ok' | 'error';
  legs: DirectionsLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  /** Encoded overview polyline straight from the provider response — never
   * computed client-side, only ever the real polyline the API returned. */
  overviewPolyline: string | null;
  errorMessage: string | null;
}
