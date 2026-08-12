import type { RequestDetail, RequestListItem } from '@premier/db';
import type { StatusTone } from '@/components/ui/status-pill';

export type ForgeRequestFilter = 'open' | 'done' | 'all';

export interface ForgeRequestSummary {
  id: string;
  number: string;
  title: string;
  description: string;
  serviceLine: string | null;
  customerName: string;
  contactLine: string | null;
  ageLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  priorityLabel: string | null;
  priorityTone: StatusTone;
  /** What the customer reported, separate from and never mapped into internal priority. */
  customerReportedUrgencyLabel: string | null;
  nextActionLabel: string | null;
  relatedHref: string | null;
}

export interface ForgeRequestDetailModel extends ForgeRequestSummary {
  contactName: string;
  phone: string | null;
  email: string | null;
  propertyAddress: string | null;
  customerHref: string | null;
  propertyHref: string | null;
}

export function toForgeRequestSummary(item: RequestListItem, now = new Date()): ForgeRequestSummary {
  return {
    id: item.id,
    number: item.requestNumber,
    title: item.title,
    description: item.description ?? item.serviceLine ?? 'No description provided.',
    serviceLine: item.serviceLine,
    customerName: item.customer?.displayName ?? 'Unknown customer',
    contactLine: [item.customer?.phonePrimary, item.customer?.email].filter(Boolean).join(' · ') || null,
    ageLabel: formatAge(item.createdAt, now),
    statusLabel: formatEnumLabel(item.status),
    statusTone: requestStatusTone(item.status),
    priorityLabel: item.priority !== 'normal' ? formatEnumLabel(item.priority) : null,
    priorityTone: priorityTone(item.priority),
    customerReportedUrgencyLabel: item.customerReportedUrgency ? formatEnumLabel(item.customerReportedUrgency) : null,
    nextActionLabel: nextRequestActionLabel(item),
    relatedHref: item.estimateId ? `/estimates/${item.estimateId}` : item.jobId ? `/jobs/${item.jobId}` : null,
  };
}

export function toForgeRequestDetailModel(item: RequestDetail, now = new Date()): ForgeRequestDetailModel {
  const summary = toForgeRequestSummary(item, now);
  const propertyAddress = item.property
    ? [
        item.property.addressLine1,
        item.property.addressLine2,
        `${item.property.city}, ${item.property.state} ${item.property.zip}`,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  return {
    ...summary,
    contactName: item.contactName,
    phone: item.contactPhone ?? item.customer?.phonePrimary ?? null,
    email: item.contactEmail ?? item.customer?.email ?? null,
    propertyAddress,
    customerHref: item.customerId ? `/customers/${item.customerId}` : null,
    propertyHref: item.propertyId ? `/properties/${item.propertyId}` : null,
  };
}

export function requestStatusTone(status: string): StatusTone {
  if (status === 'new') return 'amber';
  if (status === 'spam') return 'red';
  if (status === 'approved' || status === 'completed') return 'emerald';
  if (status === 'reviewing' || status === 'scheduled' || status === 'in_progress' || status === 'estimate_created') return 'blue';
  return 'neutral';
}

export function priorityTone(priority: string): StatusTone {
  if (priority === 'urgent' || priority === 'emergency') return 'red';
  if (priority === 'high') return 'amber';
  return 'neutral';
}

function nextRequestActionLabel(item: Pick<RequestListItem, 'estimateId' | 'jobId' | 'status'>): string | null {
  if (item.estimateId) return 'Open estimate';
  if (item.jobId) return 'Open work order';
  if (item.status === 'new') return 'Triage request';
  return 'Review next step';
}

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatAge(value: string, now = new Date()): string {
  const created = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((now.getTime() - created) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes || 1}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
