'use client'; // URL-param-driven date/crew filters (real re-query via
// page.tsx, matching jobs-list-container.tsx's pattern) plus local
// map<->list selection-sync and mobile Route/Map tab state.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { CrewFilterOption, RouteSummary } from '../_lib/forge-routes-view-model';
import type { MapMarker } from '../_lib/map-provider/types';
import { RouteMapPanel } from './route-map-panel';
import type { RouteStopDisplayModel } from './route-list';
import { RoutePlanningView, type RoutePlanningViewCallbacks } from './route-planning-view';

export function RoutePlanningContainer({
  dateValue,
  dateLabel,
  isToday,
  crewOptions,
  activeCrewFilterId,
  summary,
  scheduledStops,
  unscheduledStops,
  markers,
  mapsApiKey,
  errorMessage,
}: {
  dateValue: string;
  dateLabel: string;
  isToday: boolean;
  crewOptions: CrewFilterOption[];
  activeCrewFilterId: string;
  summary: RouteSummary;
  scheduledStops: RouteStopDisplayModel[];
  unscheduledStops: RouteStopDisplayModel[];
  markers: MapMarker[];
  mapsApiKey: string | null;
  errorMessage: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'route' | 'map'>('route');

  const callbacks: RoutePlanningViewCallbacks = useMemo(
    () => ({
      onDateChange: (value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set('date', value);
        else params.delete('date');
        router.replace(`/routes?${params.toString()}`);
      },
      onToday: () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('date');
        router.replace(`/routes?${params.toString()}`);
      },
      onCrewFilterChange: (value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'all') params.delete('crew');
        else params.set('crew', value);
        router.replace(`/routes?${params.toString()}`);
      },
      onSelectStop: (id) => setSelectedId(id),
      onMobileTabChange: (tab) => setMobileTab(tab),
    }),
    [router, searchParams]
  );

  return (
    <RoutePlanningView
      dateValue={dateValue}
      dateLabel={dateLabel}
      isToday={isToday}
      crewOptions={crewOptions}
      activeCrewFilterId={activeCrewFilterId}
      summary={summary}
      scheduledStops={scheduledStops}
      unscheduledStops={unscheduledStops}
      selectedId={selectedId}
      mobileTab={mobileTab}
      errorMessage={errorMessage}
      mapSlot={<RouteMapPanel apiKey={mapsApiKey} markers={markers} selectedId={selectedId} onSelectMarker={setSelectedId} />}
      callbacks={callbacks}
    />
  );
}
