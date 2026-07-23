import { describe, expect, it } from 'vitest';

import { CheckCustomerEmailInputSchema } from './create-customer-input';

describe('CheckCustomerEmailInputSchema', () => {
  it('accepts a valid email and lowercases it', () => {
    const parsed = CheckCustomerEmailInputSchema.safeParse({ email: 'Jane@Example.com' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('jane@example.com');
    }
  });

  it('rejects an invalid email', () => {
    expect(CheckCustomerEmailInputSchema.safeParse({ email: 'not-an-email' }).success).toBe(
      false
    );
  });

  it('rejects an empty email', () => {
    expect(CheckCustomerEmailInputSchema.safeParse({ email: '' }).success).toBe(false);
  });
});
