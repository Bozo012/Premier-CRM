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
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
  InfoWindow: new (options: Record<string, unknown>) => { open: (map: GoogleMapInstance, marker: GoogleMarkerInstance) => void; close: () => void };
}

export interface GoogleMapInstance {
  fitBounds: (bounds: unknown) => void;
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

export interface GoogleMarkerInstance {
  addListener: (event: string, handler: () => void) => void;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__forgeGoogleMapsCallback`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the Google Maps script'));
    document.head.appendChild(script);
  });

  return loaderPromise;
}
