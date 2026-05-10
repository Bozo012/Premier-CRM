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

export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;
export type QuoteType = z.infer<typeof QuoteTypeSchema>;
export type CreateQuoteFromJobInput = z.infer<
  typeof CreateQuoteFromJobInputSchema
>;
