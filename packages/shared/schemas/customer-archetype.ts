import { z } from 'zod';

/**
 * Mirrors the Postgres `customer_archetype` enum from migration 0007.
 *
 * The values must stay in sync with the database enum. If the DB enum is
 * expanded (e.g., a new archetype is added), update this list and run
 * `pnpm db:types` so the generated types pick up the change.
 */
export const CustomerArchetypeSchema = z.enum([
  'residential_one_off',
  'residential_repeat',
  'landlord_small',
  'landlord_growing',
  'property_manager',
  'commercial',
  'unknown',
]);

export type CustomerArchetype = z.infer<typeof CustomerArchetypeSchema>;
