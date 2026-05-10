import { z } from 'zod';

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
  preferredDateTime: z.string().trim().max(40).optional().default(''),
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
  state: z.string().trim().min(1).max(80),
  zipCode: z.string().trim().min(1).max(20),
});

export type WebsiteServiceRequestPayload = z.infer<
  typeof WebsiteServiceRequestPayloadSchema
>;
