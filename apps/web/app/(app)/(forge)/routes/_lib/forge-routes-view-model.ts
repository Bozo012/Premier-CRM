// Layer 2 adapter — maps real jobs (packages/db/queries/route-planning.ts:
// listRouteJobsForDate/listUnscheduledRouteJobs) and real site visits
// (listRouteSiteVisitsForDate/listUnscheduledRouteSiteVisits) plus real crew
// data (job_assignments for jobs, site_visit_appointments.assigned_user_id
// for site visits — two genuinely different models, not merged) into the
// route-planning presentation's provider-agnostic stop/marker shape.
//
// Pure functions only — no Supabase/Google/fetch imports. Coordinates are
// only ever attached when a real geocode already succeeded (passed in via
// `geocodeByAddressKey`); nothing here invents a coordinate.
import type { RouteJobRow, RouteSiteVisitRow } from '@premier/db';

import type { LatLng, MapMarker } from './map-provider/types';

export type LocationStatus = 'geocoded' | 'unavailable' | 'missing-address';

export interface RouteStopModel {
  id: string;
  kind: 'job' | 'site-visit';
  title: string;
  statusLabel: string;
  priorityLabel: string;
  isPriority: boolean;
  scheduledStart: string | null;
  scheduledTimeLabel: string;
  customerName: string;
  addressLabel: string | null;
  addressKey: string | null;
  locationStatus: LocationStatus;
  position: LatLng | null;
  crewNames: string[];
  leadTechnicianName: string | null;
  crewUserIds: string[];
  detailHref: string;
  order: number;
}

export type CrewFilter = { type: 'all' } | { type: 'user'; userId: string } | { type: 'lead' } | { type: 'unassigned' };

export interface CrewFilterOption {
  id: string;
  label: string;
}

export interface RouteSummary {
  scheduledCount: number;
  jobCount: number;
  siteVisitCount: number;
  unassignedCount: number;
  missingLocationCount: number;
  unscheduledCount: number;
}

const HIGH_PRIORITY_JOB = new Set(['high', 'emergency']);
const HIGH_PRIORITY_REQUEST = new Set(['high', 'emergency']);

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => (part[0] ?? '').toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatAddressLine(address: { line1: string | null; line2: string | null; city: string | null; state: string | null; zip: string | null } | null): string | null {
  if (!address) return null;
  const parts = [address.line1, address.line2, address.city, address.state, address.zip].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

function formatTime(value: string | null): string {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function locationStatusFor(addressKey: string | null, geocodeByAddressKey: Map<string, LatLng>): { status: LocationStatus; position: LatLng | null } {
  if (!addressKey) return { status: 'missing-address', position: null };
  const position = geocodeByAddressKey.get(addressKey);
  return position ? { status: 'geocoded', position } : { status: 'unavailable', position: null };
}

export function buildJobStop(
  job: RouteJobRow,
  crew: Array<{ userId: string; displayName: string; isLead: boolean }>,
  geocodeByAddressKey: Map<string, LatLng>
): RouteStopModel {
  const addressKey = formatAddressLine(job.address);
  const { status, position } = locationStatusFor(addressKey, geocodeByAddressKey);
  const lead = crew.find((member) => member.isLead) ?? null;

  return {
    id: job.id,
    kind: 'job',
    title: job.title,
    statusLabel: formatEnumLabel(job.status),
    priorityLabel: formatEnumLabel(job.priority),
    isPriority: HIGH_PRIORITY_JOB.has(job.priority),
    scheduledStart: job.scheduledStart,
    scheduledTimeLabel: formatTime(job.scheduledStart),
    customerName: job.customerName ?? 'Unknown customer',
    addressLabel: addressKey,
    addressKey,
    locationStatus: status,
    position,
    crewNames: crew.map((member) => member.displayName),
    leadTechnicianName: lead?.displayName ?? null,
    crewUserIds: crew.map((member) => member.userId),
    detailHref: `/jobs/${job.id}`,
    order: 0,
  };
}

export function buildSiteVisitStop(
  visit: RouteSiteVisitRow,
  assignedName: string | null,
  geocodeByAddressKey: Map<string, LatLng>
): RouteStopModel {
  const addressKey = formatAddressLine(visit.address);
  const { status, position } = locationStatusFor(addressKey, geocodeByAddressKey);

  return {
    id: visit.id,
    kind: 'site-visit',
    title: visit.title,
    statusLabel: formatEnumLabel(visit.status),
    priorityLabel: visit.priority ? formatEnumLabel(visit.priority) : 'Normal',
    isPriority: visit.priority ? HIGH_PRIORITY_REQUEST.has(visit.priority) : false,
    scheduledStart: visit.scheduledStart,
    scheduledTimeLabel: formatTime(visit.scheduledStart),
    customerName: visit.customerName ?? 'Unknown customer',
    addressLabel: addressKey,
    addressKey,
    locationStatus: status,
    position,
    crewNames: assignedName ? [assignedName] : [],
    leadTechnicianName: assignedName,
    crewUserIds: visit.assignedUserId ? [visit.assignedUserId] : [],
    detailHref: `/site-visits/${visit.id}`,
    order: 0,
  };
}

/** Scheduled-time order only (Phase 7/8) — no route_stop_order column exists
 * anywhere in the schema; ties break on id for full determinism. */
export function orderStopsByScheduledTime(stops: RouteStopModel[]): RouteStopModel[] {
  const sorted = [...stops].sort((a, b) => {
    const aTime = a.scheduledStart ?? '';
    const bTime = b.scheduledStart ?? '';
    if (aTime !== bTime) return aTime.localeCompare(bTime);
    return a.id.localeCompare(b.id);
  });
  return sorted.map((stop, index) => ({ ...stop, order: index + 1 }));
}

export function matchesCrewFilter(stop: RouteStopModel, filter: CrewFilter): boolean {
  switch (filter.type) {
    case 'all':
      return true;
    case 'unassigned':
      return stop.crewUserIds.length === 0;
    case 'lead':
      return stop.leadTechnicianName !== null;
    case 'user':
      return stop.crewUserIds.includes(filter.userId);
    default:
      return true;
  }
}

export function filterStopsByCrew(stops: RouteStopModel[], filter: CrewFilter): RouteStopModel[] {
  return stops.filter((stop) => matchesCrewFilter(stop, filter));
}

export function buildCrewFilterOptions(members: Array<{ userId: string; displayName: string }>): CrewFilterOption[] {
  return [
    { id: 'all', label: 'All crew' },
    { id: 'lead', label: 'Has lead technician' },
    { id: 'unassigned', label: 'Unassigned' },
    ...members.map((member) => ({ id: `user:${member.userId}`, label: member.displayName })),
  ];
}

export function parseCrewFilterId(value: string): CrewFilter {
  if (value === 'all' || !value) return { type: 'all' };
  if (value === 'lead') return { type: 'lead' };
  if (value === 'unassigned') return { type: 'unassigned' };
  if (value.startsWith('user:')) return { type: 'user', userId: value.slice('user:'.length) };
  return { type: 'all' };
}

export function buildMarkers(stops: RouteStopModel[]): MapMarker[] {
  return stops
    .filter((stop) => stop.position !== null)
    .map((stop) => ({
      id: stop.id,
      kind: stop.kind,
      position: stop.position as LatLng,
      isPriority: stop.isPriority,
      label: `${stop.order}. ${stop.title}`,
    }));
}

export function buildRouteSummary(scheduledStops: RouteStopModel[], unscheduledStops: RouteStopModel[]): RouteSummary {
  return {
    scheduledCount: scheduledStops.length,
    jobCount: scheduledStops.filter((s) => s.kind === 'job').length,
    siteVisitCount: scheduledStops.filter((s) => s.kind === 'site-visit').length,
    unassignedCount: scheduledStops.filter((s) => s.crewUserIds.length === 0).length,
    missingLocationCount: scheduledStops.filter((s) => s.locationStatus !== 'geocoded').length,
    unscheduledCount: unscheduledStops.length,
  };
}

/** Distinct, non-null address strings across a set of stops — the exact
 * set the server should geocode (deduped so two stops at the same address
 * only cost one Geocoding API call). */
export function collectAddressKeysToGeocode(stops: RouteStopModel[]): string[] {
  return Array.from(new Set(stops.map((stop) => stop.addressKey).filter((key): key is string => Boolean(key))));
}
