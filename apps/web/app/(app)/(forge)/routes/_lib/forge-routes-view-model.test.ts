import { describe, expect, it } from 'vitest';

import type { RouteJobRow, RouteSiteVisitRow } from '@premier/db';

import {
  buildCrewFilterOptions,
  buildJobStop,
  buildMarkers,
  buildRouteSummary,
  buildSiteVisitStop,
  collectAddressKeysToGeocode,
  filterStopsByCrew,
  formatAddressLine,
  orderStopsByScheduledTime,
  parseCrewFilterId,
  type RouteStopModel,
} from './forge-routes-view-model';
import type { LatLng } from './map-provider/types';

function job(overrides: Partial<RouteJobRow> = {}): RouteJobRow {
  return {
    kind: 'job',
    id: 'job-1',
    jobNumber: 'J-100',
    title: 'Fix sprinkler',
    status: 'scheduled',
    priority: 'normal',
    scheduledStart: '2026-08-10T14:00:00.000Z',
    scheduledEnd: '2026-08-10T15:00:00.000Z',
    estimatedDurationMinutes: 60,
    customerId: 'cust-1',
    customerName: 'Jane Doe',
    propertyId: 'prop-1',
    address: { line1: '123 Main St', line2: null, city: 'Austin', state: 'TX', zip: '78701' },
    ...overrides,
  };
}

function siteVisit(overrides: Partial<RouteSiteVisitRow> = {}): RouteSiteVisitRow {
  return {
    kind: 'site-visit',
    id: 'visit-1',
    appointmentId: 'appt-1',
    title: 'Inspection',
    status: 'scheduled',
    priority: 'normal',
    scheduledStart: '2026-08-10T13:00:00.000Z',
    scheduledEnd: '2026-08-10T13:30:00.000Z',
    customerId: 'cust-2',
    customerName: 'John Smith',
    propertyId: null,
    address: { line1: '55 Oak Ave', line2: null, city: 'Austin', state: 'TX', zip: '78702' },
    assignedUserId: 'user-9',
    ...overrides,
  };
}

describe('formatAddressLine', () => {
  it('joins present parts', () => {
    expect(formatAddressLine({ line1: '1 St', line2: null, city: 'Austin', state: 'TX', zip: '78701' })).toBe('1 St, Austin, TX, 78701');
  });
  it('returns null for a fully missing address', () => {
    expect(formatAddressLine(null)).toBeNull();
    expect(formatAddressLine({ line1: null, line2: null, city: null, state: null, zip: null })).toBeNull();
  });
});

describe('buildJobStop', () => {
  it('projects a job with crew into a stop, marking the lead technician', () => {
    const stop = buildJobStop(job(), [{ userId: 'u1', displayName: 'Alex', isLead: true }, { userId: 'u2', displayName: 'Sam', isLead: false }], new Map());
    expect(stop.leadTechnicianName).toBe('Alex');
    expect(stop.crewNames).toEqual(['Alex', 'Sam']);
    expect(stop.kind).toBe('job');
    expect(stop.detailHref).toBe('/jobs/job-1');
  });

  it('marks location unavailable when no geocode is present for the address', () => {
    const stop = buildJobStop(job(), [], new Map());
    expect(stop.locationStatus).toBe('unavailable');
    expect(stop.position).toBeNull();
  });

  it('marks missing-address when the job has no usable address', () => {
    const stop = buildJobStop(job({ address: null }), [], new Map());
    expect(stop.locationStatus).toBe('missing-address');
  });

  it('attaches a real position when a geocode is available for the address key', () => {
    const geocode = new Map<string, LatLng>([['123 Main St, Austin, TX, 78701', { lat: 30.27, lng: -97.74 }]]);
    const stop = buildJobStop(job(), [], geocode);
    expect(stop.locationStatus).toBe('geocoded');
    expect(stop.position).toEqual({ lat: 30.27, lng: -97.74 });
  });

  it('flags emergency/high priority jobs', () => {
    expect(buildJobStop(job({ priority: 'emergency' }), [], new Map()).isPriority).toBe(true);
    expect(buildJobStop(job({ priority: 'normal' }), [], new Map()).isPriority).toBe(false);
  });
});

describe('buildSiteVisitStop', () => {
  it('projects a site visit using assigned_user_id as the sole crew source', () => {
    const stop = buildSiteVisitStop(siteVisit(), 'Taylor Tech', new Map());
    expect(stop.crewNames).toEqual(['Taylor Tech']);
    expect(stop.crewUserIds).toEqual(['user-9']);
    expect(stop.detailHref).toBe('/site-visits/visit-1');
  });

  it('has no crew when assignedUserId is null', () => {
    const stop = buildSiteVisitStop(siteVisit({ assignedUserId: null }), null, new Map());
    expect(stop.crewUserIds).toEqual([]);
    expect(stop.crewNames).toEqual([]);
  });
});

describe('orderStopsByScheduledTime', () => {
  it('orders by scheduled_start ascending and assigns 1-based order', () => {
    const stops: RouteStopModel[] = [
      buildJobStop(job({ id: 'a', scheduledStart: '2026-08-10T16:00:00.000Z' }), [], new Map()),
      buildSiteVisitStop(siteVisit({ id: 'b', scheduledStart: '2026-08-10T09:00:00.000Z' }), null, new Map()),
      buildJobStop(job({ id: 'c', scheduledStart: '2026-08-10T12:00:00.000Z' }), [], new Map()),
    ];
    const ordered = orderStopsByScheduledTime(stops);
    expect(ordered.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(ordered.map((s) => s.order)).toEqual([1, 2, 3]);
  });
});

describe('crew filtering', () => {
  const stops: RouteStopModel[] = [
    buildJobStop(job({ id: 'j1' }), [{ userId: 'u1', displayName: 'Alex', isLead: true }], new Map()),
    buildJobStop(job({ id: 'j2' }), [], new Map()),
    buildSiteVisitStop(siteVisit({ id: 'v1' }), 'Taylor Tech', new Map()),
  ];

  it('all returns everything', () => {
    expect(filterStopsByCrew(stops, { type: 'all' }).map((s) => s.id)).toEqual(['j1', 'j2', 'v1']);
  });
  it('unassigned returns only stops with no crew', () => {
    expect(filterStopsByCrew(stops, { type: 'unassigned' }).map((s) => s.id)).toEqual(['j2']);
  });
  it('lead returns only stops with a resolved lead/assigned technician', () => {
    expect(filterStopsByCrew(stops, { type: 'lead' }).map((s) => s.id)).toEqual(['j1', 'v1']);
  });
  it('user filters jobs via job_assignments and site visits via assigned_user_id', () => {
    expect(filterStopsByCrew(stops, { type: 'user', userId: 'u1' }).map((s) => s.id)).toEqual(['j1']);
    expect(filterStopsByCrew(stops, { type: 'user', userId: 'user-9' }).map((s) => s.id)).toEqual(['v1']);
  });

  it('parseCrewFilterId round-trips ids built by buildCrewFilterOptions', () => {
    const options = buildCrewFilterOptions([{ userId: 'u1', displayName: 'Alex' }]);
    expect(options.map((o) => o.id)).toEqual(['all', 'lead', 'unassigned', 'user:u1']);
    expect(parseCrewFilterId('user:u1')).toEqual({ type: 'user', userId: 'u1' });
    expect(parseCrewFilterId('lead')).toEqual({ type: 'lead' });
    expect(parseCrewFilterId('unassigned')).toEqual({ type: 'unassigned' });
    expect(parseCrewFilterId('')).toEqual({ type: 'all' });
    expect(parseCrewFilterId('garbage')).toEqual({ type: 'all' });
  });
});

describe('buildMarkers', () => {
  it('only produces markers for geocoded stops — never a fabricated coordinate', () => {
    const geocode = new Map<string, LatLng>([['123 Main St, Austin, TX, 78701', { lat: 30.27, lng: -97.74 }]]);
    const stops = orderStopsByScheduledTime([
      buildJobStop(job({ id: 'geocoded' }), [], geocode),
      buildJobStop(job({ id: 'not-geocoded', address: { line1: '9 Nowhere Rd', line2: null, city: null, state: null, zip: null } }), [], geocode),
      buildSiteVisitStop(siteVisit({ id: 'missing-address', address: null }), null, geocode),
    ]);
    const markers = buildMarkers(stops);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.id).toBe('geocoded');
    expect(markers[0]?.position).toEqual({ lat: 30.27, lng: -97.74 });
  });
});

describe('buildRouteSummary', () => {
  it('counts real, honest totals — never a fabricated distance/time', () => {
    const geocode = new Map<string, LatLng>([['123 Main St, Austin, TX, 78701', { lat: 30.27, lng: -97.74 }]]);
    const scheduled = [
      buildJobStop(job({ id: 'j1' }), [{ userId: 'u1', displayName: 'Alex', isLead: true }], geocode),
      buildJobStop(job({ id: 'j2', address: null }), [], new Map()),
      buildSiteVisitStop(siteVisit({ id: 'v1' }), 'Taylor Tech', new Map()),
    ];
    const unscheduled = [buildJobStop(job({ id: 'u1', scheduledStart: null }), [], new Map())];
    const summary = buildRouteSummary(scheduled, unscheduled);
    expect(summary).toEqual({
      scheduledCount: 3,
      jobCount: 2,
      siteVisitCount: 1,
      unassignedCount: 1,
      missingLocationCount: 2,
      unscheduledCount: 1,
    });
  });
});

describe('collectAddressKeysToGeocode', () => {
  it('dedupes addresses across stops', () => {
    const stops = [
      buildJobStop(job({ id: 'j1' }), [], new Map()),
      buildJobStop(job({ id: 'j2' }), [], new Map()),
      buildSiteVisitStop(siteVisit({ id: 'v1', address: null }), null, new Map()),
    ];
    expect(collectAddressKeysToGeocode(stops)).toEqual(['123 Main St, Austin, TX, 78701']);
  });
});
