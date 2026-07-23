import { z } from 'zod';

export const CustomerTypeSchema = z.enum(['residential', 'commercial', 'property_manager']);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;

export const PreferredChannelSchema = z.enum(['sms', 'email', 'call', 'portal']);
export type PreferredChannel = z.infer<typeof PreferredChannelSchema>;

/**
 * Validated input for manually creating a customer from the staff app
 * (`/customers/new`). Matches the `customers` table's actual nullability —
 * only `type` is required at the DB level — plus one UI-level rule: a
 * customer needs *some* name to display (matches the `display_name`
 * generated column: `COALESCE(company_name, first+last)` — a row with none
 * of those would show as "Unnamed customer" everywhere, so this form
 * requires enough to avoid creating one on purpose).
 *
 * `email` accepts an empty string (from an untouched form field) as
 * equivalent to "not provided" — callers should treat `''` as `null` when
 * writing to the database.
 */
export const CreateCustomerInputSchema = z
  .object({
    type: CustomerTypeSchema.default('residential'),
    firstName: z.string().trim().max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(200).optional(),
    email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]).optional(),
    phonePrimary: z.string().trim().max(30).optional(),
    phoneSecondary: z.string().trim().max(30).optional(),
    preferredChannel: PreferredChannelSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    const hasPersonalName = Boolean(value.firstName || value.lastName);
    const hasCompanyName = Boolean(value.companyName);
    if (!hasPersonalName && !hasCompanyName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a name or a company name.',
        path: ['firstName'],
      });
    }
  });

export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;
