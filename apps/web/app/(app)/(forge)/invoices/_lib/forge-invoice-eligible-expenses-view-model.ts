import type { EligibleExpenseForJob } from '@premier/db';

import { formatMoney } from './forge-invoice-view-model';

/**
 * Layer 2 adapter for the "Eligible expenses" section on a draft invoice's
 * detail page — loosely modeled on Base44's EligibleExpenseOption contract
 * (src/contracts/expenses.ts) but built directly against this app's real
 * `listEligibleExpensesForJob` query (packages/db/queries/expenses.ts),
 * which already excludes anything already linked via a real
 * invoice_line_items.source_expense_id match, not just expenses.status.
 *
 * Every value here is read straight off the real expense row — no markup
 * math, no re-deriving eligibility (that's the query's job).
 */
export interface ForgeEligibleExpenseOption {
  id: string;
  description: string;
  categoryLabel: string;
  vendor: string;
  originalCostLabel: string;
  billingTreatmentLabel: string;
  customerChargeLabel: string;
  receiptLabel: string;
  hasReceipt: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'Equipment',
  labor: 'Labor',
  materials: 'Materials',
  other: 'Other',
  permit: 'Permit',
  subcontractor: 'Subcontractor',
  travel: 'Travel',
};

const BILLING_TREATMENT_LABELS: Record<string, string> = {
  billable_with_markup: 'Billable with markup',
  customer_approved_pass_through: 'Customer-approved pass-through',
  reimbursable_at_cost: 'Reimbursable at cost',
};

export function toEligibleExpenseOptions(
  items: EligibleExpenseForJob[]
): ForgeEligibleExpenseOption[] {
  return items.map(({ expense }) => ({
    id: expense.id,
    description: expense.description,
    categoryLabel: CATEGORY_LABELS[expense.category] ?? expense.category,
    vendor: expense.vendor || 'No vendor',
    originalCostLabel: formatMoney(expense.total_cost ?? expense.amount + expense.tax),
    billingTreatmentLabel: BILLING_TREATMENT_LABELS[expense.billing_treatment] ?? expense.billing_treatment,
    customerChargeLabel: formatMoney(
      expense.customer_charge_amount ?? expense.total_cost ?? expense.amount + expense.tax
    ),
    receiptLabel: expense.receipt_vault_item_id ? 'Receipt attached' : 'Receipt missing',
    hasReceipt: Boolean(expense.receipt_vault_item_id),
  }));
}
