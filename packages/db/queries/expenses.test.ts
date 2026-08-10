import { describe, expect, it } from 'vitest';

import {
  deriveApprovedExpenseStatus,
  expenseMatchesFilter,
  isExpenseEligibleForInvoiceCharge,
} from './expenses';

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

describe('isExpenseEligibleForInvoiceCharge', () => {
  it('is eligible only when ready_to_invoice and a customer-charge-eligible billing treatment', () => {
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'billable_with_markup', status: 'ready_to_invoice' })
    ).toBe(true);
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'reimbursable_at_cost', status: 'ready_to_invoice' })
    ).toBe(true);
    expect(
      isExpenseEligibleForInvoiceCharge({
        billing_treatment: 'customer_approved_pass_through',
        status: 'ready_to_invoice',
      })
    ).toBe(true);
  });

  it('rejects expenses not yet ready to invoice', () => {
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'billable_with_markup', status: 'approved' })
    ).toBe(false);
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'billable_with_markup', status: 'invoiced' })
    ).toBe(false);
  });

  it('rejects billing treatments that never reach a customer charge, even if marked ready', () => {
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'internal_cost_only', status: 'ready_to_invoice' })
    ).toBe(false);
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'included_fixed_price', status: 'ready_to_invoice' })
    ).toBe(false);
    expect(
      isExpenseEligibleForInvoiceCharge({ billing_treatment: 'non_billable', status: 'ready_to_invoice' })
    ).toBe(false);
  });
});
