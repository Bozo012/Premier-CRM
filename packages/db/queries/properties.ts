import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

type Customer = Database['public']['Tables']['customers']['Row'];
type Property = Database['public']['Tables']['properties']['Row'];

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
