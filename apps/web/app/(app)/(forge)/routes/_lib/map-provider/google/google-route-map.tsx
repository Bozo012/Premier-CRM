'use client'; // Loads and drives the Google Maps JS SDK directly — the one
// component in the whole slice allowed to know Google's SDK shape. Consumed
// by ../../_components/route-map-panel.tsx, which is the only place outside
// this map-provider/ folder that imports it — the view-model layer never
// does.
import { useEffect, useRef, useState } from 'react';

import type { MapMarker } from '../types';
import { loadGoogleMaps, type GoogleMapInstance, type GoogleMarkerInstance } from './script-loader';

export interface GoogleRouteMapProps {
  apiKey: string;
  markers: MapMarker[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
}

/** Renders the live Google map with one pin per real geocoded marker. Not
 * live-verified in this environment (no API key configured here) — see the
 * report's provisioning checklist. */
export function GoogleRouteMap({ apiKey, markers, selectedId, onSelectMarker }: GoogleRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerInstancesRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
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
    if (!maps || !map) return;

    for (const marker of markerInstancesRef.current.values()) marker.setMap(null);
    markerInstancesRef.current.clear();

    const bounds = new maps.LatLngBounds();
    for (const marker of markers) {
      const instance = new maps.Marker({
        position: marker.position,
        map,
        title: marker.label,
        icon: marker.isPriority ? { url: 'https://maps.google.com/mapfiles/ms/icons/red-pushpin.png' } : undefined,
      });
      instance.addListener('click', () => onSelectMarker(marker.id));
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

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Map failed to load: {loadError}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[320px] w-full rounded-2xl" role="application" aria-label="Route map" />;
}
