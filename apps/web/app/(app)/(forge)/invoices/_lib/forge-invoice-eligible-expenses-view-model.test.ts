import { describe, expect, it } from 'vitest';

import type { EligibleExpenseForJob } from '@premier/db';

import { toEligibleExpenseOptions } from './forge-invoice-eligible-expenses-view-model';

function buildExpense(overrides: Partial<EligibleExpenseForJob['expense']> = {}): EligibleExpenseForJob['expense'] {
  return {
    id: 'exp-1',
    description: 'Drainage pipe',
    amount: 100,
    tax: 8,
    total_cost: 108,
    category: 'materials',
    vendor: 'Acme Supply',
    billing_treatment: 'billable_with_markup',
    customer_charge_amount: 150,
    receipt_vault_item_id: 'vault-1',
    status: 'ready_to_invoice',
    ...overrides,
  } as EligibleExpenseForJob['expense'];
}

describe('toEligibleExpenseOptions', () => {
  it('maps every real expense field, never inventing values', () => {
    const options = toEligibleExpenseOptions([{ expense: buildExpense() }]);
    const option = options[0]!;

    expect(option.id).toBe('exp-1');
    expect(option.description).toBe('Drainage pipe');
    expect(option.categoryLabel).toBe('Materials');
    expect(option.vendor).toBe('Acme Supply');
    expect(option.originalCostLabel).toBe('$108.00');
    expect(option.billingTreatmentLabel).toBe('Billable with markup');
    expect(option.customerChargeLabel).toBe('$150.00');
    expect(option.hasReceipt).toBe(true);
    expect(option.receiptLabel).toBe('Receipt attached');
  });

  it('falls back to amount + tax when total_cost is not populated', () => {
    const options = toEligibleExpenseOptions([
      { expense: buildExpense({ total_cost: null, amount: 50, tax: 5 }) },
    ]);
    const option = options[0]!;
    expect(option.originalCostLabel).toBe('$55.00');
  });

  it('falls back the customer charge to cost when no customer_charge_amount is set', () => {
    const options = toEligibleExpenseOptions([
      { expense: buildExpense({ customer_charge_amount: null, total_cost: 120 }) },
    ]);
    const option = options[0]!;
    expect(option.customerChargeLabel).toBe('$120.00');
  });

  it('reports missing receipt honestly', () => {
    const options = toEligibleExpenseOptions([{ expense: buildExpense({ receipt_vault_item_id: null }) }]);
    const option = options[0]!;
    expect(option.hasReceipt).toBe(false);
    expect(option.receiptLabel).toBe('Receipt missing');
  });

  it('shows no vendor when the field is blank', () => {
    const options = toEligibleExpenseOptions([{ expense: buildExpense({ vendor: '' }) }]);
    const option = options[0]!;
    expect(option.vendor).toBe('No vendor');
  });
});
