// Google-specific but requires no API key at all — Google Maps' universal
// web search URL scheme. Re-exports the shared app-wide implementation
// (apps/web/lib/maps/external-maps-url.ts) so Property/Job/Site Visit
// detail pages' "View on map"/"View location" link-outs (Phase 14) can use
// the exact same, key-free builder without importing anything else from
// this routes-domain map-provider boundary. Kept as its own file here (not
// just imported directly) for discoverability alongside geocode.ts/
// directions.ts — this is still the file route-planning code imports from.
export { buildOpenInMapsUrl, type LatLng, type MapsDestination } from '@/lib/maps/external-maps-url';
