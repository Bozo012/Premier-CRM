import {
  ErrorCode,
  err,
  ok,
  PublicWebsiteContentSnapshotSchema,
  PublicWebsitePromotionSchema,
  PublicWebsiteServiceHighlightSchema,
  PublicWebsiteSettingsSchema,
  type PublicWebsiteContentSnapshot,
  type PublicWebsitePromotion,
  type PublicWebsiteServiceHighlight,
  type PublicWebsiteSettings,
  type Result,
  type WebsitePromotionInput,
  type WebsiteServiceHighlightInput,
  type WebsiteSettingsInput,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Tables, TablesInsert, TablesUpdate } from '../types';

type WebsiteSettingsRow = Tables<'website_settings'>;
type WebsitePromotionRow = Tables<'website_promotions'>;
type WebsiteServiceHighlightRow = Tables<'website_service_highlights'>;
type WebsiteSettingsInsert = TablesInsert<'website_settings'>;
type WebsitePromotionInsert = TablesInsert<'website_promotions'>;
type WebsitePromotionUpdate = TablesUpdate<'website_promotions'>;
type WebsiteServiceHighlightInsert = TablesInsert<'website_service_highlights'>;
type WebsiteServiceHighlightUpdate = TablesUpdate<'website_service_highlights'>;

export interface WebsiteSettingsRecord extends PublicWebsiteSettings {
  active: boolean;
  createdAt: string;
  id: string;
  orgId: string;
  published: boolean;
}

export interface WebsitePromotionRecord extends PublicWebsitePromotion {
  active: boolean;
  createdAt: string;
  orgId: string;
  updatedAt: string;
}

export interface WebsiteServiceHighlightRecord
  extends PublicWebsiteServiceHighlight {
  active: boolean;
  createdAt: string;
  orgId: string;
  updatedAt: string;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapWebsiteSettings(row: WebsiteSettingsRow): PublicWebsiteSettings {
  return {
    availabilityText: row.availability_text,
    callCtaLabel: row.call_cta_label,
    emergencyMessage: row.emergency_message,
    heroHeadline: row.hero_headline,
    heroSubheadline: row.hero_subheadline,
    homepageSeoDescription: row.homepage_seo_description,
    homepageSeoTitle: row.homepage_seo_title,
    phoneDisplay: row.phone_display,
    phoneE164: row.phone_e164,
    portalCtaLabel: row.portal_cta_label,
    portalStatusMessage: row.portal_status_message,
    requestServiceCtaLabel: row.request_service_cta_label,
    serviceAreaSummary: row.service_area_summary,
    textCtaLabel: row.text_cta_label,
    updatedAt: row.updated_at,
  };
}

function mapWebsiteSettingsRecord(row: WebsiteSettingsRow): WebsiteSettingsRecord {
  return {
    active: row.active ?? true,
    createdAt: row.created_at,
    id: row.id,
    orgId: row.org_id,
    published: row.published ?? true,
    ...mapWebsiteSettings(row),
  };
}

function mapWebsitePromotion(row: WebsitePromotionRow): PublicWebsitePromotion {
  return {
    buttonLink: row.button_link,
    buttonText: row.button_text,
    description: row.description,
    displayOrder: row.display_order ?? 0,
    endDate: row.end_date,
    id: row.id,
    startDate: row.start_date,
    title: row.title,
  };
}

function mapWebsitePromotionRecord(
  row: WebsitePromotionRow
): WebsitePromotionRecord {
  return {
    active: row.active ?? false,
    createdAt: row.created_at,
    orgId: row.org_id,
    updatedAt: row.updated_at,
    ...mapWebsitePromotion(row),
  };
}

function mapWebsiteServiceHighlight(
  row: WebsiteServiceHighlightRow
): PublicWebsiteServiceHighlight {
  return {
    description: row.description,
    displayOrder: row.display_order ?? 0,
    featured: row.featured ?? false,
    id: row.id,
    slug: row.slug,
    title: row.title,
  };
}

function mapWebsiteServiceHighlightRecord(
  row: WebsiteServiceHighlightRow
): WebsiteServiceHighlightRecord {
  return {
    active: row.active ?? false,
    createdAt: row.created_at,
    orgId: row.org_id,
    updatedAt: row.updated_at,
    ...mapWebsiteServiceHighlight(row),
  };
}

function isPromotionInActiveWindow(
  row: WebsitePromotionRow,
  today: string
): boolean {
  const startsOnOrBeforeToday = !row.start_date || row.start_date <= today;
  const endsOnOrAfterToday = !row.end_date || row.end_date >= today;

  return startsOnOrBeforeToday && endsOnOrAfterToday;
}

function toWebsiteSettingsInsert(
  orgId: string,
  input: WebsiteSettingsInput
): WebsiteSettingsInsert {
  return {
    active: true,
    availability_text: input.availabilityText ?? null,
    call_cta_label: input.callCtaLabel ?? null,
    emergency_message: input.emergencyMessage ?? null,
    hero_headline: input.heroHeadline ?? null,
    hero_subheadline: input.heroSubheadline ?? null,
    homepage_seo_description: input.homepageSeoDescription ?? null,
    homepage_seo_title: input.homepageSeoTitle ?? null,
    org_id: orgId,
    phone_display: input.phoneDisplay ?? null,
    phone_e164: input.phoneE164 ?? null,
    portal_cta_label: input.portalCtaLabel ?? null,
    portal_status_message: input.portalStatusMessage ?? null,
    published: true,
    request_service_cta_label: input.requestServiceCtaLabel ?? null,
    service_area_summary: input.serviceAreaSummary ?? null,
    text_cta_label: input.textCtaLabel ?? null,
  };
}

function toWebsitePromotionInsert(
  orgId: string,
  input: WebsitePromotionInput
): WebsitePromotionInsert {
  return {
    active: input.active,
    button_link: normalizeOptionalText(input.buttonLink),
    button_text: normalizeOptionalText(input.buttonText),
    description: normalizeOptionalText(input.description),
    display_order: input.displayOrder,
    end_date: normalizeOptionalDate(input.endDate),
    org_id: orgId,
    start_date: normalizeOptionalDate(input.startDate),
    title: input.title,
  };
}

function toWebsitePromotionUpdate(
  input: WebsitePromotionInput
): WebsitePromotionUpdate {
  return {
    active: input.active,
    button_link: normalizeOptionalText(input.buttonLink),
    button_text: normalizeOptionalText(input.buttonText),
    description: normalizeOptionalText(input.description),
    display_order: input.displayOrder,
    end_date: normalizeOptionalDate(input.endDate),
    start_date: normalizeOptionalDate(input.startDate),
    title: input.title,
  };
}

function toWebsiteServiceHighlightInsert(
  orgId: string,
  input: WebsiteServiceHighlightInput
): WebsiteServiceHighlightInsert {
  return {
    active: input.active,
    description: normalizeOptionalText(input.description),
    display_order: input.displayOrder,
    featured: input.featured,
    org_id: orgId,
    slug: input.slug,
    title: input.title,
  };
}

function toWebsiteServiceHighlightUpdate(
  input: WebsiteServiceHighlightInput
): WebsiteServiceHighlightUpdate {
  return {
    active: input.active,
    description: normalizeOptionalText(input.description),
    display_order: input.displayOrder,
    featured: input.featured,
    slug: input.slug,
    title: input.title,
  };
}

export async function getPublishedWebsiteSettings(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<PublicWebsiteSettings | null>> {
  const { data, error } = await client
    .from('website_settings')
    .select(
      'id, org_id, active, published, phone_display, phone_e164, call_cta_label, text_cta_label, request_service_cta_label, portal_cta_label, hero_headline, hero_subheadline, availability_text, service_area_summary, emergency_message, portal_status_message, homepage_seo_title, homepage_seo_description, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .eq('published', true)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!data) {
    return ok(null);
  }

  const parsed = PublicWebsiteSettingsSchema.safeParse(mapWebsiteSettings(data));

  if (!parsed.success) {
    return err(ErrorCode.DB_ERROR, 'Invalid published website settings payload.');
  }

  return ok(parsed.data);
}

export async function listActiveWebsitePromotions(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<PublicWebsitePromotion[]>> {
  const { data, error } = await client
    .from('website_promotions')
    .select(
      'id, org_id, title, description, button_text, button_link, start_date, end_date, display_order, active, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const today = new Date().toISOString().slice(0, 10);
  const parsed = PublicWebsitePromotionSchema.array().safeParse(
    (data ?? [])
      .filter((row) => isPromotionInActiveWindow(row, today))
      .map(mapWebsitePromotion)
  );

  if (!parsed.success) {
    return err(ErrorCode.DB_ERROR, 'Invalid website promotions payload.');
  }

  return ok(parsed.data);
}

export async function listActiveWebsiteServiceHighlights(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<PublicWebsiteServiceHighlight[]>> {
  const { data, error } = await client
    .from('website_service_highlights')
    .select(
      'id, org_id, slug, title, description, featured, display_order, active, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const parsed = PublicWebsiteServiceHighlightSchema.array().safeParse(
    (data ?? []).map(mapWebsiteServiceHighlight)
  );

  if (!parsed.success) {
    return err(ErrorCode.DB_ERROR, 'Invalid website service highlights payload.');
  }

  return ok(parsed.data);
}

export async function getPublicWebsiteContentSnapshot(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<PublicWebsiteContentSnapshot>> {
  const [settingsResult, promotionsResult, highlightsResult] = await Promise.all([
    getPublishedWebsiteSettings(client, args),
    listActiveWebsitePromotions(client, args),
    listActiveWebsiteServiceHighlights(client, args),
  ]);

  if (!settingsResult.success) {
    return settingsResult;
  }

  if (!promotionsResult.success) {
    return promotionsResult;
  }

  if (!highlightsResult.success) {
    return highlightsResult;
  }

  const parsed = PublicWebsiteContentSnapshotSchema.safeParse({
    promotions: promotionsResult.data,
    serviceHighlights: highlightsResult.data,
    settings: settingsResult.data,
  });

  if (!parsed.success) {
    return err(ErrorCode.DB_ERROR, 'Invalid website content snapshot payload.');
  }

  return ok(parsed.data);
}

export async function getWebsiteSettingsForOrg(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<WebsiteSettingsRecord | null>> {
  const { data, error } = await client
    .from('website_settings')
    .select(
      'id, org_id, active, published, phone_display, phone_e164, call_cta_label, text_cta_label, request_service_cta_label, portal_cta_label, hero_headline, hero_subheadline, availability_text, service_area_summary, emergency_message, portal_status_message, homepage_seo_title, homepage_seo_description, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data ? mapWebsiteSettingsRecord(data) : null);
}

export async function upsertWebsiteSettings(
  client: DbClient,
  args: { input: WebsiteSettingsInput; orgId: string }
): Promise<Result<WebsiteSettingsRecord>> {
  const { data, error } = await client
    .from('website_settings')
    .upsert(toWebsiteSettingsInsert(args.orgId, args.input), { onConflict: 'org_id' })
    .select(
      'id, org_id, active, published, phone_display, phone_e164, call_cta_label, text_cta_label, request_service_cta_label, portal_cta_label, hero_headline, hero_subheadline, availability_text, service_area_summary, emergency_message, portal_status_message, homepage_seo_title, homepage_seo_description, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    return err(
      ErrorCode.DB_ERROR,
      error?.message ?? 'Failed to save website settings.'
    );
  }

  return ok(mapWebsiteSettingsRecord(data));
}

export async function listWebsitePromotionsForOrg(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<WebsitePromotionRecord[]>> {
  const { data, error } = await client
    .from('website_promotions')
    .select(
      'id, org_id, title, description, button_text, button_link, start_date, end_date, display_order, active, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok((data ?? []).map(mapWebsitePromotionRecord));
}

export async function saveWebsitePromotion(
  client: DbClient,
  args: { input: WebsitePromotionInput; orgId: string }
): Promise<Result<WebsitePromotionRecord>> {
  if (args.input.id) {
    const { data, error } = await client
      .from('website_promotions')
      .update(toWebsitePromotionUpdate(args.input))
      .eq('id', args.input.id)
      .eq('org_id', args.orgId)
      .select(
        'id, org_id, title, description, button_text, button_link, start_date, end_date, display_order, active, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      return err(
        ErrorCode.DB_ERROR,
        error?.message ?? 'Failed to update website promotion.'
      );
    }

    return ok(mapWebsitePromotionRecord(data));
  }

  const { data, error } = await client
    .from('website_promotions')
    .insert(toWebsitePromotionInsert(args.orgId, args.input))
    .select(
      'id, org_id, title, description, button_text, button_link, start_date, end_date, display_order, active, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    return err(
      ErrorCode.DB_ERROR,
      error?.message ?? 'Failed to create website promotion.'
    );
  }

  return ok(mapWebsitePromotionRecord(data));
}

export async function deleteWebsitePromotion(
  client: DbClient,
  args: { id: string; orgId: string }
): Promise<Result<{ id: string }>> {
  const { error } = await client
    .from('website_promotions')
    .delete()
    .eq('id', args.id)
    .eq('org_id', args.orgId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok({ id: args.id });
}

export async function listWebsiteServiceHighlightsForOrg(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<WebsiteServiceHighlightRecord[]>> {
  const { data, error } = await client
    .from('website_service_highlights')
    .select(
      'id, org_id, slug, title, description, featured, display_order, active, created_at, updated_at'
    )
    .eq('org_id', args.orgId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok((data ?? []).map(mapWebsiteServiceHighlightRecord));
}

export async function saveWebsiteServiceHighlight(
  client: DbClient,
  args: { input: WebsiteServiceHighlightInput; orgId: string }
): Promise<Result<WebsiteServiceHighlightRecord>> {
  if (args.input.id) {
    const { data, error } = await client
      .from('website_service_highlights')
      .update(toWebsiteServiceHighlightUpdate(args.input))
      .eq('id', args.input.id)
      .eq('org_id', args.orgId)
      .select(
        'id, org_id, slug, title, description, featured, display_order, active, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      return err(
        ErrorCode.DB_ERROR,
        error?.message ?? 'Failed to update website service highlight.'
      );
    }

    return ok(mapWebsiteServiceHighlightRecord(data));
  }

  const { data, error } = await client
    .from('website_service_highlights')
    .insert(toWebsiteServiceHighlightInsert(args.orgId, args.input))
    .select(
      'id, org_id, slug, title, description, featured, display_order, active, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    return err(
      ErrorCode.DB_ERROR,
      error?.message ?? 'Failed to create website service highlight.'
    );
  }

  return ok(mapWebsiteServiceHighlightRecord(data));
}

export async function deleteWebsiteServiceHighlight(
  client: DbClient,
  args: { id: string; orgId: string }
): Promise<Result<{ id: string }>> {
  const { error } = await client
    .from('website_service_highlights')
    .delete()
    .eq('id', args.id)
    .eq('org_id', args.orgId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok({ id: args.id });
}
