-- Job origin tracking: accepted quote -> job.
--
-- Adds explicit origin columns so accepted-quote-to-job creation can be made
-- idempotent at the database boundary (a partial unique index), not just via
-- an application-level check-then-insert which is racy under concurrent
-- accept callbacks. Also lets a job trace back to the estimate and service
-- request that produced it without walking the reverse FKs
-- (quotes.job_id / estimates.converted_job_id).
--
-- Additive only: no existing column, constraint, or row is altered.

ALTER TABLE public.jobs
  ADD COLUMN origin_quote_id    UUID REFERENCES public.quotes(id),
  ADD COLUMN origin_estimate_id UUID REFERENCES public.estimates(id),
  ADD COLUMN origin_request_id  UUID REFERENCES public.service_requests(id);

-- The DB-enforced idempotency guard: at most one job per originating quote.
-- A second concurrent accept-callback's insert will fail this constraint;
-- the calling service catches the conflict and returns the existing job
-- instead of creating a duplicate (see job-lifecycle.ts).
CREATE UNIQUE INDEX jobs_origin_quote_unique
  ON public.jobs (origin_quote_id)
  WHERE origin_quote_id IS NOT NULL;

CREATE INDEX jobs_origin_estimate_idx ON public.jobs (origin_estimate_id)
  WHERE origin_estimate_id IS NOT NULL;
CREATE INDEX jobs_origin_request_idx ON public.jobs (origin_request_id)
  WHERE origin_request_id IS NOT NULL;

-- ============================================================================
-- Cross-org / cross-chain consistency guard
-- ============================================================================
-- A job's origin quote, estimate, and request must belong to the same org
-- as the job itself, and — when more than one origin link is set — must
-- actually be the same lifecycle chain (quote.estimate_id = origin_estimate_id,
-- estimate.service_request_id = origin_request_id). This cannot be expressed
-- as a plain CHECK constraint (those can't reference other tables), so it's
-- a trigger.

CREATE OR REPLACE FUNCTION public.validate_job_origin_consistency()
RETURNS TRIGGER AS $$
DECLARE
  quote_org UUID;
  quote_estimate_id UUID;
  estimate_org UUID;
  estimate_request_id UUID;
  request_org UUID;
BEGIN
  IF NEW.origin_quote_id IS NOT NULL THEN
    SELECT org_id, estimate_id INTO quote_org, quote_estimate_id
    FROM public.quotes WHERE id = NEW.origin_quote_id;

    IF quote_org IS NULL THEN
      RAISE EXCEPTION 'origin_quote_id % does not exist', NEW.origin_quote_id;
    END IF;
    IF quote_org != NEW.org_id THEN
      RAISE EXCEPTION 'origin_quote_id belongs to a different organization';
    END IF;
    IF NEW.origin_estimate_id IS NOT NULL AND quote_estimate_id IS NOT NULL
       AND quote_estimate_id != NEW.origin_estimate_id THEN
      RAISE EXCEPTION 'origin_estimate_id does not match origin_quote_id''s estimate';
    END IF;
  END IF;

  IF NEW.origin_estimate_id IS NOT NULL THEN
    SELECT org_id, service_request_id INTO estimate_org, estimate_request_id
    FROM public.estimates WHERE id = NEW.origin_estimate_id;

    IF estimate_org IS NULL THEN
      RAISE EXCEPTION 'origin_estimate_id % does not exist', NEW.origin_estimate_id;
    END IF;
    IF estimate_org != NEW.org_id THEN
      RAISE EXCEPTION 'origin_estimate_id belongs to a different organization';
    END IF;
    IF NEW.origin_request_id IS NOT NULL AND estimate_request_id IS NOT NULL
       AND estimate_request_id != NEW.origin_request_id THEN
      RAISE EXCEPTION 'origin_request_id does not match origin_estimate_id''s service request';
    END IF;
  END IF;

  IF NEW.origin_request_id IS NOT NULL THEN
    SELECT org_id INTO request_org
    FROM public.service_requests WHERE id = NEW.origin_request_id;

    IF request_org IS NULL THEN
      RAISE EXCEPTION 'origin_request_id % does not exist', NEW.origin_request_id;
    END IF;
    IF request_org != NEW.org_id THEN
      RAISE EXCEPTION 'origin_request_id belongs to a different organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER jobs_validate_origin_consistency
  BEFORE INSERT OR UPDATE OF origin_quote_id, origin_estimate_id, origin_request_id
  ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_origin_consistency();

-- ============================================================================
-- Backfill — only where the relationship is unambiguous
-- ============================================================================

-- origin_quote_id: reverse of quotes.job_id, only where exactly one quote
-- points at a given job (avoids guessing when multiple quote revisions
-- happen to share a job_id).
UPDATE public.jobs j
SET origin_quote_id = q.id
FROM public.quotes q
WHERE q.job_id = j.id
  AND j.origin_quote_id IS NULL
  AND (SELECT count(*) FROM public.quotes q2 WHERE q2.job_id = j.id) = 1;

-- origin_estimate_id / origin_request_id: reverse of estimates.converted_job_id,
-- same uniqueness guard.
UPDATE public.jobs j
SET origin_estimate_id = e.id,
    origin_request_id = e.service_request_id
FROM public.estimates e
WHERE e.converted_job_id = j.id
  AND j.origin_estimate_id IS NULL
  AND (SELECT count(*) FROM public.estimates e2 WHERE e2.converted_job_id = j.id) = 1;
