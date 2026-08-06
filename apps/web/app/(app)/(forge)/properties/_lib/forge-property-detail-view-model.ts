// Layer 2 adapter — maps a real PropertyMemory payload
// (packages/db/queries/properties.ts:getPropertyMemory) into the generic
// RecordDetailModel shape RecordDetailView renders
// (apps/web/components/forge-shell/recordDetail.types.ts), following the
// exact pattern of ../../customers/_lib/forge-customer-detail-view-model.ts.
//
// Base44's PropertyDetailRoute also renders through the generic
// RecordDetailView kit (see src/fixtures/recordDetails/propertyDetails.ts)
// rather than a bespoke layout, so this route follows the same generic
// mapping the Customers slice established, keeping the section/field
// breakdown Base44 used (access & safety, property profile, owners,
// job history, photos, notes) wherever real data supports it.
//
// Gaps vs. Base44's fixture (documented in the report, NOT fabricated
// here): occupancy, structured pets/parking-as-a-field/lockbox codes,
// structured hazard taxonomy (Forge stores `hazards: string[]` free text,
// which IS real and is used), a dedicated per-property activity timeline
// (no backend source), and photo/document detail routes (recentPhotos only
// carries a raw storage URL, not a first-class /site-photos/:id record).
import type { PropertyMemory } from '@premier/db';

import type { DetailField, DetailSection, DetailTone, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

function resolveCustomerDisplayName(customer: { company_name: string | null; display_name: string | null; first_name: string | null; last_name: string | null }): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
}

function formatAddress(property: { address_line_1: string; address_line_2: string | null; city: string; state: string; zip: string }): string {
  return [property.address_line_1, property.address_line_2, `${property.city}, ${property.state} ${property.zip}`].filter(Boolean).join(', ');
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not available';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function jobStatusTone(status: string): DetailTone {
  if (status === 'completed') return 'success';
  if (status === 'in_progress' || status === 'scheduled') return 'info';
  if (status === 'cancelled') return 'neutral';
  return 'neutral';
}

export function toPropertyDetailModel(data: PropertyMemory): RecordDetailModel {
  const { property, allOwners, allJobs, recentPhotos, notesAndRecordings, geofence } = data;
  const primaryOwner = allOwners.find((o) => o.is_primary) ?? allOwners[0] ?? null;
  const type = property.property_type?.toLowerCase().includes('commercial') ? 'Commercial' : 'Residential';
  const openJobs = allJobs.filter((job) => !['completed', 'invoiced', 'paid', 'cancelled'].includes(job.status));
  const completedJobs = allJobs.filter((job) => job.status === 'completed');
  const hazardsLabel = property.hazards && property.hazards.length > 0 ? property.hazards.join(', ') : 'None recorded';

  const profileFields: DetailField[] = [
    { label: 'Full address', value: formatAddress(property) },
    { label: 'Property type', value: property.property_type ?? 'Not set' },
    { label: 'Year built', value: property.year_built ? String(property.year_built) : 'Not set' },
    { label: 'Square footage', value: property.square_footage ? `${new Intl.NumberFormat('en-US').format(property.square_footage)} sq ft` : 'Not set' },
    { label: 'Notes', value: property.notes?.trim() || 'Not set' },
  ];

  // Access/sensitive info is marked visibility: 'internal' — never rendered
  // through any customer-portal-reachable component; this adapter is only
  // ever invoked from the server-fetched staff detail page.
  const accessFields: DetailField[] = [
    { label: 'Gate code', value: property.gate_code?.trim() || 'Not set', visibility: 'internal' },
    { label: 'Access notes', value: property.access_notes?.trim() || 'Not set', visibility: 'internal' },
    { label: 'Parking notes', value: property.parking_notes?.trim() || 'Not set', visibility: 'internal' },
    { label: 'Known hazards', value: hazardsLabel, tone: property.hazards?.length ? 'warning' : 'neutral', visibility: 'internal' },
    { label: 'Auto tracking', value: property.hide_from_auto_tracking ? 'Hidden' : 'Enabled', visibility: 'internal' },
    { label: 'Geofence radius', value: geofence ? `${Math.round(geofence.radius_meters)}m` : property.geofence_radius_m ? `${Math.round(property.geofence_radius_m)}m` : 'Not configured', visibility: 'internal' },
  ];

  const ownersSection: DetailSection = {
    kind: 'related',
    id: 'owners',
    title: 'Owners & relationships',
    emptyMessage: 'No linked owners or managers yet.',
    items: allOwners.map((owner) => ({
      id: owner.customer.id,
      label: resolveCustomerDisplayName(owner.customer),
      sublabel: [owner.relationship || 'owner', owner.is_primary ? 'Primary' : null].filter(Boolean).join(' · '),
      route: `/customers/${owner.customer.id}`,
      recordType: 'customer',
    })),
  };

  const jobsSection: DetailSection = {
    kind: 'related',
    id: 'jobs',
    title: 'Job history',
    emptyMessage: 'No jobs tied to this property yet.',
    items: allJobs.map((job) => ({
      id: job.id,
      label: job.title,
      sublabel: [formatEnumLabel(job.status), job.category, formatMoney(job.total)].filter(Boolean).join(' · '),
      badge: formatEnumLabel(job.status),
      badgeTone: jobStatusTone(job.status),
      route: `/jobs/${job.id}`,
      recordType: 'job',
    })),
  };

  // No dedicated per-photo/per-note detail route exists (recentPhotos only
  // carries a raw storage URL; vault items have no /vault/:id staff route
  // wired here) — these sections stay unlinked (route omitted) rather than
  // pointing at a route that would 404.
  const photosSection: DetailSection = {
    kind: 'related',
    id: 'photos',
    title: 'Recent photos',
    emptyMessage: 'No property photos yet.',
    items: recentPhotos.map((photo, index) => ({
      id: `${photo.url ?? 'photo'}-${index}`,
      label: photo.caption?.trim() || 'Untitled photo',
      sublabel: [formatDate(photo.occurred_at), photo.job_id ? 'Linked to a job' : null].filter(Boolean).join(' · '),
      recordType: 'photo',
    })),
  };

  const sections: DetailSection[] = [
    { kind: 'fields', id: 'profile', title: 'Property profile', fields: profileFields },
    { kind: 'fields', id: 'access', title: 'Access & safety', fields: accessFields, note: 'Access and hazard details are internal-only and never appear on any customer-portal surface.' },
    ownersSection,
    jobsSection,
    photosSection,
  ];

  if (notesAndRecordings.length > 0) {
    sections.push({
      kind: 'notes',
      id: 'notes',
      title: 'Notes & recordings',
      notes: notesAndRecordings.map((item, index) => ({
        id: `${item.type}-${item.occurred_at ?? index}`,
        author: 'Staff',
        timestamp: formatDate(item.occurred_at),
        // Forge vault items have no per-item visibility flag surfaced by
        // get_property_memory() — treated as internal (never rendered on a
        // customer-facing surface) until a real visibility field exists.
        visibility: 'internal',
        body: [item.title?.trim() || formatEnumLabel(item.type), item.summary?.trim(), item.content_preview?.trim()].filter(Boolean).join(' — '),
      })),
    });
  }

  return {
    recordType: 'Property',
    identity: `PROP-${property.id.slice(0, 8).toUpperCase()}`,
    title: property.address_line_1,
    statusLabel: allOwners.length === 0 ? 'No customer linked' : type,
    statusTone: allOwners.length === 0 ? 'neutral' : 'info',
    backLabel: primaryOwner ? 'Back to customer' : 'Back to properties',
    contextChips: [
      ...(primaryOwner ? [{ id: primaryOwner.customer.id, label: resolveCustomerDisplayName(primaryOwner.customer), route: `/customers/${primaryOwner.customer.id}` }] : []),
      { id: 'type', label: type },
    ],
    summaryTiles: [
      { id: 'owners', label: 'Owners', value: String(allOwners.length) },
      { id: 'open-jobs', label: 'Open jobs', value: String(openJobs.length), tone: openJobs.length > 0 ? 'info' : 'neutral' },
      { id: 'completed-jobs', label: 'Completed jobs', value: String(completedJobs.length) },
      { id: 'photos', label: 'Recent photos', value: String(recentPhotos.length) },
    ],
    warnings: property.hazards?.length ? [`Known hazards on file: ${hazardsLabel}`] : undefined,
    // No real property-scoped "edit"/"create request"/"schedule visit"/
    // "archive" action or route exists yet (verified: createPropertyForCustomer
    // is the only property-write path, reachable only from Customer Detail).
    // Intentionally not wired — see the gap report rather than a fake
    // success toast.
    primaryAction: null,
    secondaryActions: [],
    sections,
  };
}
