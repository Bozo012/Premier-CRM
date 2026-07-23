import { z } from 'zod';

/**
 * Reuses the same property_type enum and address-field constraints as
 * `ServiceRequestPayloadSchema` (the website intake form) so a property
 * created by staff has the same validated shape as one created through
 * intake, just with camelCase field names matching this app's other
 * staff-facing schemas (create-customer-input.ts, team-member-invite.ts).
 */
export const PropertyTypeSchema = z.enum([
  'single_family',
  'rental_house',
  'rental_unit',
  'multi_family',
  'commercial',
  'other',
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const CreatePropertyInputSchema = z.object({
  customerId: z.string().uuid(),
  addressLine1: z.string().trim().min(1, 'Street address is required.').max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, 'City is required.').max(120),
  state: z.string().trim().min(2, 'State is required.').max(40),
  zip: z.string().trim().min(5, 'ZIP code is required.').max(20),
  country: z.string().trim().min(2).max(60).default('US'),
  propertyType: PropertyTypeSchema.optional(),
  accessNotes: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreatePropertyInput = z.infer<typeof CreatePropertyInputSchema>;
