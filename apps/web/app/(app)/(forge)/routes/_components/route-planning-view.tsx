// Presentation component — mobile-first Route Planning workspace. Desktop:
// map (left/main) + side panel (right). Mobile: segmented Route/Map toggle
// rather than a squeezed desktop layout. Props-driven only; the map itself
// is injected as `mapSlot` so this file never imports any provider-specific
// code (see ../_components/route-map-panel.tsx and ../_lib/map-provider/).
import type { ReactNode } from 'react';
import { CalendarDays, MapPin, Users } from 'lucide-react';

import type { RouteSummary } from '../_lib/forge-routes-view-model';
import type { CrewFilterOption } from '../_lib/forge-routes-view-model';
import { RouteList, type RouteStopDisplayModel } from './route-list';

export interface RoutePlanningViewCallbacks {
  onDateChange: (value: string) => void;
  onToday: () => void;
  onCrewFilterChange: (value: string) => void;
  onSelectStop: (id: string) => void;
  onMobileTabChange: (tab: 'route' | 'map') => void;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function RoutePlanningView({
  dateValue,
  dateLabel,
  isToday,
  crewOptions,
  activeCrewFilterId,
  summary,
  scheduledStops,
  unscheduledStops,
  selectedId,
  mobileTab,
  mapSlot,
  errorMessage,
  callbacks,
}: {
  dateValue: string;
  dateLabel: string;
  isToday: boolean;
  crewOptions: CrewFilterOption[];
  activeCrewFilterId: string;
  summary: RouteSummary;
  scheduledStops: RouteStopDisplayModel[];
  unscheduledStops: RouteStopDisplayModel[];
  selectedId: string | null;
  mobileTab: 'route' | 'map';
  mapSlot: ReactNode;
  errorMessage: string | null;
  callbacks: RoutePlanningViewCallbacks;
}) {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Route Planning</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dateLabel} — scheduled jobs and site visits by location.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="route-date">
            Date
          </label>
          <span className="relative inline-flex items-center">
            <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="route-date"
              type="date"
              value={dateValue}
              onChange={(e) => callbacks.onDateChange(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-sm font-medium text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </span>
          {!isToday ? (
            <button
              type="button"
              onClick={callbacks.onToday}
              className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Today
            </button>
          ) : null}
          <span className="relative inline-flex items-center">
            <Users className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <select
              aria-label="Filter by crew"
              value={activeCrewFilterId}
              onChange={(e) => callbacks.onCrewFilterChange(e.target.value)}
              className="min-h-11 rounded-xl border border-input bg-card py-2 pl-9 pr-8 text-sm font-medium text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {crewOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{errorMessage}</p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryTile label="Scheduled stops" value={summary.scheduledCount} />
        <SummaryTile label="Jobs" value={summary.jobCount} />
        <SummaryTile label="Site visits" value={summary.siteVisitCount} />
        <SummaryTile label="Unassigned" value={summary.unassignedCount} />
        <SummaryTile label="Missing location" value={summary.missingLocationCount} />
      </div>

      {/* Mobile: segmented Route/Map toggle, not a squeezed desktop layout. */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-card p-1 md:hidden" role="tablist" aria-label="Route view">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'route'}
          onClick={() => callbacks.onMobileTabChange('route')}
          className={`min-h-9 flex-1 rounded-lg text-sm font-semibold ${mobileTab === 'route' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          Route
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'map'}
          onClick={() => callbacks.onMobileTabChange('map')}
          className={`min-h-9 flex-1 rounded-lg text-sm font-semibold ${mobileTab === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          Map
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_380px]">
        <div className={`h-[420px] md:h-[640px] ${mobileTab === 'map' ? 'block' : 'hidden'} md:block`}>{mapSlot}</div>
        <div className={`${mobileTab === 'route' ? 'block' : 'hidden'} md:block`}>
          <RouteList stops={scheduledStops} unscheduledStops={unscheduledStops} selectedId={selectedId} onSelectStop={callbacks.onSelectStop} />
        </div>
      </div>
    </main>
  );
}
