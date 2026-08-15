// Google-specific — loads the Maps JavaScript API via Google's own
// recommended <script> tag pattern rather than a bundled SDK dependency (no
// @googlemaps/js-api-loader package is added; this keeps the provider
// boundary to a handful of files with zero new runtime dependencies).
// Client-only; uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, the intentionally
// browser-visible key (Maps JS API requires this by Google's own design —
// see the report's provisioning checklist for the restricted-key model).
'use client';

/**
 * Minimal ambient surface of the `google.maps` namespace this adapter uses.
 * No `@types/google.maps` package is installed (this feature is not
 * live-verifiable in this environment), so only the handful of members
 * actually called are declared here rather than pulling in the full types.
 */
export interface GoogleMapsNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
  InfoWindow: new (options: Record<string, unknown>) => { open: (map: GoogleMapInstance, marker: unknown) => void; close: () => void };
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  geometry?: { encoding: { decodePath: (encoded: string) => Array<{ lat: () => number; lng: () => number }> } };
  marker?: {
    AdvancedMarkerElement: new (options: GoogleAdvancedMarkerOptions) => GoogleAdvancedMarkerInstance;
    PinElement: new (options: GooglePinElementOptions) => { element: HTMLElement };
  };
}

export interface GoogleMapInstance {
  fitBounds: (bounds: unknown) => void;
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

/** google.maps.marker.AdvancedMarkerElement — replaces the deprecated
 * google.maps.Marker. Requires a `mapId` on the Map itself (see
 * google-route-map.tsx); has no effect without one. */
export interface GoogleAdvancedMarkerOptions {
  map: GoogleMapInstance;
  position: { lat: number; lng: number };
  title?: string;
  content?: HTMLElement;
  gmpClickable?: boolean;
  zIndex?: number;
}

export interface GoogleAdvancedMarkerInstance {
  addEventListener: (event: 'gmp-click', handler: () => void) => void;
  map: GoogleMapInstance | null;
}

/** google.maps.marker.PinElement — used only to give a priority marker a
 * real shape/glyph distinction, never color alone. */
export interface GooglePinElementOptions {
  background?: string;
  borderColor?: string;
  glyphColor?: string;
  glyphText?: string;
  scale?: number;
}

/** Renders the real, provider-returned overview polyline for a calculated
 * route — never a client-computed straight line between stops. */
export interface GooglePolylineInstance {
  setMap: (map: GoogleMapInstance | null) => void;
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
    __forgeGoogleMapsCallback?: () => void;
  }
}

let loaderPromise: Promise<GoogleMapsNamespace> | null = null;

/** Loads the Maps JS API script exactly once per page, resolving with the `google.maps` namespace. */
export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadGoogleMaps can only run in the browser'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    window.__forgeGoogleMapsCallback = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps script loaded but window.google.maps is missing'));
    };
    const script = document.createElement('script');
    // `libraries=geometry,marker` — geometry adds
    // google.maps.geometry.encoding.decodePath() (real Compute Routes
    // polyline rendering); marker adds google.maps.marker.AdvancedMarkerElement
    // and PinElement, replacing the deprecated google.maps.Marker (see
    // google-route-map.tsx). `loading=async` is Google's own current
    // recommendation (without it, the console logs "Google Maps JavaScript
    // API has been loaded directly without loading=async").
    script.src = `https://maps.googleapis.com/maps/api/js?loading=async&key=${encodeURIComponent(apiKey)}&libraries=geometry,marker&callback=__forgeGoogleMapsCallback`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the Google Maps script'));
    document.head.appendChild(script);
  });

  return loaderPromise;
}
