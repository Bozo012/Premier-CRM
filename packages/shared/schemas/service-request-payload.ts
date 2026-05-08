import { z } from 'zod';

export const ServiceRequestPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
    preferred_channel: z.enum(['sms', 'email', 'call', 'portal']).optional(),
    address_line_1: z.string().trim().min(1).max(200),
    address_line_2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(2).max(40),
    zip: z.string().trim().min(5).max(20),
    country: z.string().trim().min(2).max(60).default('US'),
    property_type: z
      .enum([
        'single_family',
        'rental_house',
        'rental_unit',
        'multi_family',
        'commercial',
        'other',
      ])
      .optional(),
    service_category: z.string().trim().min(1).max(120).optional(),
    service_title: z.string().trim().min(1).max(200),
    service_description: z.string().trim().min(1).max(5000),
    preferred_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferred_time: z.string().trim().min(1).max(120).optional(),
    access_notes: z.string().trim().max(2000).optional(),
    priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
    _hp: z.string().max(0).optional(),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'At least one of email or phone is required.',
    path: ['email'],
  });

export type ServiceRequestPayload = z.infer<typeof ServiceRequestPayloadSchema>;
