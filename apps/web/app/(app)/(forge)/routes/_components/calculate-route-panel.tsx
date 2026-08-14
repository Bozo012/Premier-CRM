'use client'; // Calls the calculateRouteAction server action and holds the
// resulting DirectionsOutcome in local state — no server round-trip happens
// without an explicit click, and nothing here persists anything.
import { useTransition } from 'react';
import { Navigation, TriangleAlert } from 'lucide-react';

import type { CalculateRouteInput } from '../actions';
import { calculateRouteAction } from '../actions';
import type { DirectionsOutcome, LatLng } from '../_lib/map-provider/types';

export interface CalculateRoutePanelProps {
  /** Ordered, already-geocoded stop coordinates (scheduled-time order,
   * current crew filter applied) — exactly what's rendered on the map. */
  orderedStops: LatLng[];
  mapsConfigured: boolean;
  result: DirectionsOutcome | null;
  onResult: (outcome: DirectionsOutcome | null) => void;
}

function formatDistance(meters: number): string {
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} hr ${remaining} min`;
}

export function CalculateRoutePanel({ orderedStops, mapsConfigured, result, onResult }: CalculateRoutePanelProps) {
  const [isPending, startTransition] = useTransition();

  if (!mapsConfigured) return null;

  const eligible = orderedStops.length >= 2;

  function handleCalculate() {
    onResult(null);
    startTransition(async () => {
      const input: CalculateRouteInput = { stops: orderedStops };
      const actionResult = await calculateRouteAction(input);
      if (!actionResult.success) {
        onResult({ status: 'error', legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, overviewPolyline: null, errorMessage: actionResult.error });
        return;
      }
      onResult(actionResult.data);
    });
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Calculate route</p>
          <p className="text-xs text-muted-foreground">
            {eligible
              ? `Uses the current scheduled order — ${orderedStops.length} geocoded stop${orderedStops.length === 1 ? '' : 's'}.`
              : 'At least two geocoded stops are needed to calculate a route.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCalculate}
          disabled={!eligible || isPending}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Navigation className="h-4 w-4" aria-hidden="true" />
          {isPending ? 'Calculating…' : 'Calculate route'}
        </button>
      </div>

      {result?.status === 'ok' ? (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
          <div>
            <div className="text-lg font-bold text-foreground">{formatDistance(result.totalDistanceMeters)}</div>
            <div className="text-[11px] text-muted-foreground">Total distance</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{formatDuration(result.totalDurationSeconds)}</div>
            <div className="text-[11px] text-muted-foreground">Estimated travel time</div>
          </div>
        </div>
      ) : null}

      {result?.status === 'error' ? (
        <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {result.errorMessage ?? 'Route calculation failed.'}
        </p>
      ) : null}
    </div>
  );
}
