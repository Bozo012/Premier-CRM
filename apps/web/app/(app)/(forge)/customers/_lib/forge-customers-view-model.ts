// Layer 2 adapter (Forge V1.1 Base44-exact UI rebuild) — converts real
// Forge query results (packages/db/queries/customers.ts: listCustomers) into
// the exact CustomersListViewModel/CustomerSummary shape the ported
// CustomersList presentation component expects (forge-customers-contracts.ts,
// itself ported unchanged from Base44's src/contracts/customers.ts).
import type { Customer } from '@premier/db';

import type { CustomerFilter, CustomerSummary, CustomersListViewModel } from './forge-customers-contracts';

export type CustomerPresentationStatus = CustomerSummary['status'];

export interface CustomerPropertyLink {
  customer_id: string;
  properties: { id: string; address_line_1: string; property_type: string | null } | null;
}

export interface WorkCountRow {
  customer_id: string;
  status: string;
}

const STATUS_LABELS: Record<CustomerPresentationStatus, string> = {
  active: 'Active',
  prospect: 'Prospect',
  inactive: 'Inactive',
};

/**
 * ⚠️ PRESENTATION-ONLY DERIVATION — NOT AN AUTHORITATIVE FIELD.
 *
 * `deriveCustomerPresentationStatus` approximates the Base44 presentation's
 * `active | prospect | inactive` vocabulary purely for the Customers
 * list/filter UI. It is derived on every read from two REAL, authoritative
 * fields (`customers.is_archived`, `customers.total_jobs`) — it is never
 * itself stored, and no code anywhere writes a `status` value back to the
 * `customers` table.
 *
 * Authoritative vs. derived, explicitly:
 *   - `customer.is_archived` (real, persisted, RLS/query-filtered elsewhere
 *     in the app) is the actual archived/active boundary Forge enforces.
 *   - The `active | prospect | inactive` value this function returns is a
 *     Base44-presentation-compatible LABEL computed from that real field
 *     plus `total_jobs`, entirely for this list UI's benefit.
 *
 * Forge's `customers` table has no persisted lifecycle-status column at
 * all — the query layer instead filters lists by `archetype`
 * (residential_one_off/residential_repeat/commercial_contract/etc.), which
 * is a DIFFERENT axis (service pattern, not lifecycle stage) and cannot be
 * mapped to Base44's status vocabulary. A real lifecycle-status field would
 * need a schema addition — intentionally NOT made in this PR.
 *
 * MUST NOT be used to drive: permissions, capability checks, workflow-state
 * transitions, RPC/query filters, automation-rule conditions, or RLS. If
 * any of those ever need a customer's lifecycle state, they must read
 * `is_archived` (or a future real backend field) directly — never this
 * function's return value. This function has exactly one caller path:
 * building `CustomerSummary.status`/`statusLabel` for display and for this
 * page's client-side filter tabs.
 *
 * Presentation contract: `CustomerSummary.status`/`statusLabel` render as
 * plain read-only text/filter-tab labels (see CustomersList) — there is no
 * status-editing control anywhere, and none should be added until a real,
 * authoritative customer-lifecycle backend contract exists to back it.
 *
 * Derivation rule (unchanged behavior from the pre-rebuild page.tsx this
 * replaced):
 *   - is_archived -> "inactive"
 *   - not archived AND total_jobs > 0 -> "active"
 *   - not archived AND total_jobs === 0 (or null) -> "prospect"
 */
export function deriveCustomerPresentationStatus(
  customer: Pick<Customer, 'is_archived' | 'total_jobs'>
): CustomerPresentationStatus {
  if (customer.is_archived) return 'inactive';
  return (customer.total_jobs ?? 0) > 0 ? 'active' : 'prospect';
}

export function resolveCustomerDisplayName(customer: Pick<Customer, 'display_name' | 'company_name' | 'first_name' | 'last_name'>): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
}

export function formatRelativeActivity(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'No activity yet';
  const deltaMs = now.getTime() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(deltaMs / 3_600_000));
  if (hours < 1) return 'Now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/**
 * Maps one Forge `customers` row (plus its joined properties / open-work
 * counts, fetched separately since `listCustomers` doesn't embed them) to
 * the CustomerSummary shape CustomersList renders.
 */
export function toCustomerSummary(
  customer: Customer,
  propertyLinks: CustomerPropertyLink[],
  requestRows: WorkCountRow[],
  estimateRows: WorkCountRow[],
  now: Date = new Date()
): CustomerSummary {
  const properties = propertyLinks.flatMap((link) => {
    if (!link.properties) return [];
    return [
      {
        id: link.properties.id,
        name: link.properties.address_line_1,
        address: link.properties.address_line_1,
        type: link.properties.property_type?.toLowerCase().includes('commercial') ? ('commercial' as const) : ('residential' as const),
        typeLabel: link.properties.property_type?.toLowerCase().includes('commercial') ? 'Commercial' : 'Residential',
      },
    ];
  });

  const openRequests = requestRows.filter((row) => !['completed', 'cancelled', 'spam', 'estimate_created'].includes(row.status)).length;
  const openEstimates = estimateRows.filter((row) => !['declined', 'expired', 'converted'].includes(row.status)).length;
  const status = deriveCustomerPresentationStatus(customer);

  // "Next action" is Base44 presentation copy describing the single most
  // relevant next step for staff — Forge has no equivalent computed field
  // (unlike Requests' nextRequestActionLabel), so this is a simple,
  // intentionally coarse heuristic scoped to what's already fetched here.
  // A richer, workflow-aware next-action engine is out of scope for this PR
  // (intentionally deferred — see the Customers route report).
  const { nextActionLabel, nextActionId } = deriveNextAction({ openRequests, openEstimates, status });

  return {
    id: customer.id,
    name: resolveCustomerDisplayName(customer),
    status,
    statusLabel: STATUS_LABELS[status],
    phone: customer.phone_primary ?? 'No phone',
    email: customer.email ?? 'No email',
    properties,
    openRequests,
    openEstimates,
    lastActivityLabel: formatRelativeActivity(customer.last_contact_at ?? customer.updated_at ?? customer.created_at, now),
    nextActionLabel,
    nextActionId,
    availableActions: [{ id: 'view-customer', label: 'View customer', kind: 'primary' }],
  };
}

function deriveNextAction({
  openRequests,
  openEstimates,
  status,
}: {
  openRequests: number;
  openEstimates: number;
  status: CustomerPresentationStatus;
}): { nextActionLabel: string; nextActionId: string } {
  if (openRequests > 0) return { nextActionLabel: 'Triage open request', nextActionId: 'triage-request' };
  if (openEstimates > 0) return { nextActionLabel: 'Follow up on open estimate', nextActionId: 'follow-up-estimate' };
  if (status === 'prospect') return { nextActionLabel: 'Create an estimate', nextActionId: 'create-estimate' };
  return { nextActionLabel: 'View customer', nextActionId: 'view-customer' };
}

const FILTER_ORDER: { id: 'all' | CustomerPresentationStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'prospect', label: 'Prospect' },
  { id: 'inactive', label: 'Inactive' },
];

export function buildCustomerFilters(customers: CustomerSummary[]): CustomerFilter[] {
  return FILTER_ORDER.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: filter.id === 'all' ? customers.length : customers.filter((c) => c.status === filter.id).length,
  }));
}

/**
 * Full list view-model builder. `search` has already been applied by the
 * real `listCustomers` query (server-side `ilike` on `display_name`) — this
 * function does not re-filter by name. `statusFilter` is applied here
 * because there is no persisted status column to push into the query (see
 * `deriveCustomerPresentationStatus`) — filter counts therefore reflect only the fetched
 * page (bounded by `listCustomers`'s `limit`), not the org's full customer
 * set, exactly as the pre-existing (pre-rebuild) page.tsx already behaved.
 */
export function toCustomersListViewModel(args: {
  customers: CustomerSummary[];
  searchQuery: string;
  statusFilter: 'all' | CustomerPresentationStatus;
  error?: { title: string; message: string } | null;
}): CustomersListViewModel {
  const { customers, searchQuery, statusFilter, error = null } = args;
  const filtered = statusFilter === 'all' ? customers : customers.filter((c) => c.status === statusFilter);

  return {
    customers: filtered,
    searchQuery,
    activeFilter: statusFilter,
    filters: buildCustomerFilters(customers),
    isLoading: false,
    error,
  };
}
