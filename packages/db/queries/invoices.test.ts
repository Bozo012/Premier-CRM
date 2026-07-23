import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@premier/shared';

import { computeIsOverdue, translatePaymentError } from './invoices';

const PAST = '2020-01-01';
const FUTURE = '2099-01-01';

describe('computeIsOverdue', () => {
  it('is overdue when the due date has passed and a balance remains', () => {
    expect(
      computeIsOverdue({ due_date: PAST, amount_due: 100, status: 'sent' })
    ).toBe(true);
  });

  it('is not overdue before the due date', () => {
    expect(
      computeIsOverdue({ due_date: FUTURE, amount_due: 100, status: 'sent' })
    ).toBe(false);
  });

  it('is not overdue with no due date at all', () => {
    expect(
      computeIsOverdue({ due_date: null, amount_due: 100, status: 'sent' })
    ).toBe(false);
  });

  it('is not overdue once fully paid, even past the due date', () => {
    expect(
      computeIsOverdue({ due_date: PAST, amount_due: 0, status: 'paid' })
    ).toBe(false);
  });

  it('never marks draft, void, or refunded invoices overdue', () => {
    for (const status of ['draft', 'void', 'refunded'] as const) {
      expect(computeIsOverdue({ due_date: PAST, amount_due: 100, status })).toBe(false);
    }
  });

  it('is not overdue when the remaining balance is zero or negative', () => {
    expect(
      computeIsOverdue({ due_date: PAST, amount_due: 0, status: 'sent' })
    ).toBe(false);
    expect(
      computeIsOverdue({ due_date: PAST, amount_due: null, status: 'sent' })
    ).toBe(false);
  });

  it('treats a partially paid invoice past due as overdue', () => {
    expect(
      computeIsOverdue({ due_date: PAST, amount_due: 50, status: 'partially_paid' })
    ).toBe(true);
  });
});

describe('translatePaymentError', () => {
  it('maps the overpayment trigger message to VALIDATION_ERROR', () => {
    const result = translatePaymentError(
      'Payment of $200.00 would exceed the invoice total: only $150.00 is due.'
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('maps the void-invoice trigger message to VALIDATION_ERROR', () => {
    const result = translatePaymentError('Cannot record a payment on a void invoice.');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('maps the non-positive-amount trigger message to VALIDATION_ERROR', () => {
    const result = translatePaymentError('Payment amount must be greater than zero.');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('treats any other database error as DB_ERROR', () => {
    const result = translatePaymentError(
      'duplicate key value violates unique constraint "payments_pkey"'
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.DB_ERROR);
    }
  });
});
