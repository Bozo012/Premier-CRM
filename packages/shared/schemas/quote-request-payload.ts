import { z } from 'zod';

/**
 * Validated payload shape for the public `/api/v1/quote-requests` endpoint.
 *
 * Sent by the marketing site (ppmnky.com) when a visitor submits the contact /
 * intake form. The endpoint is unauthenticated, so this schema is the security
 * boundary — anything not on this schema is rejected before it touches the DB.
 *
 * At least one of `email` or `phone` is required. We use that pair to dedupe
 * against existing customers; if the submitter supplies neither, we have no
 * way to identify them as a returning customer or to follow up.
 *
 * `_hp` is a honeypot field. Real users never see it (display:none in the
 * form), so a non-empty value almost certainly indicates a bot. The endpoint
 * silently accepts honeypot-positive submissions without writing anything,
 * so bots don't learn that they've been detected.
 */
export const QuoteRequestPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
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
    timeline: z
      .enum([
        'asap',
        'this_week',
        'this_month',
        'flexible',
        'planning_only',
      ])
      .optional(),
    service_needed: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000),
    photo_urls: z.array(z.string().url().max(2048)).max(10).optional(),
    // Honeypot — see file-level note. Must be empty/absent for the request to
    // proceed.
    _hp: z.string().max(0).optional(),
  })
  .refine(
    (data) => Boolean(data.email || data.phone),
    {
      message: 'At least one of email or phone is required.',
      path: ['email'],
    }
  );

export type QuoteRequestPayload = z.infer<typeof QuoteRequestPayloadSchema>;
