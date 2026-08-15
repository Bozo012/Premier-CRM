import { describe, expect, it } from 'vitest';

import { parseGeocodeV4Error, parseGeocodeV4Response, type GoogleApiErrorBody, type GoogleGeocodeV4Response } from './geocode';

describe('parseGeocodeV4Response', () => {
  it('parses a real result with a single match', () => {
    const response: GoogleGeocodeV4Response = {
      results: [
        {
          location: { latitude: 30.2711, longitude: -97.7437 },
          formattedAddress: '123 Main St, Austin, TX 78701, USA',
        },
      ],
    };
    expect(parseGeocodeV4Response(response)).toEqual({
      status: 'ok',
      position: { lat: 30.2711, lng: -97.7437 },
      formattedAddress: '123 Main St, Austin, TX 78701, USA',
      errorMessage: null,
    });
  });

  it('treats a missing results array as not-found, never a fabricated position', () => {
    const response: GoogleGeocodeV4Response = {};
    expect(parseGeocodeV4Response(response)).toEqual({ status: 'not-found', position: null, formattedAddress: null, errorMessage: null });
  });

  it('treats an empty results array as not-found', () => {
    const response: GoogleGeocodeV4Response = { results: [] };
    expect(parseGeocodeV4Response(response)).toEqual({ status: 'not-found', position: null, formattedAddress: null, errorMessage: null });
  });

  it('takes the first result when multiple are returned', () => {
    const response: GoogleGeocodeV4Response = {
      results: [
        { location: { latitude: 1, longitude: 2 }, formattedAddress: 'First' },
        { location: { latitude: 3, longitude: 4 }, formattedAddress: 'Second' },
      ],
    };
    expect(parseGeocodeV4Response(response).formattedAddress).toBe('First');
  });
});

describe('parseGeocodeV4Error', () => {
  it('surfaces the standard Google API error envelope message', () => {
    const body: GoogleApiErrorBody = { error: { code: 403, message: 'API key not authorized for this API.', status: 'PERMISSION_DENIED' } };
    const outcome = parseGeocodeV4Error(body, 403);
    expect(outcome.status).toBe('error');
    expect(outcome.position).toBeNull();
    expect(outcome.errorMessage).toBe('API key not authorized for this API.');
  });

  it('surfaces RESOURCE_EXHAUSTED (quota) with the provider message', () => {
    const body: GoogleApiErrorBody = { error: { code: 429, message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } };
    const outcome = parseGeocodeV4Error(body, 429);
    expect(outcome.errorMessage).toBe('Quota exceeded.');
  });

  it('falls back to an HTTP-status message when the body is missing/malformed', () => {
    const outcome = parseGeocodeV4Error(null, 500);
    expect(outcome.status).toBe('error');
    expect(outcome.errorMessage).toContain('500');
  });
});
