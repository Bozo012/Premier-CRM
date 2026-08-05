import type {
  Expense,
  ExpenseDetail,
  ExpenseListItem,
  ExpenseSummaryCard,
} from '@premier/db';
import type {
  ExpenseBillingTreatment,
  ExpenseCategory,
  ExpenseFilter,
  ExpenseStatus,
} from '@premier/shared';

import type { StatusTone } from '@/components/ui/status-pill';

export interface ForgeExpenseSummary {
  amountLabel: string;
  attentionLabel: string | null;
  billingTreatment: ExpenseBillingTreatment;
  billingTreatmentLabel: string;
  category: ExpenseCategory;
  categoryLabel: string;
  dateLabel: string;
  description: string;
  hasReceipt: boolean;
  id: string;
  invoiceHref: string | null;
  invoiceLabel: string | null;
  jobLabel: string;
  propertyLabel: string;
  receiptLabel: string;
  status: ExpenseStatus;
  statusLabel: string;
  statusTone: StatusTone;
  vendor: string;
}

export interface ForgeExpenseDetail extends ForgeExpenseSummary {
  approvalComment: string | null;
  billingTreatmentNote: string;
  customerName: string;
  customerVisibleDescription: string | null;
  expenseNumber: string;
  internalNotes: string;
  jobHref: string;
  paymentMethodLabel: string;
  statusDescription: string;
  taxLabel: string;
  totalCostLabel: string;
}

export function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value ?? 0);
}

export function toForgeExpenseSummary(item: ExpenseListItem): ForgeExpenseSummary {
  const expense = item.expense;
  return {
    amountLabel: formatMoney(expense.total_cost ?? expense.amount + expense.tax),
    attentionLabel: getAttentionLabel(expense),
    billingTreatment: expense.billing_treatment,
    billingTreatmentLabel: getBillingTreatmentLabel(expense.billing_treatment),
    category: expense.category,
    categoryLabel: getCategoryLabel(expense.category),
    dateLabel: formatDate(expense.purchase_date),
    description: expense.description,
    hasReceipt: Boolean(expense.receipt_vault_item_id),
    id: expense.id,
    invoiceHref: item.invoice ? `/invoices/${item.invoice.id}` : null,
    invoiceLabel: item.invoice?.invoiceNumber ?? null,
    jobLabel: item.job?.jobNumber ?? item.job?.title ?? 'Unassigned job',
    propertyLabel: item.property ? formatProperty(item.property) : 'Unknown property',
    receiptLabel: expense.receipt_vault_item_id ? 'Receipt attached' : 'Receipt missing',
    status: expense.status,
    statusLabel: getStatusLabel(expense.status),
    statusTone: getStatusTone(expense.status),
    vendor: expense.vendor || 'No vendor',
  };
}

export function toForgeExpenseDetail(item: ExpenseDetail): ForgeExpenseDetail {
  const summary = toForgeExpenseSummary(item);
  return {
    ...summary,
    approvalComment: item.expense.approval_comment,
    billingTreatmentNote: getBillingTreatmentNote(item.expense.billing_treatment),
    customerName: item.customer?.displayName ?? 'Unknown customer',
    customerVisibleDescription: item.expense.customer_visible_description,
    expenseNumber: item.expense.expense_number,
    internalNotes: item.expense.internal_notes || 'No internal notes.',
    jobHref: `/jobs/${item.expense.job_id}`,
    paymentMethodLabel: getPaymentMethodLabel(item.expense.payment_method),
    statusDescription: getStatusDescription(item.expense),
    taxLabel: formatMoney(item.expense.tax),
    totalCostLabel: formatMoney(item.expense.total_cost ?? item.expense.amount + item.expense.tax),
  };
}

export function toSummaryCards(summary: ExpenseSummaryCard[]) {
  return summary.map((card) => ({
    ...card,
    valueLabel: formatMoney(card.value),
  }));
}

export function buildExpenseFilterHref(filter: ExpenseFilter, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (filter !== 'all') params.set('filter', filter);
  const query = params.toString();
  return query ? `/expenses?${query}` : '/expenses';
}

export function getCategoryLabel(category: ExpenseCategory): string {
  const labels: Record<ExpenseCategory, string> = {
    equipment: 'Equipment',
    labor: 'Labor',
    materials: 'Materials',
    other: 'Other',
    permit: 'Permit',
    subcontractor: 'Subcontractor',
    travel: 'Travel',
  };
  return labels[category];
}

export function getBillingTreatmentLabel(treatment: ExpenseBillingTreatment): string {
  const labels: Record<ExpenseBillingTreatment, string> = {
    billable_with_markup: 'Billable with markup',
    customer_approved_pass_through: 'Customer-approved pass-through',
    included_accepted_quote: 'Included in accepted quote',
    included_fixed_price: 'Included in fixed price',
    internal_cost_only: 'Internal cost only',
    non_billable: 'Non-billable',
    pending_review: 'Pending review',
    reimbursable_at_cost: 'Reimbursable at cost',
  };
  return labels[treatment];
}

export function getStatusLabel(status: ExpenseStatus): string {
  const labels: Record<ExpenseStatus, string> = {
    approved: 'Approved',
    draft: 'Draft',
    internal_only: 'Internal only',
    invoiced: 'Invoiced',
    needs_receipt: 'Needs receipt',
    needs_review: 'Needs review',
    partially_invoiced: 'Partial',
    ready_to_invoice: 'Ready to invoice',
    reimbursed: 'Reimbursed',
    rejected: 'Rejected',
    submitted: 'Submitted',
    voided: 'Voided',
  };
  return labels[status];
}

export function getStatusTone(status: ExpenseStatus): StatusTone {
  if (status === 'rejected' || status === 'voided') return 'red';
  if (status === 'needs_receipt' || status === 'needs_review') return 'amber';
  if (status === 'ready_to_invoice' || status === 'invoiced' || status === 'partially_invoiced') return 'blue';
  if (status === 'approved' || status === 'reimbursed') return 'emerald';
  return 'neutral';
}

function getAttentionLabel(expense: Expense): string | null {
  if (!expense.receipt_vault_item_id) return 'Missing receipt';
  if (expense.status === 'submitted' || expense.status === 'needs_review') return 'Needs approval';
  if (expense.status === 'ready_to_invoice') return 'Ready for invoice review';
  return null;
}

function getBillingTreatmentNote(treatment: ExpenseBillingTreatment): string {
  if (treatment === 'pending_review') {
    return 'Billing treatment must be reviewed before this can affect customer-facing billing.';
  }
  if (treatment === 'internal_cost_only' || treatment === 'non_billable') {
    return 'This stays in Premier cost tracking and is not projected to the customer invoice.';
  }
  if (treatment === 'included_fixed_price' || treatment === 'included_accepted_quote') {
    return 'The cost is tracked internally because the customer-facing price is already covered by the approved scope.';
  }
  return 'This may be offered to invoice creation as a reviewed customer charge, using explicit snapshot values.';
}

function getStatusDescription(expense: Expense): string {
  if (expense.status === 'draft') return 'Draft expense. Submit it when the cost details are ready for review.';
  if (expense.status === 'submitted') return 'Submitted for owner/admin expense review.';
  if (expense.status === 'ready_to_invoice') return 'Approved as billable. Invoice linkage still requires a separate reviewed action.';
  if (expense.status === 'internal_only') return 'Approved as internal cost only.';
  if (expense.status === 'rejected') return 'Rejected and closed for now.';
  if (expense.status === 'voided') return 'Voided and closed.';
  return 'Expense state is tracked independently from customer invoices.';
}

function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    ach: 'ACH',
    card: 'Card',
    cash: 'Cash',
    check: 'Check',
    other: 'Other',
    venmo: 'Venmo',
  };
  return labels[method] ?? method;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T00:00:00`)
  );
}

function formatProperty(property: ExpenseListItem['property']): string {
  if (!property) return 'Unknown property';
  return `${property.addressLine1}, ${property.city}`;
}
