-- Add 'working' as an invoice_kind. Split into its own migration: Postgres
-- does not allow a new enum value to be referenced by name (e.g. in a
-- partial index predicate) within the same transaction that added it.

ALTER TYPE public.invoice_kind ADD VALUE 'working';
