import { z } from 'zod';

export const ExpenseCategorySchema = z.enum([
  'materials',
  'labor',
  'equipment',
  'subcontractor',
  'travel',
  'permit',
  'other',
]);

export const ExpenseStatusSchema = z.enum([
  'draft',
  'submitted',
  'needs_receipt',
  'needs_review',
  'approved',
  'rejected',
  'internal_only',
  'ready_to_invoice',
  'partially_invoiced',
  'invoiced',
  'reimbursed',
  'voided',
]);

export const ExpenseBillingTreatmentSchema = z.enum([
  'internal_cost_only',
  'included_fixed_price',
  'included_accepted_quote',
  'reimbursable_at_cost',
  'billable_with_markup',
  'customer_approved_pass_through',
  'pending_review',
  'non_billable',
]);

export const ExpenseReceiptVisibilitySchema = z.enum(['internal', 'customer_visible']);

export const ExpenseFilterSchema = z.enum([
  'all',
  'draft',
  'submitted',
  'needs-review',
  'approved',
  'ready-to-invoice',
  'invoiced',
  'internal-only',
  'rejected',
  'missing-receipt',
]);

export const CreateExpenseInputSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().trim().min(1, 'Description is required').max(200),
  category: ExpenseCategorySchema,
  vendor: z.string().trim().max(120).default(''),
  purchaseDate: z.string().trim().min(1, 'Purchase date is required').max(20),
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number' })
    .min(0, 'Amount cannot be negative')
    .max(9_999_999),
  tax: z.coerce
    .number({ invalid_type_error: 'Tax must be a number' })
    .min(0, 'Tax cannot be negative')
    .max(999_999)
    .default(0),
  paymentMethod: z
    .enum(['card', 'ach', 'check', 'cash', 'venmo', 'other'])
    .default('other'),
  billingTreatment: ExpenseBillingTreatmentSchema.default('pending_review'),
  customerChargeAmount: z.coerce
    .number({ invalid_type_error: 'Customer charge must be a number' })
    .min(0, 'Customer charge cannot be negative')
    .max(9_999_999)
    .optional(),
  markupPct: z.coerce
    .number({ invalid_type_error: 'Markup must be a number' })
    .min(0, 'Markup cannot be negative')
    .max(999)
    .optional(),
  receiptVaultItemId: z.string().uuid().optional(),
  receiptVisibility: ExpenseReceiptVisibilitySchema.default('internal'),
  internalNotes: z.string().trim().max(2000).default(''),
  customerVisibleDescription: z.string().trim().max(1000).optional(),
});

export const UpdateExpenseInputSchema = CreateExpenseInputSchema.extend({
  expenseId: z.string().uuid(),
});

export const ListExpensesArgsSchema = z.object({
  filter: ExpenseFilterSchema.default('all'),
  limit: z.number().int().positive().max(200).default(100),
  offset: z.number().int().min(0).default(0),
  search: z.string().trim().optional(),
  status: ExpenseStatusSchema.optional(),
});

export const SubmitExpenseInputSchema = z.object({
  expenseId: z.string().uuid(),
});

export const ApproveExpenseInputSchema = z.object({
  expenseId: z.string().uuid(),
  billingTreatment: ExpenseBillingTreatmentSchema,
  customerChargeAmount: z.coerce
    .number({ invalid_type_error: 'Customer charge must be a number' })
    .min(0, 'Customer charge cannot be negative')
    .max(9_999_999)
    .optional(),
  approvalComment: z.string().trim().max(1000).default(''),
});

export const RejectExpenseInputSchema = z.object({
  expenseId: z.string().uuid(),
  rejectionComment: z.string().trim().min(1, 'Rejection comment is required').max(1000),
});

export const VoidExpenseInputSchema = z.object({
  expenseId: z.string().uuid(),
});

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;
export type ExpenseBillingTreatment = z.infer<typeof ExpenseBillingTreatmentSchema>;
export type ExpenseReceiptVisibility = z.infer<typeof ExpenseReceiptVisibilitySchema>;
export type ExpenseFilter = z.infer<typeof ExpenseFilterSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInputSchema>;
export type ListExpensesArgs = z.infer<typeof ListExpensesArgsSchema>;
export type SubmitExpenseInput = z.infer<typeof SubmitExpenseInputSchema>;
export type ApproveExpenseInput = z.infer<typeof ApproveExpenseInputSchema>;
export type RejectExpenseInput = z.infer<typeof RejectExpenseInputSchema>;
export type VoidExpenseInput = z.infer<typeof VoidExpenseInputSchema>;
