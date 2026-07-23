import { z } from 'zod';

export const InvoiceStatusSchema = z.enum([
  'draft',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'refunded',
]);

export const InvoiceKindSchema = z.enum(['deposit', 'progress', 'final', 'standalone']);

export const PaymentMethodSchema = z.enum([
  'card',
  'ach',
  'check',
  'cash',
  'venmo',
  'other',
]);

export const CreateInvoiceFromJobInputSchema = z.object({
  jobId: z.string().uuid(),
  kind: InvoiceKindSchema.default('standalone'),
});

export const CreateInvoiceFromQuoteInputSchema = z.object({
  quoteId: z.string().uuid(),
  kind: InvoiceKindSchema.default('standalone'),
  // Copy the accepted quote's line items in as snapshots (traceable via
  // quote_line_id, never live-synced).
  copyLineItems: z.coerce.boolean().default(true),
});

export const ListInvoicesArgsSchema = z.object({
  limit: z.number().int().positive().max(200).default(100),
  offset: z.number().int().min(0).default(0),
  search: z.string().optional(),
  status: InvoiceStatusSchema.optional(),
});

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type InvoiceKind = z.infer<typeof InvoiceKindSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type CreateInvoiceFromJobInput = z.infer<typeof CreateInvoiceFromJobInputSchema>;
export type CreateInvoiceFromQuoteInput = z.infer<typeof CreateInvoiceFromQuoteInputSchema>;
export type ListInvoicesArgs = z.infer<typeof ListInvoicesArgsSchema>;

// ---------------------------------------------------------------------------
// Line item mutations
// ---------------------------------------------------------------------------

export const AddInvoiceLineItemInputSchema = z.object({
  invoiceId: z.string().uuid(),
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
});

export const UpdateInvoiceLineItemInputSchema = z.object({
  lineItemId: z.string().uuid(),
  invoiceId: z.string().uuid(),
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
});

export const RemoveInvoiceLineItemInputSchema = z.object({
  lineItemId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export const UpdateInvoiceMetadataInputSchema = z.object({
  invoiceId: z.string().uuid(),
  title: z.string().max(200),
  kind: InvoiceKindSchema,
  // Empty string clears the date; YYYY-MM-DD sets it.
  issuedDate: z.string().max(20),
  dueDate: z.string().max(20),
  discountAmount: z.coerce
    .number({ invalid_type_error: 'Discount must be a number' })
    .min(0, 'Discount cannot be negative')
    .max(999_999),
  taxPct: z.coerce
    .number({ invalid_type_error: 'Tax rate must be a number' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%'),
  notes: z.string().max(2000),
  terms: z.string().max(2000),
});

export type UpdateInvoiceMetadataInput = z.infer<typeof UpdateInvoiceMetadataInputSchema>;

export const SendInvoiceInputSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const VoidInvoiceInputSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const RecordPaymentInputSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be greater than 0')
    .max(9_999_999),
  method: PaymentMethodSchema,
  paidAt: z.string().min(1, 'Payment date is required').max(20),
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export type SendInvoiceInput = z.infer<typeof SendInvoiceInputSchema>;
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInputSchema>;
export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;
export type AddInvoiceLineItemInput = z.infer<typeof AddInvoiceLineItemInputSchema>;
export type UpdateInvoiceLineItemInput = z.infer<typeof UpdateInvoiceLineItemInputSchema>;
export type RemoveInvoiceLineItemInput = z.infer<typeof RemoveInvoiceLineItemInputSchema>;
