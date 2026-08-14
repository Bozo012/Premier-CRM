'use server';

// Calculate Route — the previously-missing V1 UI trigger for the Directions
// adapter (now the Routes API Compute Routes adapter, see ./_lib/map-provider/
// google/compute-routes.ts). No DB read/write of any kind: this action
// authenticates the caller, confirms they belong to an active org (the same
// bar as viewing /routes at all — no additional capability is introduced),
// and forwards the already-displayed, already-server-ordered stop
// coordinates straight to Google. The scheduled-time order computed in
// page.tsx (orderStopsByScheduledTime) remains the sole source of stop
// order — this action never reorders anything itself.
import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { getActiveOrgContext } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

import { computeRoute } from './_lib/map-provider/google/compute-routes';
import type { DirectionsOutcome, LatLng } from './_lib/map-provider/types';

export interface CalculateRouteInput {
  /** Ordered stop coordinates exactly as currently rendered (scheduled-time
   * order, already filtered by crew) — origin first, destination last. */
  stops: LatLng[];
}

function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lat === 'number' &&
    typeof candidate.lng === 'number' &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    candidate.lng >= -180 &&
    candidate.lng <= 180
  );
}

export async function calculateRouteAction(input: CalculateRouteInput): Promise<Result<DirectionsOutcome>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return err(ErrorCode.VALIDATION_ERROR, 'Google Maps is not configured for this environment.');
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'Authentication required.');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(ErrorCode.FORBIDDEN, 'No active organization for this account.');
  }

  const stops = input.stops;
  if (!Array.isArray(stops) || stops.length < 2 || !stops.every(isValidLatLng)) {
    return err(ErrorCode.VALIDATION_ERROR, 'At least two geocoded stops are required to calculate a route.');
  }

  const origin = stops[0] as LatLng;
  const destination = stops[stops.length - 1] as LatLng;
  const waypoints = stops.slice(1, -1);

  const outcome = await computeRoute(apiKey, { origin, destination, waypoints });
  return ok(outcome);
}
