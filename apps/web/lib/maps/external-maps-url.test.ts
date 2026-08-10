import { describe, expect, it } from 'vitest';

import { buildOpenInMapsUrl } from './external-maps-url';

describe('buildOpenInMapsUrl', () => {
  it('builds the universal Google Maps search URL from an address, no key required', () => {
    const url = buildOpenInMapsUrl({ addressLine1: '123 Main St', addressLine2: null, city: 'Austin', state: 'TX', zip: '78701' });
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=123+Main+St%2C+Austin%2C+TX%2C+78701');
  });

  it('prefers real coordinates over the address string when both are present', () => {
    const url = buildOpenInMapsUrl({
      addressLine1: '123 Main St',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      coordinates: { lat: 30.2711, lng: -97.7437 },
    });
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=30.2711%2C-97.7437');
  });

  it('returns null when there is no usable destination at all', () => {
    expect(buildOpenInMapsUrl({ addressLine1: null, addressLine2: null, city: null, state: null, zip: null })).toBeNull();
  });

  it('never includes fields beyond the destination — no gate codes or access notes are accepted by the signature', () => {
    const url = buildOpenInMapsUrl({ addressLine1: '1 Gate Rd', addressLine2: null, city: null, state: null, zip: null });
    expect(url).not.toContain('gate');
  });
});
