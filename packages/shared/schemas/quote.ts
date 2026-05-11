import { z } from 'zod';

export const QuoteStatusSchema = z.enum([
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'revised',
]);

export const QuoteTypeSchema = z.enum([
  'standard',
  'options',
  'package',
  'quick',
]);

export const CreateQuoteFromJobInputSchema = z.object({
  jobId: z.string().uuid(),
});

export const ListQuotesArgsSchema = z.object({
  limit: z.number().int().positive().max(200).default(100),
  offset: z.number().int().min(0).default(0),
  search: z.string().optional(),
  status: QuoteStatusSchema.optional(),
});

export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;
export type QuoteType = z.infer<typeof QuoteTypeSchema>;
export type CreateQuoteFromJobInput = z.infer<
  typeof CreateQuoteFromJobInputSchema
>;
export type ListQuotesArgs = z.infer<typeof ListQuotesArgsSchema>;

// ---------------------------------------------------------------------------
// Line item mutations
// ---------------------------------------------------------------------------

export const AddLineItemInputSchema = z.object({
  quoteId: z.string().uuid(),
  // Optional link to a service catalog item; null means fully manual.
  serviceId: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  unit: z.string().min(1, 'Unit is required').max(50),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be greater than 0')
    .max(99999),
  unitPrice: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative')
    .max(9_999_999),
  markupPct: z.coerce.number().min(0).max(100).optional(),
});

export const UpdateLineItemInputSchema = z.object({
  lineItemId: z.string().uuid(),
  quoteId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  unit: z.string().min(1, 'Unit is required').max(50),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be greater than 0')
    .max(99999),
  unitPrice: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative')
    .max(9_999_999),
  markupPct: z.coerce.number().min(0).max(100).optional(),
});

export const RemoveLineItemInputSchema = z.object({
  lineItemId: z.string().uuid(),
  quoteId: z.string().uuid(),
});

export const SendQuoteInputSchema = z.object({
  quoteId: z.string().uuid(),
});

export const RespondToQuoteInputSchema = z.object({
  token: z.string().uuid(),
  response: z.enum(['accept', 'decline']),
  declineReason: z.string().max(500).optional(),
});

export type SendQuoteInput = z.infer<typeof SendQuoteInputSchema>;
export type RespondToQuoteInput = z.infer<typeof RespondToQuoteInputSchema>;
export type AddLineItemInput = z.infer<typeof AddLineItemInputSchema>;
export type UpdateLineItemInput = z.infer<typeof UpdateLineItemInputSchema>;
export type RemoveLineItemInput = z.infer<typeof RemoveLineItemInputSchema>;
