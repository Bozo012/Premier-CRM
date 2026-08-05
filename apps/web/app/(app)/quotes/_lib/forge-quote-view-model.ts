import type { QuoteDetail, QuoteListItem, QuoteLineItemSummary } from '@premier/db';
import type { QuoteStatus } from '@premier/shared';
import type { StatusTone } from '@/components/ui/status-pill';

export interface ForgeQuoteSummary {
  id: string;
  number: string;
  title: string;
  customerName: string;
  propertyName: string;
  jobLabel: string;
  amountLabel: string;
  lineItemCount: number;
  statusLabel: string;
  statusTone: StatusTone;
  originLabel: string;
  createdLabel: string;
  expiresLabel: string;
  nextActionLabel: string;
}

export interface ForgeQuoteDetailModel extends ForgeQuoteSummary {
  sentLabel: string;
  viewedLabel: string;
  acceptedLabel: string;
  declinedLabel: string;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddress: string | null;
  quoteTypeLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  taxLabel: string;
  totalLabel: string;
  sharePath: string | null;
}

export function toForgeQuoteSummary(item: QuoteListItem): ForgeQuoteSummary {
  return {
    id: item.quote.id,
    number: item.quote.quote_number?.trim() || 'Draft quote',
    title: resolveQuoteTitle(item),
    customerName: item.customer?.displayName ?? 'Unknown customer',
    propertyName: item.job.title.trim() || item.job.jobNumber || 'No job title',
    jobLabel: item.job.jobNumber ?? 'Standalone quote',
    amountLabel: formatMoney(item.quote.total),
    lineItemCount: item.lineItemCount,
    statusLabel: quoteStatusLabel(item.quote.status),
    statusTone: quoteStatusTone(item.quote.status),
    originLabel: item.quote.estimate_id ? 'From estimate' : item.quote.job_id ? 'From job' : 'Manual entry',
    createdLabel: formatDate(item.quote.created_at),
    expiresLabel: item.quote.valid_until ? formatDate(item.quote.valid_until) : 'No expiration',
    nextActionLabel: quoteNextActionLabel(item.quote.status),
  };
}

export function toForgeQuoteDetailModel(detail: QuoteDetail): ForgeQuoteDetailModel {
  const syntheticListItem: QuoteListItem = {
    customer: detail.customer ? { displayName: detail.customer.displayName, id: detail.customer.id } : null,
    job: detail.job
      ? {
          id: detail.job.job.id,
          jobNumber: detail.job.job.job_number,
          title: detail.job.job.title,
        }
      : {
          id: null,
          jobNumber: null,
          title: detail.quote.title?.trim() || 'Standalone quote',
        },
    lineItemCount: detail.lineItems.length,
    quote: detail.quote,
  };
  const summary = toForgeQuoteSummary(syntheticListItem);

  return {
    ...summary,
    sentLabel: detail.quote.sent_at ? formatDateTime(detail.quote.sent_at) : 'Not sent',
    viewedLabel: detail.quote.viewed_at ? formatDateTime(detail.quote.viewed_at) : 'Not viewed',
    acceptedLabel: detail.quote.accepted_at ? formatDateTime(detail.quote.accepted_at) : 'Not accepted',
    declinedLabel: detail.quote.declined_at ? formatDateTime(detail.quote.declined_at) : 'Not declined',
    customerEmail: detail.customer?.email ?? null,
    customerPhone: detail.customer?.phonePrimary ?? null,
    propertyAddress: detail.property ? formatPropertyAddress(detail.property) : null,
    quoteTypeLabel: formatEnumLabel(detail.quote.type),
    subtotalLabel: formatMoney(detail.quote.subtotal),
    discountLabel: formatMoney(detail.quote.discount_amount),
    taxLabel: formatMoney(detail.quote.tax_amount),
    totalLabel: formatMoney(detail.quote.total),
    sharePath: detail.quote.share_token ? `/q/${detail.quote.share_token}` : null,
  };
}

export function quoteStatusTone(status: QuoteStatus | string): StatusTone {
  if (status === 'accepted') return 'emerald';
  if (status === 'declined') return 'red';
  if (status === 'expired' || status === 'revised') return 'amber';
  if (status === 'sent' || status === 'viewed') return 'blue';
  return 'neutral';
}

export function formatQuoteLineTotal(lineItem: QuoteLineItemSummary): string {
  return formatMoney(lineItem.item.total_quoted);
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

function resolveQuoteTitle(item: QuoteListItem): string {
  if (item.quote.title?.trim()) return item.quote.title.trim();
  if (item.quote.quote_number?.trim()) return item.quote.quote_number.trim();
  if (item.job.title.trim()) return `Quote for ${item.job.title.trim()}`;
  if (item.job.jobNumber) return `Quote for job ${item.job.jobNumber}`;
  return 'Untitled quote';
}

function quoteStatusLabel(status: QuoteStatus | string): string {
  if (status === 'viewed') return 'Viewed';
  return formatEnumLabel(status);
}

function quoteNextActionLabel(status: QuoteStatus | string): string {
  if (status === 'draft') return 'Send quote';
  if (status === 'accepted') return 'Create job';
  if (status === 'sent' || status === 'viewed') return 'Await response';
  return 'Open quote';
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
