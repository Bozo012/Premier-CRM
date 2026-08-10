'use client'; // Dynamically imports the Google-specific map client (ssr:false —
// the Maps JS SDK is a browser-only global) and decides, based on whether a
// browser key was configured, whether to render a live map or the honest
// "Maps not configured" fallback (Phase 10). This is the one file outside
// _lib/map-provider/ that imports Google-specific code — the presentational
// RoutePlanningView and the domain view-model never do.
import dynamic from 'next/dynamic';
import { MapPinOff } from 'lucide-react';

import type { MapMarker } from '../_lib/map-provider/types';

const GoogleRouteMap = dynamic(
  () => import('../_lib/map-provider/google/google-route-map').then((mod) => mod.GoogleRouteMap),
  { ssr: false, loading: () => <MapLoadingState /> }
);

function MapLoadingState() {
  return <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground">Loading map…</div>;
}

export function MapsNotConfigured({ markerEligibleCount }: { markerEligibleCount: number }) {
  return (
    <div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center">
      <MapPinOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Maps not configured</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Set <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to show a live map with{' '}
        {markerEligibleCount} geocoded stop{markerEligibleCount === 1 ? '' : 's'}. The route list, date and crew filters, and every
        &quot;Open in Maps&quot; link below already work without it.
      </p>
    </div>
  );
}

export function RouteMapPanel({
  apiKey,
  markers,
  selectedId,
  onSelectMarker,
}: {
  apiKey: string | null;
  markers: MapMarker[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
}) {
  if (!apiKey) {
    return <MapsNotConfigured markerEligibleCount={markers.length} />;
  }
  return <GoogleRouteMap apiKey={apiKey} markers={markers} selectedId={selectedId} onSelectMarker={onSelectMarker} />;
}
