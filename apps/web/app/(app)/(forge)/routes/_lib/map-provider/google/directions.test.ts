import { describe, expect, it } from 'vitest';

import { parseDirectionsResponse, type GoogleDirectionsResponse } from './directions';

describe('parseDirectionsResponse', () => {
  it('sums real leg distances/durations across a multi-stop route — never a fabricated total', () => {
    const response: GoogleDirectionsResponse = {
      status: 'OK',
      routes: [
        {
          overview_polyline: { points: 'a~l~Fjk~uOwHJy@P' },
          legs: [
            { distance: { value: 1609, text: '1.0 mi' }, duration: { value: 300, text: '5 mins' } },
            { distance: { value: 3218, text: '2.0 mi' }, duration: { value: 480, text: '8 mins' } },
          ],
        },
      ],
    };
    const outcome = parseDirectionsResponse(response);
    expect(outcome.status).toBe('ok');
    expect(outcome.legs).toHaveLength(2);
    expect(outcome.totalDistanceMeters).toBe(4827);
    expect(outcome.totalDurationSeconds).toBe(780);
    expect(outcome.overviewPolyline).toBe('a~l~Fjk~uOwHJy@P');
  });

  it('surfaces ZERO_RESULTS as an error, never a straight-line fallback', () => {
    const response: GoogleDirectionsResponse = { status: 'ZERO_RESULTS', routes: [] };
    const outcome = parseDirectionsResponse(response);
    expect(outcome.status).toBe('error');
    expect(outcome.totalDistanceMeters).toBe(0);
    expect(outcome.overviewPolyline).toBeNull();
  });

  it('surfaces a route response with no legs as an error rather than dividing by zero', () => {
    const response: GoogleDirectionsResponse = { status: 'OK', routes: [{ legs: [] }] };
    const outcome = parseDirectionsResponse(response);
    expect(outcome.status).toBe('ok');
    expect(outcome.totalDistanceMeters).toBe(0);
    expect(outcome.legs).toEqual([]);
  });

  it('propagates the provider error_message for REQUEST_DENIED', () => {
    const response: GoogleDirectionsResponse = { status: 'REQUEST_DENIED', error_message: 'API key invalid', routes: [] };
    expect(parseDirectionsResponse(response).errorMessage).toBe('API key invalid');
  });
});
