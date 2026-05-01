import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

type Customer = Database['public']['Tables']['customers']['Row'];
type CustomerProperty = Database['public']['Tables']['customer_properties']['Row'];
type Property = Database['public']['Tables']['properties']['Row'];

export interface PropertyListCustomerSummary {
  displayName: string;
  id: string;
  isPrimary: boolean | null;
  relationship: string | null;
}

export interface PropertyListItem {
  customerCount: number;
  customers: PropertyListCustomerSummary[];
  duplicateCount: number;
  property: Property;
}

export interface PropertyListPage {
  properties: PropertyListItem[];
  total: number;
}

export interface PropertyMemoryOwner {
  customer: Customer;
  is_primary: boolean | null;
  relationship: string | null;
}

export interface PropertyMemoryJob {
  category: string | null;
  completed_at: string | null;
  description: string | null;
  id: string;
  status: Database['public']['Enums']['job_status'];
  title: string;
  total: number | null;
}

export interface PropertyMemoryPhoto {
  caption: string | null;
  job_id: string | null;
  occurred_at: string | null;
  url: string | null;
}

export interface PropertyMemoryNote {
  content_preview: string | null;
  occurred_at: string | null;
  summary: string | null;
  title: string | null;
  type: Database['public']['Enums']['vault_item_type'];
}

export interface PropertyGeofence {
  auto_generated: boolean | null;
  id: string;
  is_active: boolean | null;
  label: string;
  min_absence_seconds: number | null;
  min_dwell_seconds: number | null;
  notes: string | null;
  radius_meters: number;
}

export interface PropertyMemory {
  allJobs: PropertyMemoryJob[];
  allOwners: PropertyMemoryOwner[];
  geofence: PropertyGeofence | null;
  notesAndRecordings: PropertyMemoryNote[];
  property: Property;
  recentPhotos: PropertyMemoryPhoto[];
}

interface PropertyMemoryRpcPayload {
  all_jobs?: PropertyMemoryJob[] | null;
  all_owners?: PropertyMemoryOwner[] | null;
  notes_and_recordings?: PropertyMemoryNote[] | null;
  property?: Property | null;
  recent_photos?: PropertyMemoryPhoto[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizePropertyAddressKey(
  property: Pick<Property, 'address_line_1' | 'city' | 'state' | 'zip'>
): string {
  return [
    normalizeText(property.address_line_1),
    normalizeText(property.city),
    normalizeText(property.state),
    normalizeText(property.zip),
  ].join('|');
}

function resolveCustomerDisplayName(
  customer: Pick<
    Customer,
    'company_name' | 'display_name' | 'first_name' | 'last_name'
  >
): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Unnamed customer';
}

interface PropertyCustomerLink
  extends Pick<
    CustomerProperty,
    'customer_id' | 'is_primary' | 'property_id' | 'relationship'
  > {
  customers:
    | Pick<
        Customer,
        'company_name' | 'display_name' | 'first_name' | 'id' | 'last_name'
      >
    | null;
}

export async function listProperties(
  client: DbClient,
  args: { limit: number; offset: number; orgId: string; search?: string }
): Promise<Result<PropertyListPage>> {
  const { limit, offset, orgId, search } = args;

  let query = client
    .from('properties')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('address_line_1', { ascending: true })
    .order('city', { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    const escaped = escapeLikePattern(search);
    query = query.or(
      [
        `address_line_1.ilike.%${escaped}%`,
        `address_line_2.ilike.%${escaped}%`,
        `city.ilike.%${escaped}%`,
        `state.ilike.%${escaped}%`,
        `zip.ilike.%${escaped}%`,
      ].join(',')
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const properties = data ?? [];

  if (properties.length === 0) {
    return ok({
      properties: [],
      total: count ?? 0,
    });
  }

  const propertyIds = properties.map((property) => property.id);
  const { data: linksRaw, error: linksError } = await client
    .from('customer_properties')
    .select(
      'property_id, customer_id, is_primary, relationship, customers(id, display_name, company_name, first_name, last_name)'
    )
    .in('property_id', propertyIds);

  if (linksError) {
    return err(ErrorCode.DB_ERROR, linksError.message);
  }

  const links = (linksRaw ?? []) as PropertyCustomerLink[];
  const linksByPropertyId = new Map<string, PropertyCustomerLink[]>();

  for (const link of links) {
    const propertyLinks = linksByPropertyId.get(link.property_id) ?? [];
    propertyLinks.push(link);
    linksByPropertyId.set(link.property_id, propertyLinks);
  }

  const groupedProperties = new Map<
    string,
    { customerLinks: PropertyCustomerLink[]; properties: Property[] }
  >();

  for (const property of properties) {
    const key = normalizePropertyAddressKey(property);
    const group = groupedProperties.get(key) ?? {
      customerLinks: [],
      properties: [],
    };

    group.properties.push(property);
    group.customerLinks.push(...(linksByPropertyId.get(property.id) ?? []));
    groupedProperties.set(key, group);
  }

  const items: PropertyListItem[] = Array.from(groupedProperties.values()).flatMap(
    (group) => {
      const canonicalProperty =
        group.properties.find((property) => Boolean(property.jobber_id)) ??
        group.properties[0] ??
        null;

      if (!canonicalProperty) {
        return [];
      }

      const customersById = new Map<string, PropertyListCustomerSummary>();

      for (const link of group.customerLinks) {
        if (!link.customers) continue;

        const existing = customersById.get(link.customer_id);
        const nextValue: PropertyListCustomerSummary = {
          displayName: resolveCustomerDisplayName(link.customers),
          id: link.customer_id,
          isPrimary: existing?.isPrimary ?? link.is_primary,
          relationship: existing?.relationship ?? link.relationship,
        };

        if (existing) {
          nextValue.isPrimary = existing.isPrimary || link.is_primary;
          nextValue.relationship = existing.relationship ?? link.relationship;
        }

        customersById.set(link.customer_id, nextValue);
      }

      const customerLinks = Array.from(customersById.values()).sort(
        (left, right) =>
          Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
      );

      return [
        {
          customerCount: customerLinks.length,
          customers: customerLinks,
          duplicateCount: group.properties.length,
          property: canonicalProperty,
        },
      ];
    }
  );

  return ok({
    properties: items,
    total: items.length,
  });
}

export async function getPropertyMemory(
  client: DbClient,
  args: { orgId: string; propertyId: string }
): Promise<Result<PropertyMemory>> {
  const { data, error } = await client.rpc('get_property_memory', {
    search_org_id: args.orgId,
    search_property_id: args.propertyId,
  });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!isRecord(data)) {
    return err(ErrorCode.NOT_FOUND, `Property ${args.propertyId} not found`);
  }

  const payload = data as PropertyMemoryRpcPayload;

  if (!payload.property || !isRecord(payload.property)) {
    return err(ErrorCode.NOT_FOUND, `Property ${args.propertyId} not found`);
  }

  const { data: geofence, error: geofenceError } = await client
    .from('geofences')
    .select(
      'id, label, radius_meters, min_dwell_seconds, min_absence_seconds, is_active, auto_generated, notes'
    )
    .eq('property_id', args.propertyId)
    .eq('type', 'property')
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (geofenceError) {
    return err(ErrorCode.DB_ERROR, geofenceError.message);
  }

  return ok({
    allJobs: normalizeArray(payload.all_jobs),
    allOwners: normalizeArray(payload.all_owners),
    geofence: geofence ?? null,
    notesAndRecordings: normalizeArray(payload.notes_and_recordings),
    property: payload.property,
    recentPhotos: normalizeArray(payload.recent_photos),
  });
}
