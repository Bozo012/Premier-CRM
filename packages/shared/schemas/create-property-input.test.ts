import { describe, expect, it } from 'vitest';

import { CreatePropertyInputSchema } from './create-property-input';

const UUID = '9f0d1a34-2b7c-4e5f-8a9b-0c1d2e3f4a5b';

describe('CreatePropertyInputSchema', () => {
  const valid = {
    customerId: UUID,
    addressLine1: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62704',
  };

  it('accepts a minimal valid property', () => {
    const parsed = CreatePropertyInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.country).toBe('US');
    }
  });

  it('rejects a missing street address', () => {
    expect(
      CreatePropertyInputSchema.safeParse({ ...valid, addressLine1: '' }).success
    ).toBe(false);
  });

  it('rejects a missing city', () => {
    expect(CreatePropertyInputSchema.safeParse({ ...valid, city: '' }).success).toBe(false);
  });

  it('rejects a non-uuid customerId', () => {
    expect(
      CreatePropertyInputSchema.safeParse({ ...valid, customerId: 'not-a-uuid' }).success
    ).toBe(false);
  });

  it('rejects an unknown property type', () => {
    expect(
      CreatePropertyInputSchema.safeParse({ ...valid, propertyType: 'castle' }).success
    ).toBe(false);
  });

  it('accepts a known property type', () => {
    expect(
      CreatePropertyInputSchema.safeParse({ ...valid, propertyType: 'single_family' }).success
    ).toBe(true);
  });
});
