import { describe, expect, it } from 'vitest';

import {
  parseComputeRoutesError,
  parseComputeRoutesResponse,
  type GoogleApiErrorBody,
  type GoogleComputeRoutesResponse,
} from './compute-routes';

describe('parseComputeRoutesResponse', () => {
  it('parses a single-leg route (origin -> destination, no intermediates)', () => {
    const response: GoogleComputeRoutesResponse = {
      routes: [
        {
          distanceMeters: 4827,
          duration: '780s',
          polyline: { encodedPolyline: 'a~l~Fjk~uOwHJy@P' },
          legs: [{ distanceMeters: 4827, duration: '780s' }],
        },
      ],
    };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.status).toBe('ok');
    expect(outcome.legs).toHaveLength(1);
    expect(outcome.totalDistanceMeters).toBe(4827);
    expect(outcome.totalDurationSeconds).toBe(780);
    expect(outcome.overviewPolyline).toBe('a~l~Fjk~uOwHJy@P');
  });

  it('parses a multi-leg route (N intermediates -> N+1 legs), summing real values only', () => {
    const response: GoogleComputeRoutesResponse = {
      routes: [
        {
          distanceMeters: 8045,
          duration: '1080s',
          polyline: { encodedPolyline: 'xyz' },
          legs: [
            { distanceMeters: 1609, duration: '300s' },
            { distanceMeters: 3218, duration: '480s' },
            { distanceMeters: 3218, duration: '300s' },
          ],
        },
      ],
    };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.legs).toHaveLength(3);
    expect(outcome.legs[0]).toEqual({ distanceMeters: 1609, distanceText: '1.0 mi', durationSeconds: 300, durationText: '5 mins' });
    expect(outcome.totalDistanceMeters).toBe(8045);
    expect(outcome.totalDurationSeconds).toBe(1080);
  });

  it('surfaces an empty routes array as an error, never a straight-line fallback', () => {
    const response: GoogleComputeRoutesResponse = { routes: [] };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.status).toBe('error');
    expect(outcome.totalDistanceMeters).toBe(0);
    expect(outcome.overviewPolyline).toBeNull();
    expect(outcome.errorMessage).toBe('No route returned');
  });

  it('surfaces a missing routes field as an error', () => {
    const outcome = parseComputeRoutesResponse({});
    expect(outcome.status).toBe('error');
  });

  it('falls back to summing legs when top-level distanceMeters/duration are absent', () => {
    const response: GoogleComputeRoutesResponse = {
      routes: [{ legs: [{ distanceMeters: 1000, duration: '60s' }, { distanceMeters: 2000, duration: '120s' }] }],
    };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.totalDistanceMeters).toBe(3000);
    expect(outcome.totalDurationSeconds).toBe(180);
  });

  it('treats a route with no legs as ok but zero-length, not a divide-by-zero crash', () => {
    const response: GoogleComputeRoutesResponse = { routes: [{ distanceMeters: 0, duration: '0s', legs: [] }] };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.status).toBe('ok');
    expect(outcome.legs).toEqual([]);
    expect(outcome.totalDistanceMeters).toBe(0);
  });

  it('formats hour-scale durations correctly', () => {
    const response: GoogleComputeRoutesResponse = {
      routes: [{ distanceMeters: 160934, duration: '5400s', legs: [{ distanceMeters: 160934, duration: '5400s' }] }],
    };
    const outcome = parseComputeRoutesResponse(response);
    expect(outcome.legs[0]?.durationText).toBe('1 hr 30 mins');
  });
});

describe('parseComputeRoutesError', () => {
  it('surfaces INVALID_ARGUMENT (e.g. an invalid waypoint) with the provider message', () => {
    const body: GoogleApiErrorBody = { error: { code: 400, message: 'Invalid waypoint: latitude out of range.', status: 'INVALID_ARGUMENT' } };
    const outcome = parseComputeRoutesError(body, 400);
    expect(outcome.status).toBe('error');
    expect(outcome.errorMessage).toBe('Invalid waypoint: latitude out of range.');
  });

  it('surfaces PERMISSION_DENIED (auth failure) with the provider message', () => {
    const body: GoogleApiErrorBody = { error: { code: 403, message: 'API key not authorized for Routes API.', status: 'PERMISSION_DENIED' } };
    expect(parseComputeRoutesError(body, 403).errorMessage).toBe('API key not authorized for Routes API.');
  });

  it('surfaces RESOURCE_EXHAUSTED (quota) with the provider message', () => {
    const body: GoogleApiErrorBody = { error: { code: 429, message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } };
    expect(parseComputeRoutesError(body, 429).errorMessage).toBe('Quota exceeded.');
  });

  it('falls back to an HTTP-status message when the body is missing/malformed', () => {
    const outcome = parseComputeRoutesError(null, 500);
    expect(outcome.errorMessage).toContain('500');
  });
});
