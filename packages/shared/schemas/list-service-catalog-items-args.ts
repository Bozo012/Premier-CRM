import { z } from 'zod';

export const ServiceCatalogConfidenceSchema = z.enum([
  'unconfirmed',
  'low',
  'medium',
  'high',
]);

export type ServiceCatalogConfidence = z.infer<
  typeof ServiceCatalogConfidenceSchema
>;

export const ServiceCatalogActivitySchema = z.enum([
  'active',
  'inactive',
  'all',
]);

export type ServiceCatalogActivity = z.infer<
  typeof ServiceCatalogActivitySchema
>;

export const ListServiceCatalogItemsArgsSchema = z.object({
  orgId: z.string().uuid(),
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  confidence: ServiceCatalogConfidenceSchema.optional(),
  activity: ServiceCatalogActivitySchema.default('active'),
  limit: z.number().int().min(1).max(200).default(200),
  offset: z.number().int().min(0).default(0),
});

export type ListServiceCatalogItemsArgs = z.infer<
  typeof ListServiceCatalogItemsArgsSchema
>;
