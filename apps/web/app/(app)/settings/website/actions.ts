'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  WebsitePromotionInputSchema,
  WebsiteServiceHighlightInputSchema,
  WebsiteSettingsInputSchema,
  err,
  ok,
  type Result,
} from '@premier/shared';
import {
  createServiceClient,
  deleteWebsitePromotion,
  deleteWebsiteServiceHighlight,
  getActiveOrgContext,
  saveWebsitePromotion,
  saveWebsiteServiceHighlight,
  upsertWebsiteSettings,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type SaveWebsiteSettingsActionState = Result<{ updatedAt: string }>;
export type SaveWebsitePromotionActionState = Result<{ id: string }>;
export type SaveWebsiteServiceHighlightActionState = Result<{ id: string }>;
export type DeleteWebsiteContentActionState = Result<{ id: string }>;

interface WebsiteAdminContext {
  orgId: string;
}

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

function readCheckbox(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

async function getWebsiteAdminContext(): Promise<Result<WebsiteAdminContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(
      ErrorCode.FORBIDDEN,
      'You must be signed in to manage website content.'
    );
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }
  const { orgId, role } = orgContextResult.data;

  if (role !== 'owner' && role !== 'admin') {
    return err(
      ErrorCode.FORBIDDEN,
      'Only owners and admins can manage website content.'
    );
  }

  return ok({ orgId });
}

export async function saveWebsiteSettingsAction(
  _previousState: SaveWebsiteSettingsActionState | null,
  formData: FormData
): Promise<SaveWebsiteSettingsActionState> {
  const access = await getWebsiteAdminContext();

  if (!access.success) {
    return access;
  }

  const parsed = WebsiteSettingsInputSchema.safeParse({
    availabilityText: readOptionalString(formData, 'availabilityText'),
    callCtaLabel: readOptionalString(formData, 'callCtaLabel'),
    emergencyMessage: readOptionalString(formData, 'emergencyMessage'),
    heroHeadline: readOptionalString(formData, 'heroHeadline'),
    heroSubheadline: readOptionalString(formData, 'heroSubheadline'),
    homepageSeoDescription: readOptionalString(
      formData,
      'homepageSeoDescription'
    ),
    homepageSeoTitle: readOptionalString(formData, 'homepageSeoTitle'),
    phoneDisplay: readOptionalString(formData, 'phoneDisplay'),
    phoneE164: readOptionalString(formData, 'phoneE164'),
    portalCtaLabel: readOptionalString(formData, 'portalCtaLabel'),
    portalStatusMessage: readOptionalString(formData, 'portalStatusMessage'),
    requestServiceCtaLabel: readOptionalString(
      formData,
      'requestServiceCtaLabel'
    ),
    serviceAreaSummary: readOptionalString(formData, 'serviceAreaSummary'),
    textCtaLabel: readOptionalString(formData, 'textCtaLabel'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid website settings payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await upsertWebsiteSettings(serviceClient, {
    orgId: access.data.orgId,
    input: parsed.data,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/settings/website');

  return ok({
    updatedAt: result.data.updatedAt,
  });
}

export async function saveWebsitePromotionAction(
  _previousState: SaveWebsitePromotionActionState | null,
  formData: FormData
): Promise<SaveWebsitePromotionActionState> {
  const access = await getWebsiteAdminContext();

  if (!access.success) {
    return access;
  }

  const parsed = WebsitePromotionInputSchema.safeParse({
    active: readCheckbox(formData, 'active'),
    buttonLink: readOptionalString(formData, 'buttonLink'),
    buttonText: readOptionalString(formData, 'buttonText'),
    description: readOptionalString(formData, 'description'),
    displayOrder: readOptionalString(formData, 'displayOrder'),
    endDate: readOptionalString(formData, 'endDate'),
    id: readOptionalString(formData, 'id') || undefined,
    startDate: readOptionalString(formData, 'startDate'),
    title: readOptionalString(formData, 'title'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid website promotion payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await saveWebsitePromotion(serviceClient, {
    orgId: access.data.orgId,
    input: parsed.data,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/settings/website');

  return ok({ id: result.data.id });
}

export async function deleteWebsitePromotionAction(
  _previousState: DeleteWebsiteContentActionState | null,
  formData: FormData
): Promise<DeleteWebsiteContentActionState> {
  const access = await getWebsiteAdminContext();

  if (!access.success) {
    return access;
  }

  const id = readOptionalString(formData, 'id');
  if (!id) {
    return err(ErrorCode.VALIDATION_ERROR, 'Promotion id is required.');
  }

  const serviceClient = createServiceClient();
  const result = await deleteWebsitePromotion(serviceClient, {
    id,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/settings/website');

  return ok({ id });
}

export async function saveWebsiteServiceHighlightAction(
  _previousState: SaveWebsiteServiceHighlightActionState | null,
  formData: FormData
): Promise<SaveWebsiteServiceHighlightActionState> {
  const access = await getWebsiteAdminContext();

  if (!access.success) {
    return access;
  }

  const parsed = WebsiteServiceHighlightInputSchema.safeParse({
    active: readCheckbox(formData, 'active'),
    description: readOptionalString(formData, 'description'),
    displayOrder: readOptionalString(formData, 'displayOrder'),
    featured: readCheckbox(formData, 'featured'),
    id: readOptionalString(formData, 'id') || undefined,
    slug: readOptionalString(formData, 'slug'),
    title: readOptionalString(formData, 'title'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid website service highlight payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await saveWebsiteServiceHighlight(serviceClient, {
    orgId: access.data.orgId,
    input: parsed.data,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/settings/website');

  return ok({ id: result.data.id });
}

export async function deleteWebsiteServiceHighlightAction(
  _previousState: DeleteWebsiteContentActionState | null,
  formData: FormData
): Promise<DeleteWebsiteContentActionState> {
  const access = await getWebsiteAdminContext();

  if (!access.success) {
    return access;
  }

  const id = readOptionalString(formData, 'id');
  if (!id) {
    return err(ErrorCode.VALIDATION_ERROR, 'Service highlight id is required.');
  }

  const serviceClient = createServiceClient();
  const result = await deleteWebsiteServiceHighlight(serviceClient, {
    id,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/settings/website');

  return ok({ id });
}
