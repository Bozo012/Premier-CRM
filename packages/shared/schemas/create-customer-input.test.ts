import { describe, expect, it } from 'vitest';

import { CreateCustomerInputSchema } from './create-customer-input';

describe('CreateCustomerInputSchema', () => {
  it('accepts a customer with a personal name', () => {
    const parsed = CreateCustomerInputSchema.safeParse({ firstName: 'Jane', lastName: 'Doe' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('residential');
    }
  });

  it('accepts a customer with only a company name', () => {
    expect(CreateCustomerInputSchema.safeParse({ companyName: 'Acme LLC' }).success).toBe(true);
  });

  it('rejects a customer with no name and no company name', () => {
    const parsed = CreateCustomerInputSchema.safeParse({ phonePrimary: '555-1234' });
    expect(parsed.success).toBe(false);
  });

  it('accepts an empty email as equivalent to omitted', () => {
    const parsed = CreateCustomerInputSchema.safeParse({ firstName: 'Jane', email: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('');
    }
  });

  it('rejects an invalid email', () => {
    const parsed = CreateCustomerInputSchema.safeParse({
      firstName: 'Jane',
      email: 'not-an-email',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown customer type', () => {
    const parsed = CreateCustomerInputSchema.safeParse({ firstName: 'Jane', type: 'enterprise' });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown preferred channel', () => {
    const parsed = CreateCustomerInputSchema.safeParse({
      firstName: 'Jane',
      preferredChannel: 'carrier_pigeon',
    });
    expect(parsed.success).toBe(false);
  });
});
