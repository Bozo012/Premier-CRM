'use client'; // Loads and drives the Google Maps JS SDK directly — the one
// component in the whole slice allowed to know Google's SDK shape. Consumed
// by ../../_components/route-map-panel.tsx, which is the only place outside
// this map-provider/ folder that imports it — the view-model layer never
// does.
import { useEffect, useRef, useState } from 'react';

import type { MapMarker } from '../types';
import { loadGoogleMaps, type GoogleAdvancedMarkerInstance, type GoogleMapInstance, type GooglePolylineInstance } from './script-loader';

export interface GoogleRouteMapProps {
  apiKey: string;
  markers: MapMarker[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  /** Real encoded overview polyline from a completed Compute Routes call —
   * never a client-computed straight line. Optional: routes are calculated
   * on demand, not automatically, so this is null until "Calculate route"
   * succeeds. */
  overviewPolyline?: string | null;
}

/** Renders the live Google map with one pin per real geocoded marker, and
 * (once a route has been calculated) the real polyline geometry Google
 * returned. */
export function GoogleRouteMap({ apiKey, markers, selectedId, onSelectMarker, overviewPolyline = null }: GoogleRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerInstancesRef = useRef<Map<string, GoogleAdvancedMarkerInstance>>(new Map());
  const polylineInstanceRef = useRef<GooglePolylineInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 39.8283, lng: -98.5795 }, // Continental-US fallback center until markers arrive
          zoom: 4,
          disableDefaultUI: false,
          // AdvancedMarkerElement renders nothing without a Map ID — this is
          // a hard requirement, not an optional styling hook. 'DEMO_MAP_ID'
          // is Google's own documented placeholder for exactly this
          // (preview/demo/development use, no billing-console Map ID setup
          // required) — see the Advanced Markers migration guide. Not a
          // production custom map style; a real production Map ID (still
          // free to create, just requires one-time Cloud Console setup) is
          // a follow-up, not part of this fix.
          mapId: 'DEMO_MAP_ID',
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const maps = typeof window !== 'undefined' ? window.google?.maps : undefined;
    const map = mapRef.current;
    if (!maps?.marker || !map) return;

    for (const marker of markerInstancesRef.current.values()) marker.map = null;
    markerInstancesRef.current.clear();

    const bounds = new maps.LatLngBounds();
    for (const marker of markers) {
      // Priority distinction via PinElement (shape/glyph/scale), never
      // color alone — matches the prior red-pushpin-vs-default-balloon
      // distinction's intent, expressed in the current Advanced Markers API.
      const content = marker.isPriority
        ? new maps.marker.PinElement({
            background: '#dc2626',
            borderColor: '#7f1d1d',
            glyphColor: '#ffffff',
            glyphText: '!',
            scale: 1.2,
          }).element
        : undefined;

      const instance = new maps.marker.AdvancedMarkerElement({
        position: marker.position,
        map,
        title: marker.label,
        gmpClickable: true,
        ...(content ? { content } : {}),
      });
      instance.addEventListener('gmp-click', () => onSelectMarker(marker.id));
      markerInstancesRef.current.set(marker.id, instance);
      bounds.extend(marker.position);
    }

    if (markers.length > 0) map.fitBounds(bounds);
  }, [markers, onSelectMarker]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markers.find((m) => m.id === selectedId);
    const map = mapRef.current;
    if (marker && map) {
      map.setCenter(marker.position);
    }
  }, [selectedId, markers]);

  useEffect(() => {
    const maps = typeof window !== 'undefined' ? window.google?.maps : undefined;
    const map = mapRef.current;

    polylineInstanceRef.current?.setMap(null);
    polylineInstanceRef.current = null;

    if (!maps || !map || !overviewPolyline || !maps.geometry) return;

    const path = maps.geometry.encoding.decodePath(overviewPolyline);
    polylineInstanceRef.current = new maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map,
    });
  }, [overviewPolyline]);

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Map failed to load: {loadError}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[320px] w-full rounded-2xl" role="application" aria-label="Route map" />;
}
