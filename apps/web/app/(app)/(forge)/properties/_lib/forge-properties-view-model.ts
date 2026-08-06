// Layer 2 adapter (Forge V1.1 Base44-exact UI rebuild) — converts real
// Forge query results (packages/db/queries/properties.ts: listProperties,
// plus service_requests/jobs joined by property_id, mirroring
// apps/web/app/(app)/(legacy)/properties/page.tsx's pre-existing logic
// exactly) into the PropertyListModel/PropertySummary shape the ported
// PropertiesList presentation component expects.
import type { PropertyListItem } from '@premier/db';

import type { DetailTone } from '@/components/forge-shell/recordDetail.types';

import type { PropertyListFilter, PropertyListModel, PropertySummary } from './forge-properties-contracts';

export type PropertyStatus = PropertySummary['status'];

export interface PropertyWorkRow {
  property_id: string | null;
  status: string;
}

export interface PropertyJobRow extends PropertyWorkRow {
  scheduled_start: string | null;
  title: string;
}

const STATUS_LABELS: Record<PropertyStatus, string> = {
  active: 'Active',
  onboarding: 'Onboarding',
  inactive: 'Inactive',
};

const STATUS_TONE: Record<PropertyStatus, DetailTone> = {
  active: 'success',
  onboarding: 'info',
  inactive: 'neutral',
};

/**
 * ⚠️ PRESENTATION-ONLY DERIVATION — NOT AN AUTHORITATIVE FIELD.
 *
 * Forge's `properties` table has no persisted lifecycle-status column.
 * This reuses the exact derivation the pre-existing (pre-rebuild)
 * (legacy)/properties/page.tsx already used: a property with zero linked
 * customers is "inactive"; a property carried over from the Jobber import
 * (`jobber_id` present) is "active"; anything else (manually created,
 * no customer yet) is "onboarding". Both `customerCount` and `jobber_id`
 * are real, persisted fields — only the three-way label is derived, purely
 * for this list UI. MUST NOT drive permissions, RLS, or workflow state.
 */
export function derivePropertyStatus(item: PropertyListItem): PropertyStatus {
  if (item.customerCount === 0) return 'inactive';
  return item.property.jobber_id ? 'active' : 'onboarding';
}

export function derivePropertyType(item: PropertyListItem): 'residential' | 'commercial' {
  return item.property.property_type?.toLowerCase().includes('commercial') ? 'commercial' : 'residential';
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function formatRelativeUpdate(value: string, now: Date = new Date()): string {
  const deltaMs = now.getTime() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(deltaMs / 3_600_000));
  if (hours < 1) return 'Now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function toPropertySummary(item: PropertyListItem, requests: PropertyWorkRow[], jobs: PropertyJobRow[], now: Date = new Date()): PropertySummary {
  const propertyId = item.property.id;
  const propertyRequests = requests.filter((row) => row.property_id === propertyId);
  const propertyJobs = jobs.filter((row) => row.property_id === propertyId);
  const openRequests = propertyRequests.filter((row) => !['completed', 'cancelled', 'spam', 'estimate_created'].includes(row.status)).length;
  const activeJobs = propertyJobs.filter((row) => !['completed', 'invoiced', 'paid', 'cancelled'].includes(row.status)).length;
  const nextJob = propertyJobs
    .filter((row) => row.scheduled_start && new Date(row.scheduled_start).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.scheduled_start!).getTime() - new Date(right.scheduled_start!).getTime())[0];

  const status = derivePropertyStatus(item);
  const type = derivePropertyType(item);
  const primaryCustomer = item.customers[0];

  return {
    id: propertyId,
    name: item.property.address_line_1,
    address: `${item.property.city}, ${item.property.state} ${item.property.zip}`,
    customerId: primaryCustomer?.id ?? null,
    customerName: primaryCustomer?.displayName ?? 'No customer',
    type,
    typeLabel: type === 'commercial' ? 'Commercial' : 'Residential',
    status,
    statusLabel: STATUS_LABELS[status],
    statusTone: STATUS_TONE[status],
    openRequests,
    activeJobs,
    upcomingVisitLabel: nextJob ? `${formatShortDate(nextJob.scheduled_start!)} · ${nextJob.title}` : 'Not scheduled',
    updatedLabel: formatRelativeUpdate(item.property.updated_at, now),
    attentionLabel: item.property.access_notes ? item.property.access_notes : item.property.gate_code ? 'Gate or access note on file' : undefined,
  };
}

const STATUS_FILTER_ORDER: { id: 'all' | PropertyStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'inactive', label: 'Inactive' },
];

const TYPE_FILTER_ORDER: { id: 'all' | PropertySummary['type']; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'residential', label: 'Residential' },
  { id: 'commercial', label: 'Commercial' },
];

export function buildStatusFilters(properties: PropertySummary[]): PropertyListFilter[] {
  return STATUS_FILTER_ORDER.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: filter.id === 'all' ? properties.length : properties.filter((p) => p.status === filter.id).length,
  }));
}

export function buildTypeFilters(properties: PropertySummary[]): PropertyListFilter[] {
  return TYPE_FILTER_ORDER.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: filter.id === 'all' ? properties.length : properties.filter((p) => p.type === filter.id).length,
  }));
}

/**
 * Full list view-model builder. `search` has already been applied by the
 * real `listProperties` query (server-side `ilike` across address/city/
 * state/zip) — this function does not re-filter by text. `status`/`type`
 * are applied here as post-fetch filters over the bounded page, exactly as
 * the pre-existing (legacy) page.tsx already behaved (no persisted status
 * column to push server-side).
 */
export function toPropertiesListViewModel(args: {
  properties: PropertySummary[];
  searchQuery: string;
  statusFilter: 'all' | PropertyStatus;
  typeFilter: 'all' | PropertySummary['type'];
  canCreate: boolean;
  error?: string | null;
}): PropertyListModel {
  const { properties, searchQuery, statusFilter, typeFilter, canCreate, error = null } = args;
  const filtered = properties.filter((p) => (statusFilter === 'all' || p.status === statusFilter) && (typeFilter === 'all' || p.type === typeFilter));

  return {
    properties: filtered,
    searchQuery,
    statusFilters: buildStatusFilters(properties),
    activeStatus: statusFilter,
    typeFilters: buildTypeFilters(properties),
    activeType: typeFilter,
    totalLabel: `${filtered.length} of ${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`,
    canCreate,
    isLoading: false,
    error,
  };
}
