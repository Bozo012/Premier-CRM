import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import {
  getActiveOrgContext,
  listActiveTeamMembers,
  listJobAssignmentsForJobs,
  listRouteJobsForDate,
  listRouteSiteVisitsForDate,
  listUnscheduledRouteJobs,
  listUnscheduledRouteSiteVisits,
} from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import {
  buildCrewFilterOptions,
  buildJobStop,
  buildMarkers,
  buildRouteSummary,
  buildSiteVisitStop,
  collectAddressKeysToGeocode,
  filterStopsByCrew,
  orderStopsByScheduledTime,
  parseCrewFilterId,
  type RouteStopModel,
} from './_lib/forge-routes-view-model';
import { geocodeAddress } from './_lib/map-provider/google/geocode';
import { buildOpenInMapsUrl } from './_lib/map-provider/google/external-maps-url';
import type { LatLng } from './_lib/map-provider/types';

// ── LAYER 3: presentation ───────────────────────────────────────────────────
import { RoutesShell } from './_components/routes-shell';
import { RoutePlanningContainer } from './_components/route-planning-container';
import type { RouteStopDisplayModel } from './_components/route-list';

export const metadata: Metadata = { title: 'Route Planning' };

interface RoutesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function readDateParam(value: string | string[] | undefined): Date {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Ephemeral, non-persisted geocoding of the day's distinct addresses —
 * only ever called when GOOGLE_MAPS_API_KEY (server-only) is configured.
 * Never geocodes when the key is absent; never persists results to
 * properties.location/geocoded_at (that remains a documented future
 * opportunity, not wired up in this slice). Failures degrade individual
 * stops to "Location unavailable" rather than breaking the page.
 */
async function geocodeAddressKeys(addressKeys: string[]): Promise<Map<string, LatLng>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const result = new Map<string, LatLng>();
  if (!apiKey || addressKeys.length === 0) return result;

  const outcomes = await Promise.allSettled(addressKeys.map((address) => geocodeAddress(apiKey, address)));
  outcomes.forEach((outcome, index) => {
    const addressKey = addressKeys[index];
    if (!addressKey) return;
    if (outcome.status === 'fulfilled' && outcome.value.status === 'ok' && outcome.value.position) {
      result.set(addressKey, outcome.value.position);
      return;
    }
    // Diagnostic only — never logs the API key, only Google's own returned
    // error text (already safe to log; it's provider-side response
    // content, not a secret) so a real geocoding failure is debuggable via
    // Vercel function logs instead of silently collapsing into "Location
    // unavailable" with no trace of *why*.
    if (outcome.status === 'fulfilled' && outcome.value.status === 'error') {
      console.error(`[routes] Geocoding failed: ${outcome.value.errorMessage ?? 'unknown error'}`);
    } else if (outcome.status === 'rejected') {
      console.error(`[routes] Geocoding request threw unexpectedly: ${String(outcome.reason)}`);
    }
  });
  return result;
}

function toDisplayStop(stop: RouteStopModel): RouteStopDisplayModel {
  // Prefers a real geocoded coordinate; otherwise falls back to the full
  // formatted address string as the query — either way this needs no API
  // key at all (Phase 12).
  const mapsUrl = buildOpenInMapsUrl({
    addressLine1: stop.position ? null : stop.addressLabel,
    addressLine2: null,
    city: null,
    state: null,
    zip: null,
    coordinates: stop.position,
  });
  return { ...stop, mapsUrl };
}

export default async function RoutesPage({ searchParams }: RoutesPageProps) {
  const params = await searchParams;
  const referenceDate = readDateParam(params.date);
  const dayStart = referenceDate;
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const crewFilterId = readStringParam(params.crew) ?? 'all';
  const crewFilter = parseCrewFilterId(crewFilterId);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/routes');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const { orgId } = orgContextResult.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const [jobsResult, siteVisitsResult, unscheduledJobsResult, unscheduledVisitsResult, teamResult] = await Promise.all([
    listRouteJobsForDate(supabase, { orgId, dayStart, dayEnd }),
    listRouteSiteVisitsForDate(supabase, { orgId, dayStart, dayEnd }),
    listUnscheduledRouteJobs(supabase, { orgId }),
    listUnscheduledRouteSiteVisits(supabase, { orgId }),
    listActiveTeamMembers(supabase, { orgId }),
  ]);

  const errors = [jobsResult, siteVisitsResult, unscheduledJobsResult, unscheduledVisitsResult]
    .filter((result) => !result.success)
    .map((result) => (result.success ? '' : result.error));
  const errorMessage = errors.length > 0 ? `Some route data could not be loaded: ${errors.join('; ')}` : null;

  const jobs = jobsResult.success ? jobsResult.data : [];
  const siteVisits = siteVisitsResult.success ? siteVisitsResult.data : [];
  const unscheduledJobs = unscheduledJobsResult.success ? unscheduledJobsResult.data : [];
  const unscheduledVisits = unscheduledVisitsResult.success ? unscheduledVisitsResult.data : [];
  const teamMembers = teamResult.success ? teamResult.data : [];

  // Real per-job crew roster — job_assignments, all crew (not just lead).
  const allJobIds = [...jobs.map((j) => j.id), ...unscheduledJobs.map((j) => j.id)];
  const crewResult = await listJobAssignmentsForJobs(supabase, { orgId, jobIds: allJobIds });
  const crewByJobId = new Map<string, Array<{ userId: string; displayName: string; isLead: boolean }>>();
  if (crewResult.success) {
    for (const row of crewResult.data) {
      const list = crewByJobId.get(row.jobId) ?? [];
      list.push({ userId: row.userId, displayName: row.displayName, isLead: row.isLead });
      crewByJobId.set(row.jobId, list);
    }
  }

  // Real assigned-technician names for site visits — assigned_user_id, a
  // separate, single-person model (documented mismatch vs. job_assignments).
  const assignedUserIds = [...new Set([...siteVisits, ...unscheduledVisits].map((v) => v.assignedUserId).filter((id): id is string => Boolean(id)))];
  const nameByUserId = new Map<string, string>();
  if (assignedUserIds.length > 0) {
    const { data: assignedProfiles } = await supabase.from('user_profiles').select('id, full_name').in('id', assignedUserIds);
    for (const row of assignedProfiles ?? []) {
      nameByUserId.set(row.id, row.full_name ?? 'Unknown');
    }
  }

  // Geocode the day's distinct addresses (scheduled work only — unscheduled
  // work has no map relevance) — ephemeral, only when a server key exists.
  const preGeocodeStops: RouteStopModel[] = [
    ...jobs.map((job) => buildJobStop(job, crewByJobId.get(job.id) ?? [], new Map())),
    ...siteVisits.map((visit) => buildSiteVisitStop(visit, visit.assignedUserId ? (nameByUserId.get(visit.assignedUserId) ?? null) : null, new Map())),
  ];
  const geocodeByAddressKey = await geocodeAddressKeys(collectAddressKeysToGeocode(preGeocodeStops));

  const jobStops = jobs.map((job) => buildJobStop(job, crewByJobId.get(job.id) ?? [], geocodeByAddressKey));
  const siteVisitStops = siteVisits.map((visit) => buildSiteVisitStop(visit, visit.assignedUserId ? (nameByUserId.get(visit.assignedUserId) ?? null) : null, geocodeByAddressKey));
  const scheduledStops = orderStopsByScheduledTime([...jobStops, ...siteVisitStops]);

  const unscheduledJobStops = unscheduledJobs.map((job) => buildJobStop(job, crewByJobId.get(job.id) ?? [], new Map()));
  const unscheduledVisitStops = unscheduledVisits.map((visit) => buildSiteVisitStop(visit, visit.assignedUserId ? (nameByUserId.get(visit.assignedUserId) ?? null) : null, new Map()));
  const unscheduledStops = [...unscheduledJobStops, ...unscheduledVisitStops];

  const summary = buildRouteSummary(scheduledStops, unscheduledStops);

  const filteredScheduled = filterStopsByCrew(scheduledStops, crewFilter);
  const filteredUnscheduled = filterStopsByCrew(unscheduledStops, crewFilter);

  const crewOptions = buildCrewFilterOptions(teamMembers.map((member) => ({ userId: member.userId, displayName: member.displayName })));
  const markers = buildMarkers(filteredScheduled);

  const dateValue = toDateKey(dayStart);
  const isToday = dateValue === toDateKey(new Date());
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dayStart);

  return (
    <RoutesShell shellData={shellData} mobileNav={mobileNav}>
      <RoutePlanningContainer
        dateValue={dateValue}
        dateLabel={dateLabel}
        isToday={isToday}
        crewOptions={crewOptions}
        activeCrewFilterId={crewFilterId}
        summary={summary}
        scheduledStops={filteredScheduled.map(toDisplayStop)}
        unscheduledStops={filteredUnscheduled.map(toDisplayStop)}
        markers={markers}
        mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
        errorMessage={errorMessage}
      />
    </RoutesShell>
  );
}
