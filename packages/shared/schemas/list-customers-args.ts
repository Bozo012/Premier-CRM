import { z } from 'zod';

import { CustomerArchetypeSchema } from './customer-archetype';

/**
 * Validated input shape for `listCustomers` in `@premier/db/queries/customers`.
 *
 * Parse this in callers that receive untrusted input (URL search params,
 * server action arguments). The query function itself accepts the inferred
 * `ListCustomersArgs` type and assumes its caller has already validated.
 *
 * Notes on individual fields:
 * - `orgId` — caller is responsible for sourcing this from the authenticated
 *   user's active org membership, NOT from the URL or the request body.
 *   Server-component code typically resolves this from `org_members` after
 *   reading the session.
 * - `search` — undefined means "no search filter". Empty/whitespace strings
 *   are rejected (use undefined instead). Pass-through callers (URL params)
 *   should map "" to undefined before validation.
 * - `archetype` — undefined means "all archetypes".
 * - `limit` — capped at 100 to keep page size sane.
 * - `offset` — non-negative integer for cursor-style pagination.
 */
export const ListCustomersArgsSchema = z.object({
  orgId: z.string().uuid(),
  search: z.string().trim().min(1).max(200).optional(),
  archetype: CustomerArchetypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ListCustomersArgs = z.infer<typeof ListCustomersArgsSchema>;
