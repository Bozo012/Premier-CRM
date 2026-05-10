import { z } from 'zod';

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const optionalDateString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? null : value,
  z.string().trim().max(10).nullable().optional()
);

const optionalPhoneE164String = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? null : value,
  z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be in E.164 format.')
    .nullable()
    .optional()
);

export const PublicWebsiteSettingsSchema = z.object({
  availabilityText: z.string().nullable(),
  callCtaLabel: z.string().nullable(),
  emergencyMessage: z.string().nullable(),
  heroHeadline: z.string().nullable(),
  heroSubheadline: z.string().nullable(),
  homepageSeoDescription: z.string().nullable(),
  homepageSeoTitle: z.string().nullable(),
  phoneDisplay: z.string().nullable(),
  phoneE164: z.string().nullable(),
  portalCtaLabel: z.string().nullable(),
  portalStatusMessage: z.string().nullable(),
  requestServiceCtaLabel: z.string().nullable(),
  serviceAreaSummary: z.string().nullable(),
  textCtaLabel: z.string().nullable(),
  updatedAt: z.string(),
});

export const PublicWebsitePromotionSchema = z.object({
  buttonLink: z.string().nullable(),
  buttonText: z.string().nullable(),
  description: z.string().nullable(),
  displayOrder: z.number().int(),
  endDate: z.string().nullable(),
  id: z.string().uuid(),
  startDate: z.string().nullable(),
  title: z.string(),
});

export const PublicWebsiteServiceHighlightSchema = z.object({
  description: z.string().nullable(),
  displayOrder: z.number().int(),
  featured: z.boolean(),
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
});

export const PublicWebsiteContentSnapshotSchema = z.object({
  promotions: z.array(PublicWebsitePromotionSchema),
  serviceHighlights: z.array(PublicWebsiteServiceHighlightSchema),
  settings: PublicWebsiteSettingsSchema.nullable(),
});

export const WebsiteSettingsInputSchema = z.object({
  availabilityText: optionalTrimmedString(160),
  callCtaLabel: optionalTrimmedString(80),
  emergencyMessage: optionalTrimmedString(240),
  heroHeadline: optionalTrimmedString(160),
  heroSubheadline: optionalTrimmedString(280),
  homepageSeoDescription: optionalTrimmedString(320),
  homepageSeoTitle: optionalTrimmedString(120),
  phoneDisplay: optionalTrimmedString(40),
  phoneE164: optionalPhoneE164String,
  portalCtaLabel: optionalTrimmedString(80),
  portalStatusMessage: optionalTrimmedString(240),
  requestServiceCtaLabel: optionalTrimmedString(80),
  serviceAreaSummary: optionalTrimmedString(240),
  textCtaLabel: optionalTrimmedString(80),
});

export const WebsitePromotionInputSchema = z.object({
  active: z.coerce.boolean().default(false),
  buttonLink: optionalTrimmedString(2048),
  buttonText: optionalTrimmedString(80),
  description: optionalTrimmedString(240),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
  endDate: optionalDateString,
  id: z.string().uuid().optional(),
  startDate: optionalDateString,
  title: z.string().trim().min(1).max(120),
});

export const WebsiteServiceHighlightInputSchema = z.object({
  active: z.coerce.boolean().default(false),
  description: optionalTrimmedString(240),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
  featured: z.coerce.boolean().default(false),
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must use lowercase letters, numbers, and hyphens.'),
  title: z.string().trim().min(1).max(120),
});

export type PublicWebsiteSettings = z.infer<typeof PublicWebsiteSettingsSchema>;
export type PublicWebsitePromotion = z.infer<typeof PublicWebsitePromotionSchema>;
export type PublicWebsiteServiceHighlight = z.infer<
  typeof PublicWebsiteServiceHighlightSchema
>;
export type PublicWebsiteContentSnapshot = z.infer<
  typeof PublicWebsiteContentSnapshotSchema
>;
export type WebsiteSettingsInput = z.infer<typeof WebsiteSettingsInputSchema>;
export type WebsitePromotionInput = z.infer<typeof WebsitePromotionInputSchema>;
export type WebsiteServiceHighlightInput = z.infer<
  typeof WebsiteServiceHighlightInputSchema
>;
