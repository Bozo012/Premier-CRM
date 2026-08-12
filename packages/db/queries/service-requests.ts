import type { ServiceRequestPayload } from '@premier/shared';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

type ServiceRequestSource = Database['public']['Enums']['service_request_source'];

export interface CreateServiceRequestResult {
  serviceRequestId: string;
  requestNumber: string | null;
  customerId: string;
  propertyId: string;
  dedupedCustomer: boolean;
  dedupedProperty: boolean;
}

export interface CreatePortalServiceRequestResult {
  serviceRequestId: string;
  requestNumber: string | null;
  status: string;
  submittedAt: string;
}

// Mirrors public.service_request_customer_urgency
// (20260813020000_portal_customer_reported_urgency.sql). Declared as a local
// literal union rather than importing from Database['public']['Enums'] since
// packages/db/types.ts is regenerated from the live schema and this type is
// needed before that regeneration runs.
export type CustomerReportedUrgency = 'routine' | 'soon' | 'urgent';

function normalizePhoneForLookup(phone: string): string {
  return phone.replace(/\D+/g, '').slice(-10);
}

function splitName(name: string): { first: string | null; last: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return {
    first: parts.slice(0, -1).join(' '),
    last: parts[parts.length - 1] ?? null,
  };
}

function normalizeAddressPart(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function propertyNotes(payload: ServiceRequestPayload): string | null {
  const lines = [
    payload.access_notes ? `Access notes from web request: ${payload.access_notes}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}


export async function createServiceRequest(
  client: DbClient,
  args: { orgId: string; payload: ServiceRequestPayload; source?: ServiceRequestSource }
): Promise<Result<CreateServiceRequestResult>> {
  const { orgId, payload, source = 'website' } = args;
  const normalizedPhone = payload.phone
    ? normalizePhoneForLookup(payload.phone)
    : null;

  let customerId: string | null = null;
  let dedupedCustomer = false;

  if (payload.email) {
    const { data, error } = await client
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', payload.email)
      .limit(1)
      .maybeSingle();

    if (error) return err(ErrorCode.DB_ERROR, error.message);
    if (data?.id) {
      customerId = data.id;
      dedupedCustomer = true;
    }
  }

  if (!customerId && normalizedPhone) {
    const { data, error } = await client
      .from('customers')
      .select('id, phone_primary')
      .eq('org_id', orgId)
      .not('phone_primary', 'is', null)
      .limit(100);

    if (error) return err(ErrorCode.DB_ERROR, error.message);

    const match = data?.find((row) => {
      if (!row.phone_primary) return false;
      return normalizePhoneForLookup(row.phone_primary) === normalizedPhone;
    });

    if (match) {
      customerId = match.id;
      dedupedCustomer = true;
    }
  }

  if (!customerId) {
    const { first, last } = splitName(payload.name);
    const { data, error } = await client
      .from('customers')
      .insert({
        org_id: orgId,
        type: payload.property_type === 'commercial' ? 'commercial' : 'residential',
        first_name: first,
        last_name: last,
        email: payload.email ?? null,
        phone_primary: payload.phone ?? null,
        preferred_channel: payload.preferred_channel ?? 'sms',
        source: source === 'website' ? 'website_service_request' : 'manual_service_request',
        tags: [source, 'service_request', 'unreviewed'],
        notes: `Created from ${source === 'website' ? 'website' : 'manual'} service request: ${payload.service_title}`,
      })
      .select('id')
      .single();

    if (error || !data) {
      return err(ErrorCode.DB_ERROR, error?.message ?? 'Failed to create customer.');
    }
    customerId = data.id;
  }

  const addressLine1 = payload.address_line_1.trim();
  const addressLine2 = payload.address_line_2?.trim() || null;
  const city = payload.city.trim();
  const state = payload.state.trim();
  const zip = payload.zip.trim();
  const country = payload.country.trim() || 'US';

  const { data: existingProperties, error: propertyLookupError } = await client
    .from('properties')
    .select('id, address_line_1, address_line_2, city, state, zip, country')
    .eq('org_id', orgId)
    .eq('zip', zip)
    .limit(100);

  if (propertyLookupError) {
    return err(ErrorCode.DB_ERROR, propertyLookupError.message);
  }

  const propertyMatch = existingProperties?.find((property) => {
    return (
      normalizeAddressPart(property.address_line_1) === normalizeAddressPart(addressLine1) &&
      normalizeAddressPart(property.address_line_2 ?? undefined) === normalizeAddressPart(addressLine2 ?? undefined) &&
      normalizeAddressPart(property.city) === normalizeAddressPart(city) &&
      normalizeAddressPart(property.state) === normalizeAddressPart(state) &&
      normalizeAddressPart(property.country ?? 'US') === normalizeAddressPart(country)
    );
  });

  let propertyId = propertyMatch?.id ?? null;
  const dedupedProperty = Boolean(propertyId);

  if (!propertyId) {
    const { data, error } = await client
      .from('properties')
      .insert({
        org_id: orgId,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        state,
        zip,
        country,
        property_type: payload.property_type ?? null,
        access_notes: payload.access_notes ?? null,
        notes: propertyNotes(payload),
      })
      .select('id')
      .single();

    if (error || !data) {
      return err(ErrorCode.DB_ERROR, error?.message ?? 'Failed to create property.');
    }
    propertyId = data.id;
  }

  const { error: linkError } = await client
    .from('customer_properties')
    .upsert(
      {
        customer_id: customerId,
        property_id: propertyId,
        relationship: 'owner',
        is_primary: true,
        start_date: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'customer_id,property_id' }
    );

  if (linkError) return err(ErrorCode.DB_ERROR, linkError.message);

  const { data: serviceRequest, error: serviceRequestError } = await client
    .from('service_requests')
    .insert({
      org_id: orgId,
      source,
      status: 'new',
      priority: payload.priority,
      customer_id: customerId,
      property_id: propertyId,
      contact_name: payload.name,
      contact_email: payload.email ?? null,
      contact_phone: payload.phone ?? null,
      contact_preferred_channel: payload.preferred_channel ?? null,
      property_address_line_1: addressLine1,
      property_address_line_2: addressLine2,
      property_city: city,
      property_state: state,
      property_zip: zip,
      property_country: country,
      property_type: payload.property_type ?? null,
      service_category: payload.service_category ?? null,
      service_title: payload.service_title,
      service_description: payload.service_description,
      preferred_date: payload.preferred_date ?? null,
      preferred_time: payload.preferred_time ?? null,
      access_notes: payload.access_notes ?? null,
      reviewed_at: null,
    })
    .select('id, request_number')
    .single();

  if (serviceRequestError || !serviceRequest) {
    return err(
      ErrorCode.DB_ERROR,
      serviceRequestError?.message ?? 'Failed to create service request.'
    );
  }

  return ok({
    serviceRequestId: serviceRequest.id,
    requestNumber: serviceRequest.request_number ?? null,
    customerId,
    propertyId,
    dedupedCustomer,
    dedupedProperty,
  });
}

/**
 * Thin wrapper around the create_portal_service_request(...) SECURITY
 * DEFINER RPC (supabase/migrations/20260810120000_create_portal_service_
 * request_rpc.sql). All authority — customer_id/org_id, contact snapshot,
 * property-ownership verification — is derived server-side inside the RPC
 * from auth.uid(); this function does not (and must not) accept or forward
 * a customer_id/org_id. MUST be called with the RLS-authenticated portal
 * client (resolveActivePortalAccount()'s portalClient), not the service-role
 * client, so auth.uid() resolves to the signed-in customer inside the RPC.
 */
export async function createPortalServiceRequest(
  client: DbClient,
  args: {
    serviceTitle: string;
    serviceDescription: string;
    propertyId?: string | null;
    customerReportedUrgency?: CustomerReportedUrgency | null;
  }
): Promise<Result<CreatePortalServiceRequestResult>> {
  const { data, error } = await client.rpc('create_portal_service_request', {
    p_service_title: args.serviceTitle,
    p_service_description: args.serviceDescription,
    p_property_id: (args.propertyId ?? null) as unknown as string,
    p_customer_reported_urgency: (args.customerReportedUrgency ?? null) as unknown as string,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    request_number: string | null;
    status: string;
    submitted_at: string;
  }>;
  const row = rows[0];
  if (!row) return err(ErrorCode.DB_ERROR, 'The request was not created.');

  return ok({
    serviceRequestId: row.id,
    requestNumber: row.request_number,
    status: row.status,
    submittedAt: row.submitted_at,
  });
}
