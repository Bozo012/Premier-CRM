// Google-specific but requires no API key at all — Google Maps' universal
// web search URL scheme (https://developers.google.com/maps/documentation/urls/get-started),
// which works cross-platform (desktop browser, iOS, Android) without any
// platform-specific deep-link scheme. Fully live-verifiable regardless of
// whether GOOGLE_MAPS_API_KEY is configured (Phase 12).
//
// PRIVACY (Phase 15): callers must only ever pass the minimum destination
// address/coordinates. Never pass gate codes, access notes, or any other
// internal field into the query string.
import type { LatLng } from '../types';

export interface MapsDestination {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Preferred over the address string when a real geocode already succeeded. */
  coordinates?: LatLng | null;
}

function formatAddress(destination: MapsDestination): string | null {
  const parts = [destination.addressLine1, destination.addressLine2, destination.city, destination.state, destination.zip].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Builds a real "Open in Maps" external-navigation URL. Returns null only
 * when there is truly no usable destination (no coordinates AND no
 * address line 1) — callers should hide the action in that case rather
 * than link to a broken/empty query.
 */
export function buildOpenInMapsUrl(destination: MapsDestination): string | null {
  const query = destination.coordinates ? `${destination.coordinates.lat},${destination.coordinates.lng}` : formatAddress(destination);
  if (!query) return null;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}
