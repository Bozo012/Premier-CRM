'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { createDraftQuote, createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Shared types for pickers
// ---------------------------------------------------------------------------

export interface CustomerPickerItem {
  displayName: string;
  email: string | null;
  id: string;
}

export interface PropertyPickerItem {
  addressLine1: string;
  city: string;
  id: string;
  state: string;
  zip: string;
}

async function getEstimateActionContext(): Promise<
  Result<{ orgId: string; userId: string }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }

  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
}

// ---------------------------------------------------------------------------
// Advance estimate status (pre-quote stages only)
// ---------------------------------------------------------------------------

export type UpdateEstimateStatusActionState = Result<{ status: string }>;

const ALLOWED_TRANSITIONS: Record<string, string> = {
  draft: 'site_visit_scheduled',
  site_visit_scheduled: 'site_visit_complete',
};

export async function updateEstimateStatusAction(
  _prevState: UpdateEstimateStatusActionState | null,
  formData: FormData
): Promise<UpdateEstimateStatusActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const estimateId =
    typeof formData.get('estimateId') === 'string'
      ? (formData.get('estimateId') as string).trim()
      : '';
  const newStatus =
    typeof formData.get('newStatus') === 'string'
      ? (formData.get('newStatus') as string).trim()
      : '';
  const siteVisitAt =
    typeof formData.get('siteVisitAt') === 'string'
      ? (formData.get('siteVisitAt') as string).trim() || null
      : null;

  if (!estimateId) return err(ErrorCode.VALIDATION_ERROR, 'Estimate ID is required.');
  if (!newStatus) return err(ErrorCode.VALIDATION_ERROR, 'New status is required.');

  const client = createServiceClient();

  const { data: estimate, error: fetchError } = await client
    .from('estimates')
    .select('id, status')
    .eq('id', estimateId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (fetchError) return err(ErrorCode.DB_ERROR, fetchError.message);
  if (!estimate) return err(ErrorCode.NOT_FOUND, 'Estimate not found.');

  const allowedNext = ALLOWED_TRANSITIONS[estimate.status];
  if (!allowedNext || allowedNext !== newStatus) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      `Cannot transition estimate from "${estimate.status}" to "${newStatus}".`
    );
  }

  type EstimateStatus = 'draft' | 'site_visit_scheduled' | 'site_visit_complete' | 'quoted' | 'accepted' | 'declined' | 'expired' | 'converted';
  const updateData: { status: EstimateStatus; site_visit_at?: string } = {
    status: newStatus as EstimateStatus,
  };
  if (newStatus === 'site_visit_scheduled' && siteVisitAt) {
    updateData.site_visit_at = siteVisitAt;
  }

  const { error: updateError } = await client
    .from('estimates')
    .update(updateData)
    .eq('id', estimateId)
    .eq('org_id', orgId);

  if (updateError) return err(ErrorCode.DB_ERROR, updateError.message);

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath('/estimates');

  return ok({ status: newStatus });
}

// ---------------------------------------------------------------------------
// Create draft quote from estimate
// ---------------------------------------------------------------------------

export type CreateQuoteFromEstimateActionState = Result<{ quoteId: string }>;

export async function createQuoteFromEstimateAction(
  _prevState: CreateQuoteFromEstimateActionState | null,
  formData: FormData
): Promise<CreateQuoteFromEstimateActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const estimateId =
    typeof formData.get('estimateId') === 'string'
      ? (formData.get('estimateId') as string).trim()
      : '';
  const title =
    typeof formData.get('title') === 'string'
      ? (formData.get('title') as string).trim()
      : '';

  if (!estimateId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Estimate ID is required.');
  }

  const client = createServiceClient();

  // Verify the estimate belongs to this org and fetch its current status.
  const { data: estimate, error: estimateError } = await client
    .from('estimates')
    .select('id, status, title')
    .eq('id', estimateId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (estimateError) {
    return err(ErrorCode.DB_ERROR, estimateError.message);
  }
  if (!estimate) {
    return err(ErrorCode.NOT_FOUND, 'Estimate not found.');
  }

  // Create the draft quote linked to this estimate.
  const quoteResult = await createDraftQuote(client, {
    createdBy: userId,
    estimateId: estimate.id,
    orgId,
    title: title || estimate.title || 'Draft quote',
  });

  if (!quoteResult.success) {
    return quoteResult;
  }

  // Advance estimate status to 'quoted' unless it's already in a terminal state.
  const terminalStatuses = new Set(['accepted', 'declined', 'expired', 'converted']);
  if (!terminalStatuses.has(estimate.status)) {
    await client
      .from('estimates')
      .update({ status: 'quoted' })
      .eq('id', estimateId)
      .eq('org_id', orgId);
  }

  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath('/estimates');
  revalidatePath('/quotes');

  return ok({ quoteId: quoteResult.data.id });
}

// ---------------------------------------------------------------------------
// Customer picker search
// ---------------------------------------------------------------------------

export type SearchCustomersForPickerActionState = Result<CustomerPickerItem[]>;

export async function searchCustomersForPickerAction(
  _prevState: SearchCustomersForPickerActionState | null,
  formData: FormData
): Promise<SearchCustomersForPickerActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const q =
    typeof formData.get('q') === 'string'
      ? (formData.get('q') as string).trim()
      : '';

  const client = createServiceClient();

  let query = client
    .from('customers')
    .select('id, display_name, company_name, first_name, last_name, email')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .limit(30);

  if (q) {
    query = query.ilike('display_name', `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(
    (data ?? []).map((c) => ({
      id: c.id,
      displayName:
        c.display_name ??
        ([c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed customer'),
      email: c.email ?? null,
    }))
  );
}

// ---------------------------------------------------------------------------
// Property picker for a customer
// ---------------------------------------------------------------------------

export type ListPropertiesForCustomerActionState = Result<PropertyPickerItem[]>;

export async function listPropertiesForCustomerAction(
  _prevState: ListPropertiesForCustomerActionState | null,
  formData: FormData
): Promise<ListPropertiesForCustomerActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const customerId =
    typeof formData.get('customerId') === 'string'
      ? (formData.get('customerId') as string).trim()
      : '';

  if (!customerId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Customer ID is required.');
  }

  const client = createServiceClient();

  // Fetch property IDs linked to this customer.
  const { data: links, error: linksError } = await client
    .from('customer_properties')
    .select('property_id')
    .eq('customer_id', customerId);

  if (linksError) {
    return err(ErrorCode.DB_ERROR, linksError.message);
  }

  const propertyIds = (links ?? []).map((l) => l.property_id);

  if (propertyIds.length === 0) {
    return ok([]);
  }

  const { data: props, error: propsError } = await client
    .from('properties')
    .select('id, address_line_1, city, state, zip')
    .eq('org_id', orgId)
    .in('id', propertyIds)
    .order('address_line_1', { ascending: true });

  if (propsError) {
    return err(ErrorCode.DB_ERROR, propsError.message);
  }

  return ok(
    (props ?? []).map((p) => ({
      id: p.id,
      addressLine1: p.address_line_1,
      city: p.city,
      state: p.state,
      zip: p.zip,
    }))
  );
}

// ---------------------------------------------------------------------------
// Create manual estimate (no service request)
// ---------------------------------------------------------------------------

export type CreateManualEstimateActionState = Result<{ estimateId: string }>;

export async function createManualEstimateAction(
  _prevState: CreateManualEstimateActionState | null,
  formData: FormData
): Promise<CreateManualEstimateActionState> {
  const contextResult = await getEstimateActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId, userId } = contextResult.data;

  const customerId =
    typeof formData.get('customerId') === 'string'
      ? (formData.get('customerId') as string).trim()
      : '';
  const propertyId =
    typeof formData.get('propertyId') === 'string'
      ? (formData.get('propertyId') as string).trim()
      : '';
  const title =
    typeof formData.get('title') === 'string'
      ? (formData.get('title') as string).trim()
      : '';
  const description =
    typeof formData.get('description') === 'string'
      ? (formData.get('description') as string).trim()
      : '';

  if (!customerId) {
    return err(ErrorCode.VALIDATION_ERROR, 'A customer is required.');
  }
  if (!propertyId) {
    return err(ErrorCode.VALIDATION_ERROR, 'A property is required.');
  }
  if (!title) {
    return err(ErrorCode.VALIDATION_ERROR, 'A title is required.');
  }

  const client = createServiceClient();

  // Verify customer belongs to this org.
  const { data: customer, error: customerError } = await client
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (customerError) {
    return err(ErrorCode.DB_ERROR, customerError.message);
  }
  if (!customer) {
    return err(ErrorCode.NOT_FOUND, 'Customer not found.');
  }

  // Verify the property is linked to this customer.
  const { data: link, error: linkError } = await client
    .from('customer_properties')
    .select('property_id')
    .eq('customer_id', customerId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (linkError) {
    return err(ErrorCode.DB_ERROR, linkError.message);
  }
  if (!link) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'The selected property is not linked to this customer.'
    );
  }

  const { data: newEstimate, error: insertError } = await client
    .from('estimates')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      title,
      description: description || null,
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !newEstimate) {
    return err(
      ErrorCode.DB_ERROR,
      insertError?.message ?? 'Failed to create estimate.'
    );
  }

  revalidatePath('/estimates');

  return ok({ estimateId: newEstimate.id });
}
