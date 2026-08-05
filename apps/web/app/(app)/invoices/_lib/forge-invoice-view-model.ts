import type { InvoiceDetail, InvoiceLineItemSummary, InvoiceListItem, Payment } from '@premier/db';
import type { InvoiceStatus } from '@premier/shared';
import type { StatusTone } from '@/components/ui/status-pill';

export interface ForgeInvoiceSummary {
  id: string;
  number: string;
  title: string;
  customerName: string;
  propertyName: string;
  jobLabel: string;
  amountLabel: string;
  amountDueLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  originLabel: string;
  issuedLabel: string;
  dueLabel: string;
  nextActionLabel: string;
}

export interface ForgeInvoiceDetailModel extends ForgeInvoiceSummary {
  kindLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  taxLabel: string;
  paidLabel: string;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddress: string | null;
  quoteLabel: string | null;
  sharePath: string | null;
  readOnlyReason: string | null;
}

export function toForgeInvoiceSummary(item: InvoiceListItem): ForgeInvoiceSummary {
  const status = item.isOverdue ? 'overdue' : item.invoice.status;

  return {
    id: item.invoice.id,
    number: item.invoice.invoice_number?.trim() || 'Draft invoice',
    title: resolveInvoiceTitle(item),
    customerName: item.customer?.displayName ?? 'Unknown customer',
    propertyName: item.job.title?.trim() || item.job.jobNumber || 'No job title',
    jobLabel: item.job.jobNumber ?? 'Standalone job',
    amountLabel: formatMoney(item.invoice.total),
    amountDueLabel: formatMoney(item.invoice.amount_due),
    statusLabel: invoiceStatusLabel(status),
    statusTone: invoiceStatusTone(status),
    originLabel: item.invoice.quote_id ? 'From quote' : 'From job',
    issuedLabel: formatDate(item.invoice.issued_date),
    dueLabel: item.invoice.due_date ? formatDate(item.invoice.due_date) : 'No due date',
    nextActionLabel: invoiceNextActionLabel(status),
  };
}

export function toForgeInvoiceDetailModel(detail: InvoiceDetail, isOverdue = false): ForgeInvoiceDetailModel {
  const summary = toForgeInvoiceSummary({
    customer: detail.customer
      ? {
          displayName: detail.customer.displayName,
          email: detail.customer.email,
          id: detail.customer.id,
          phonePrimary: detail.customer.phonePrimary,
        }
      : null,
    invoice: detail.invoice,
    isOverdue,
    job: detail.job,
  });
  const readOnlyReason =
    detail.invoice.kind === 'working'
      ? 'working invoices cannot be sent or paid directly'
      : detail.invoice.status === 'draft'
        ? null
        : 'issued invoices are controlled by explicit invoice actions';

  return {
    ...summary,
    kindLabel: formatEnumLabel(detail.invoice.kind),
    subtotalLabel: formatMoney(detail.invoice.subtotal),
    discountLabel: formatMoney(detail.invoice.discount_amount),
    taxLabel: formatMoney(detail.invoice.tax_amount),
    paidLabel: formatMoney(detail.invoice.amount_paid),
    customerEmail: detail.customer?.email ?? null,
    customerPhone: detail.customer?.phonePrimary ?? null,
    propertyAddress: detail.property ? formatPropertyAddress(detail.property) : null,
    quoteLabel: detail.quote?.quoteNumber ?? detail.quote?.title ?? null,
    sharePath: detail.invoice.share_token ? `/i/${detail.invoice.share_token}` : null,
    readOnlyReason,
  };
}

export function invoiceStatusTone(status: InvoiceStatus | 'overdue' | string): StatusTone {
  if (status === 'paid') return 'emerald';
  if (status === 'void' || status === 'refunded') return 'neutral';
  if (status === 'overdue') return 'red';
  if (status === 'partially_paid' || status === 'viewed') return 'amber';
  if (status === 'sent') return 'blue';
  return 'neutral';
}

export function invoiceOutstandingTotal(items: InvoiceListItem[]): number {
  return items.reduce((total, item) => total + Math.max(0, item.invoice.amount_due ?? 0), 0);
}

export function invoicePaidTotal(items: InvoiceListItem[]): number {
  return items.reduce((total, item) => total + Math.max(0, item.invoice.amount_paid ?? 0), 0);
}

export function formatInvoiceLineTotal(lineItem: InvoiceLineItemSummary): string {
  return formatMoney(lineItem.item.total);
}

export function formatPaymentAmount(payment: Payment): string {
  return formatMoney(payment.amount);
}

export function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function resolveInvoiceTitle(item: InvoiceListItem): string {
  if (item.invoice.title?.trim()) return item.invoice.title.trim();
  if (item.invoice.invoice_number?.trim()) return item.invoice.invoice_number.trim();
  if (item.job.title.trim()) return `Invoice for ${item.job.title.trim()}`;
  if (item.job.jobNumber) return `Invoice for job ${item.job.jobNumber}`;
  return 'Untitled invoice';
}

function invoiceStatusLabel(status: InvoiceStatus | 'overdue' | string): string {
  if (status === 'partially_paid') return 'Partially paid';
  return formatEnumLabel(status);
}

function invoiceNextActionLabel(status: InvoiceStatus | 'overdue' | string): string {
  if (status === 'draft') return 'Send invoice';
  if (status === 'sent' || status === 'viewed' || status === 'partially_paid' || status === 'overdue') {
    return 'Record payment';
  }
  return 'Open invoice';
}

function formatPropertyAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}): string {
  return [property.addressLine1, property.addressLine2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(', ');
}
