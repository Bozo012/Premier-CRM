import { describe, expect, it } from 'vitest';

import { MARKER_Z_INDEX, POLYLINE_Z_INDEX, resolvePriorityPinOptions } from './marker-rendering';

describe('marker/polyline stacking — regression coverage for the post-#150 "markers disappear after Calculate Route" defect', () => {
  it('gives markers a higher zIndex than the route polyline, so markers always render above it', () => {
    // The actual bug: AdvancedMarkerElement (vector-map, DOM-based) and
    // Polyline do not share an implicit stacking order the way legacy
    // google.maps.Marker/Polyline did — adding a polyline after markers
    // (exactly what "Calculate route" does) could visually occlude them
    // without removing them from the map. This is the fix's core invariant.
    expect(MARKER_Z_INDEX).toBeGreaterThan(POLYLINE_Z_INDEX);
  });
});

describe('resolvePriorityPinOptions', () => {
  it('returns a real pin config for a priority marker — shape/glyph distinction, never color alone', () => {
    const options = resolvePriorityPinOptions({ isPriority: true });
    expect(options).not.toBeNull();
    expect(options?.glyphText).toBe('!');
    expect(options?.scale).toBeGreaterThan(1);
    expect(options?.background).toBeTruthy();
    expect(options?.borderColor).toBeTruthy();
  });

  it('returns null for a non-priority marker (use the default pin, no custom content)', () => {
    expect(resolvePriorityPinOptions({ isPriority: false })).toBeNull();
  });

  it('never returns the same object reference for two different priority markers — no shared/cached PinElement config', () => {
    // Regression coverage for audit point #8 (PinElement content reused
    // incorrectly between markers): if this function ever memoized or
    // hoisted its return value, two priority markers on the same map would
    // end up sharing one config object. A real google.maps.marker.PinElement
    // is still constructed fresh per call site in google-route-map.tsx
    // (`new maps.marker.PinElement(pinOptions)` inside the per-marker
    // loop), but this proves the config itself is never a singleton either.
    const a = resolvePriorityPinOptions({ isPriority: true });
    const b = resolvePriorityPinOptions({ isPriority: true });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('produces one independent options object per marker across a mixed set — proving N markers never collapse to fewer than N decisions', () => {
    const markers = [{ isPriority: true }, { isPriority: false }, { isPriority: true }, { isPriority: false }];
    const results = markers.map(resolvePriorityPinOptions);
    expect(results).toEqual([
      expect.objectContaining({ glyphText: '!' }),
      null,
      expect.objectContaining({ glyphText: '!' }),
      null,
    ]);
    // The two priority results must be distinct object instances.
    expect(results[0]).not.toBe(results[2]);
  });
});
