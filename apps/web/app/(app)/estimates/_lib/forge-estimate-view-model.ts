import type {
  EstimateDetail,
  EstimateLineItem,
  EstimateLinkedQuote,
  EstimateListItem,
  EstimateStatus,
} from '@premier/db';
import type { StatusTone } from '@/components/ui/status-pill';

export type ForgeEstimateFilter = 'active' | 'all';

export interface ForgeEstimateSummary {
  id: string;
  number: string;
  title: string;
  customerName: string;
  propertyName: string;
  propertyAddress: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  originLabel: string;
  updatedLabel: string;
  amountLabel: string;
  nextActionLabel: string;
}

export interface ForgeEstimateDetailModel extends ForgeEstimateSummary {
  createdLabel: string;
  createdByLabel: string | null;
  description: string | null;
  sourceRequestHref: string | null;
  sourceSiteVisitHref: string | null;
  convertedJobHref: string | null;
  convertedLabel: string | null;
  pricingReviewLabel: string;
  pricingReviewTone: StatusTone;
  total: number;
}

export function toForgeEstimateSummary(
  item: EstimateListItem,
  lineItems: EstimateLineItem[] = []
): ForgeEstimateSummary {
  const address = formatEstimateAddress(item.property);
  return {
    id: item.id,
    number: item.estimateNumber,
    title: item.title.trim() || item.estimateNumber,
    customerName: item.customer?.displayName ?? 'Unknown customer',
    propertyName: item.property?.addressLine1 ?? 'No property linked',
    propertyAddress: address,
    statusLabel: estimateStatusLabel(item.status),
    statusTone: estimateStatusTone(item.status),
    originLabel: estimateOriginLabel(item),
    updatedLabel: formatDate(item.updatedAt),
    amountLabel: formatMoney(sumEstimateLineItems(lineItems)),
    nextActionLabel: estimateNextActionLabel(item),
  };
}

export function toForgeEstimateDetailModel(
  estimate: EstimateDetail,
  lineItems: EstimateLineItem[],
  quotes: EstimateLinkedQuote[]
): ForgeEstimateDetailModel {
  const summary = toForgeEstimateSummary(estimate, lineItems);
  const pricingReview = estimatePricingReviewState(estimate);

  return {
    ...summary,
    createdLabel: formatDate(estimate.createdAt),
    createdByLabel: estimate.createdByName,
    description: estimate.description?.trim() || null,
    sourceRequestHref: estimate.serviceRequestId ? `/requests/${estimate.serviceRequestId}` : null,
    sourceSiteVisitHref: estimate.sourceSiteVisitId ? `/site-visits/${estimate.sourceSiteVisitId}` : null,
    convertedJobHref: estimate.convertedJobId ? `/jobs/${estimate.convertedJobId}` : null,
    convertedLabel: estimate.convertedAt ? formatDate(estimate.convertedAt) : null,
    pricingReviewLabel: pricingReview.label,
    pricingReviewTone: pricingReview.tone,
    total: quotes[0]?.total ?? sumEstimateLineItems(lineItems),
  };
}

export function estimateStatusTone(status: EstimateStatus): StatusTone {
  if (status === 'accepted' || status === 'converted') return 'emerald';
  if (status === 'declined' || status === 'expired') return 'red';
  if (status === 'site_visit_scheduled' || status === 'site_visit_complete' || status === 'quoted') {
    return 'blue';
  }
  return 'neutral';
}

export function estimatePricingReviewState(
  estimate: Pick<EstimateDetail, 'pricingReviewedAt' | 'pricingReviewStatus'>
): { label: string; tone: StatusTone } {
  if (estimate.pricingReviewedAt) return { label: 'Pricing approved', tone: 'emerald' };
  if (estimate.pricingReviewStatus === 'pending_review') return { label: 'Pending review', tone: 'amber' };
  if (estimate.pricingReviewStatus === 'changes_requested') return { label: 'Changes requested', tone: 'red' };
  return { label: 'Not submitted', tone: 'neutral' };
}

export function sumEstimateLineItems(lineItems: EstimateLineItem[]): number {
  return lineItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
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

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function estimateStatusLabel(status: EstimateStatus): string {
  const labels: Record<EstimateStatus, string> = {
    accepted: 'Accepted',
    converted: 'Converted',
    declined: 'Declined',
    draft: 'Draft',
    expired: 'Expired',
    quoted: 'Quoted',
    site_visit_complete: 'Site visit complete',
    site_visit_scheduled: 'Site visit scheduled',
  };
  return labels[status] ?? formatEnumLabel(status);
}

function estimateOriginLabel(item: Pick<EstimateListItem, 'serviceRequestId' | 'siteVisitAt'>): string {
  if (item.siteVisitAt) return 'From site visit';
  if (item.serviceRequestId) return 'From request';
  return 'Manual entry';
}

function estimateNextActionLabel(item: Pick<EstimateListItem, 'convertedJobId' | 'status'>): string {
  if (item.convertedJobId) return 'Open job';
  if (item.status === 'draft') return 'Review pricing';
  if (item.status === 'quoted') return 'Open quote';
  if (item.status === 'accepted') return 'Create job';
  return 'Open estimate';
}

function formatEstimateAddress(
  property: Pick<NonNullable<EstimateListItem['property']>, 'addressLine1' | 'city' | 'state' | 'zip'> | null
): string | null {
  if (!property) return null;
  return `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;
}
