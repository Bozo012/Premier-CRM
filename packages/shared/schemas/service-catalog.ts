import { z } from 'zod';

import { ServiceCatalogConfidenceSchema } from './list-service-catalog-items-args';

export const ServicePricingMetricSchema = z.enum([
  'flat',
  'per_sqft',
  'per_lf',
  'per_each',
  'per_hour',
  'quote_per_job',
  'surcharge_pct',
]);

export type ServicePricingMetric = z.infer<typeof ServicePricingMetricSchema>;

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCheckbox(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on';
}

const OptionalUuidSchema = z.preprocess(
  normalizeOptionalString,
  z.string().uuid().nullable()
);

const OptionalTextSchema = z.preprocess(
  normalizeOptionalString,
  z.string().max(4000).nullable()
);

const OptionalMoneySchema = z.preprocess(
  normalizeOptionalNumber,
  z.number().min(0).max(1000000).nullable()
);

const OptionalIntegerSchema = z.preprocess(
  normalizeOptionalNumber,
  z.number().int().min(0).max(1000000).nullable()
);

const OptionalMarkupSchema = z.preprocess(
  normalizeOptionalNumber,
  z.number().min(0).max(1000).nullable()
);

const CheckboxSchema = z.preprocess(normalizeCheckbox, z.boolean());

export const ServiceCategoryInputSchema = z
  .object({
    id: z.preprocess(normalizeOptionalString, z.string().uuid().optional()),
    name: z.string().trim().min(1).max(120),
    parentId: OptionalUuidSchema,
    sortOrder: OptionalIntegerSchema,
  })
  .superRefine((value, context) => {
    if (value.id && value.parentId && value.id === value.parentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A category cannot be its own parent.',
        path: ['parentId'],
      });
    }
  });

export type ServiceCategoryInput = z.infer<typeof ServiceCategoryInputSchema>;

export const ServiceItemInputSchema = z
  .object({
    id: z.preprocess(normalizeOptionalString, z.string().uuid().optional()),
    categoryId: OptionalUuidSchema,
    commonAddons: OptionalTextSchema,
    confidence: ServiceCatalogConfidenceSchema.default('unconfirmed'),
    defaultLaborMinutes: OptionalIntegerSchema,
    defaultMarkupPct: OptionalMarkupSchema,
    defaultUnitPrice: OptionalMoneySchema,
    description: OptionalTextSchema,
    exclusionNote: OptionalTextSchema,
    isActive: CheckboxSchema.default(true),
    isCustomOnly: CheckboxSchema.default(false),
    name: z.string().trim().min(1).max(160),
    pricingMetric: ServicePricingMetricSchema.default('flat'),
    rateConfirmed: OptionalMoneySchema,
    rateHigh: OptionalMoneySchema,
    rateLow: OptionalMoneySchema,
    scopeExcludes: OptionalTextSchema,
    scopeIncludes: OptionalTextSchema,
    unit: z.string().trim().min(1).max(60),
    unitLabel: OptionalTextSchema,
  })
  .superRefine((value, context) => {
    if (
      value.rateLow !== null &&
      value.rateHigh !== null &&
      value.rateLow > value.rateHigh
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Low rate cannot be greater than high rate.',
        path: ['rateLow'],
      });
    }
  });

export type ServiceItemInput = z.infer<typeof ServiceItemInputSchema>;
