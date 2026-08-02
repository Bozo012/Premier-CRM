import { z } from 'zod';

// 50 states + DC, uppercase two-letter codes only. Prevents free-text values
// like "ty" from ever reaching a structured column.
export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

// A bare HTML datetime-local value: "YYYY-MM-DDTHH:mm", no timezone offset.
// Deliberately not parsed into a JS Date anywhere in this schema — see
// toServiceRequestPayload() in apps/web's route handler for why.
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const WebsiteServiceRequestPayloadSchema = z.object({
  accessInstructions: z.string().trim().max(1000).optional().default(''),
  additionalNotes: z.string().trim().max(3000).optional().default(''),
  addressLine1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  customerType: z.string().trim().min(1).max(80),
  emailAddress: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(7).max(40),
  preferredContactMethod: z.enum(['phone', 'text', 'email']),
  preferredDateTime: z
    .string()
    .trim()
    .max(40)
    .optional()
    .default('')
    .refine((v) => v === '' || DATETIME_LOCAL_PATTERN.test(v), {
      message: 'preferredDateTime must be a valid datetime-local value (YYYY-MM-DDTHH:mm) or empty.',
    }),
  priorityLevel: z.enum(['emergency', 'urgent', 'normal', 'low']),
  problemDescription: z.string().trim().min(1).max(5000),
  propertyType: z.enum([
    'single-family',
    'multi-family',
    'condo',
    'apartment',
    'commercial',
  ]),
  serviceCategory: z.string().trim().min(1).max(120),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => (US_STATE_CODES as readonly string[]).includes(v), {
      message: 'state must be a valid two-letter US state or DC code.',
    }),
  zipCode: z.string().trim().min(1).max(20),
});

export type WebsiteServiceRequestPayload = z.infer<
  typeof WebsiteServiceRequestPayloadSchema
>;
