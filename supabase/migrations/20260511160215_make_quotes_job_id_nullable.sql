-- Allow quotes to belong to an estimate before a job exists.
-- The CHECK ensures every quote has at least one anchor.
ALTER TABLE public.quotes ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_has_job_or_estimate
  CHECK (job_id IS NOT NULL OR estimate_id IS NOT NULL);
