// Adapted from Base44 Forge-Base44-UX @ 497d0693 — src/contracts/properties.ts.
// Deviation from a byte-for-byte port: `occupancyLabel` was DROPPED from
// PropertySummary. Base44's fixture hard-codes values like "Owner occupied"
// / "Unoccupied yard" but Forge's `properties` table (packages/db/types.ts)
// has no occupancy column anywhere — fabricating that value here would
// violate the no-fabrication rule this PR operates under. See the gap
// report (docs/ux/base44-exact-properties-team-report.md) — "occupancy" is
// tracked as backend-completion-required, not silently rendered as fake
// text. Everything else matches the exact shape the ported
// PropertiesList/PropertiesTable/PropertyCard presentation expects.
import type { DetailTone } from '@/components/forge-shell/recordDetail.types';

export interface PropertySummary {
  id: string;
  name: string;
  address: string;
  customerId: string | null;
  customerName: string;
  type: 'residential' | 'commercial';
  typeLabel: string;
  status: 'active' | 'inactive' | 'onboarding';
  statusLabel: string;
  statusTone: DetailTone;
  openRequests: number;
  activeJobs: number;
  upcomingVisitLabel: string;
  updatedLabel: string;
  /** Supplied attention flag, e.g. an access issue needing follow-up. */
  attentionLabel?: string;
}

export interface PropertyListFilter {
  id: string;
  label: string;
  count?: number;
}

export interface PropertyListModel {
  properties: PropertySummary[];
  searchQuery: string;
  statusFilters: PropertyListFilter[];
  activeStatus: string;
  typeFilters: PropertyListFilter[];
  activeType: string;
  totalLabel: string;
  canCreate: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface PropertyListCallbacks {
  onOpenProperty: (propertyId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onSearch: (query: string) => void;
  onStatusFilter: (id: string) => void;
  onTypeFilter: (id: string) => void;
  onOpenAction: (actionId: string) => void;
}
