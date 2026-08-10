import { describe, expect, it } from 'vitest';

import { parseGeocodeResponse, type GoogleGeocodeResponse } from './geocode';

describe('parseGeocodeResponse', () => {
  it('parses a real OK response with a single result', () => {
    const response: GoogleGeocodeResponse = {
      status: 'OK',
      results: [
        {
          formatted_address: '123 Main St, Austin, TX 78701, USA',
          geometry: { location: { lat: 30.2711, lng: -97.7437 }, location_type: 'ROOFTOP' },
        },
      ],
    };
    expect(parseGeocodeResponse(response)).toEqual({
      status: 'ok',
      position: { lat: 30.2711, lng: -97.7437 },
      formattedAddress: '123 Main St, Austin, TX 78701, USA',
      errorMessage: null,
    });
  });

  it('treats ZERO_RESULTS as not-found, never a fabricated position', () => {
    const response: GoogleGeocodeResponse = { status: 'ZERO_RESULTS', results: [] };
    expect(parseGeocodeResponse(response)).toEqual({ status: 'not-found', position: null, formattedAddress: null, errorMessage: null });
  });

  it('surfaces REQUEST_DENIED as an error with the provider message', () => {
    const response: GoogleGeocodeResponse = { status: 'REQUEST_DENIED', error_message: 'API key invalid', results: [] };
    const outcome = parseGeocodeResponse(response);
    expect(outcome.status).toBe('error');
    expect(outcome.position).toBeNull();
    expect(outcome.errorMessage).toBe('API key invalid');
  });

  it('surfaces OVER_QUERY_LIMIT as an error even with no error_message', () => {
    const response: GoogleGeocodeResponse = { status: 'OVER_QUERY_LIMIT', results: [] };
    const outcome = parseGeocodeResponse(response);
    expect(outcome.status).toBe('error');
    expect(outcome.errorMessage).toContain('OVER_QUERY_LIMIT');
  });

  it('takes the first result when multiple are returned', () => {
    const response: GoogleGeocodeResponse = {
      status: 'OK',
      results: [
        { formatted_address: 'First', geometry: { location: { lat: 1, lng: 2 } } },
        { formatted_address: 'Second', geometry: { location: { lat: 3, lng: 4 } } },
      ],
    };
    expect(parseGeocodeResponse(response).formattedAddress).toBe('First');
  });
});
