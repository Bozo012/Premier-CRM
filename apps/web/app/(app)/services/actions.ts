'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  ServiceCategoryInputSchema,
  ServiceItemInputSchema,
  err,
  ok,
  type Result,
} from '@premier/shared';
import {
  createServiceClient,
  saveServiceCategory,
  saveServiceItem,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type SaveServiceCategoryActionState = Result<{ id: string }>;
export type SaveServiceItemActionState = Result<{ id: string }>;

interface ServiceCatalogAdminContext {
  orgId: string;
}

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

function readCheckbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'on' || value === 'true';
}

async function getServiceCatalogAdminContext(): Promise<
  Result<ServiceCatalogAdminContext>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(
      ErrorCode.FORBIDDEN,
      'You must be signed in to manage the service catalog.'
    );
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
    return err(
      ErrorCode.FORBIDDEN,
      'No organization membership was found for this user.'
    );
  }

  return ok({ orgId: membership.org_id });
}

export async function saveServiceCategoryAction(
  _previousState: SaveServiceCategoryActionState | null,
  formData: FormData
): Promise<SaveServiceCategoryActionState> {
  const access = await getServiceCatalogAdminContext();

  if (!access.success) {
    return access;
  }

  const parsed = ServiceCategoryInputSchema.safeParse({
    id: readOptionalString(formData, 'id'),
    name: readOptionalString(formData, 'name'),
    parentId: readOptionalString(formData, 'parentId'),
    sortOrder: readOptionalString(formData, 'sortOrder'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid service category payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await saveServiceCategory(serviceClient, {
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/services');

  return ok({ id: result.data.id });
}

export async function saveServiceItemAction(
  _previousState: SaveServiceItemActionState | null,
  formData: FormData
): Promise<SaveServiceItemActionState> {
  const access = await getServiceCatalogAdminContext();

  if (!access.success) {
    return access;
  }

  const parsed = ServiceItemInputSchema.safeParse({
    id: readOptionalString(formData, 'id'),
    categoryId: readOptionalString(formData, 'categoryId'),
    commonAddons: readOptionalString(formData, 'commonAddons'),
    confidence: readOptionalString(formData, 'confidence'),
    defaultLaborMinutes: readOptionalString(formData, 'defaultLaborMinutes'),
    defaultMarkupPct: readOptionalString(formData, 'defaultMarkupPct'),
    defaultUnitPrice: readOptionalString(formData, 'defaultUnitPrice'),
    description: readOptionalString(formData, 'description'),
    exclusionNote: readOptionalString(formData, 'exclusionNote'),
    isActive: readCheckbox(formData, 'isActive'),
    isCustomOnly: readCheckbox(formData, 'isCustomOnly'),
    name: readOptionalString(formData, 'name'),
    pricingMetric: readOptionalString(formData, 'pricingMetric'),
    rateConfirmed: readOptionalString(formData, 'rateConfirmed'),
    rateHigh: readOptionalString(formData, 'rateHigh'),
    rateLow: readOptionalString(formData, 'rateLow'),
    scopeExcludes: readOptionalString(formData, 'scopeExcludes'),
    scopeIncludes: readOptionalString(formData, 'scopeIncludes'),
    unit: readOptionalString(formData, 'unit'),
    unitLabel: readOptionalString(formData, 'unitLabel'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid service item payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await saveServiceItem(serviceClient, {
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/services');

  return ok({ id: result.data.id });
}
