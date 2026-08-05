import { describe, expect, it } from 'vitest';

import {
  ApproveExpenseInputSchema,
  CreateExpenseInputSchema,
  ExpenseFilterSchema,
} from './expense';

describe('expense schemas', () => {
  it('normalizes a valid expense creation payload', () => {
    const parsed = CreateExpenseInputSchema.parse({
      amount: '125.50',
      category: 'materials',
      description: 'Drainage material',
      jobId: '11111111-1111-4111-8111-111111111111',
      purchaseDate: '2026-08-05',
      tax: '8.75',
    });

    expect(parsed).toMatchObject({
      amount: 125.5,
      billingTreatment: 'pending_review',
      paymentMethod: 'other',
      receiptVisibility: 'internal',
      tax: 8.75,
    });
  });

  it('rejects missing descriptions and invalid filters', () => {
    expect(() =>
      CreateExpenseInputSchema.parse({
        amount: '25',
        category: 'materials',
        description: '',
        jobId: '11111111-1111-4111-8111-111111111111',
        purchaseDate: '2026-08-05',
      })
    ).toThrow();

    expect(ExpenseFilterSchema.safeParse('over-budget').success).toBe(false);
  });

  it('accepts explicit approval billing treatment snapshots', () => {
    const parsed = ApproveExpenseInputSchema.parse({
      billingTreatment: 'billable_with_markup',
      customerChargeAmount: '155.00',
      expenseId: '22222222-2222-4222-8222-222222222222',
    });

    expect(parsed.customerChargeAmount).toBe(155);
  });
});
