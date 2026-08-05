import { describe, expect, it } from 'vitest';

import { deriveApprovedExpenseStatus, expenseMatchesFilter } from './expenses';

describe('expense rules', () => {
  it('keeps internal and non-billable approvals out of invoice readiness', () => {
    expect(
      deriveApprovedExpenseStatus({
        billingTreatment: 'internal_cost_only',
      })
    ).toBe('internal_only');

    expect(
      deriveApprovedExpenseStatus({
        billingTreatment: 'non_billable',
      })
    ).toBe('internal_only');
  });

  it('marks billable approvals ready only when a customer charge is supplied', () => {
    expect(
      deriveApprovedExpenseStatus({
        billingTreatment: 'billable_with_markup',
        customerChargeAmount: 0,
      })
    ).toBe('approved');

    expect(
      deriveApprovedExpenseStatus({
        billingTreatment: 'billable_with_markup',
        customerChargeAmount: 150,
      })
    ).toBe('ready_to_invoice');
  });

  it('maps Base44-style filters to Premier expense states', () => {
    expect(expenseMatchesFilter({ receipt_vault_item_id: null, status: 'draft' }, 'missing-receipt')).toBe(true);
    expect(expenseMatchesFilter({ receipt_vault_item_id: 'receipt-id', status: 'needs_review' }, 'needs-review')).toBe(true);
    expect(expenseMatchesFilter({ receipt_vault_item_id: 'receipt-id', status: 'partially_invoiced' }, 'invoiced')).toBe(true);
    expect(expenseMatchesFilter({ receipt_vault_item_id: 'receipt-id', status: 'voided' }, 'rejected')).toBe(true);
  });
});
