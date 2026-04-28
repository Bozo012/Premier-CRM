-- Premier CRM — Jobber import deduplication columns
-- Migration: 0011_jobber_import_columns
--
-- Adds jobber_id TEXT columns to every table that will receive imported data.
-- During the Phase 0.5 import wizard, these are used to:
--   1. Match incoming Jobber rows to existing rows (re-import safety)
--   2. Prevent duplicate inserts when the import is re-run
--   3. Preserve the Jobber ID for reference / future reconciliation
--
-- UNIQUE allows multiple NULLs in Postgres (rows created after import don't
-- need a jobber_id). Indexes cover the fast-path dedup lookup in the wizard.

-- customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS customers_jobber_id_idx
  ON public.customers (jobber_id)
  WHERE jobber_id IS NOT NULL;

-- properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS properties_jobber_id_idx
  ON public.properties (jobber_id)
  WHERE jobber_id IS NOT NULL;

-- jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS jobs_jobber_id_idx
  ON public.jobs (jobber_id)
  WHERE jobber_id IS NOT NULL;

-- quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS quotes_jobber_id_idx
  ON public.quotes (jobber_id)
  WHERE jobber_id IS NOT NULL;

-- invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS invoices_jobber_id_idx
  ON public.invoices (jobber_id)
  WHERE jobber_id IS NOT NULL;

-- time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS jobber_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS time_entries_jobber_id_idx
  ON public.time_entries (jobber_id)
  WHERE jobber_id IS NOT NULL;
