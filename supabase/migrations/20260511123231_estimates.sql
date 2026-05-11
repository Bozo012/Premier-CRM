-- Premier CRM — First-class Estimates layer
-- Migration: 20260511000000_estimates
--
-- Introduces the estimates table as a distinct operational stage between
-- service_requests and jobs, implementing the intended backbone:
--
--   Request → Estimate → Quote → Job → Invoice
--
-- The existing lead-status Job bridge remains untouched. No existing rows
-- or constraints are modified. This migration only adds new objects.
--
-- service_requests gains a nullable estimate_id FK so a request knows
-- which estimate was opened from it without altering any existing columns.

-- ============================================================================
-- TYPES
-- ============================================================================

CREATE TYPE public.estimate_status AS ENUM (
  'draft',                  -- opened from request, not yet visited or scoped
  'site_visit_scheduled',   -- site visit booked
  'site_visit_complete',    -- visited; scoping / pricing in progress
  'quoted',                 -- at least one quote has been sent to the customer
  'accepted',               -- customer accepted a quote
  'declined',               -- customer declined all options
  'expired',                -- no response; estimate closed
  'converted'               -- terminal: job created from this estimate
);

-- ============================================================================
-- ESTIMATE NUMBERING
-- ============================================================================

CREATE SEQUENCE public.estimate_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_estimate_number()
RETURNS TEXT AS $$
  SELECT 'EST-' || to_char(nextval('public.estimate_number_seq'), 'FM000000');
$$ LANGUAGE sql VOLATILE
   SET search_path = public;

-- ============================================================================
-- ESTIMATES
-- ============================================================================

CREATE TABLE public.estimates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_number       TEXT NOT NULL DEFAULT public.next_estimate_number(),
  status                public.estimate_status NOT NULL DEFAULT 'draft',

  -- Origin: the service request that triggered this estimate (nullable so
  -- manually-created estimates are possible in future without a request).
  service_request_id    UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,

  -- Core relationships — both required, matching jobs.property_id NOT NULL
  -- to keep the data model consistent across the post-approval lifecycle.
  customer_id           UUID NOT NULL REFERENCES public.customers(id),
  property_id           UUID NOT NULL REFERENCES public.properties(id),

  -- Content
  title                 TEXT NOT NULL,
  description           TEXT,

  -- Site visit capture
  site_visit_at         TIMESTAMPTZ,
  site_visit_notes      TEXT,

  -- Outcome: when accepted → converted, this points to the resulting job.
  -- ON DELETE SET NULL so deleting a job does not destroy estimate history.
  converted_job_id      UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  converted_at          TIMESTAMPTZ,
  expires_at            DATE,

  -- Lifecycle
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT estimates_estimate_number_unique UNIQUE (estimate_number)
);

CREATE INDEX estimates_org_status_idx   ON public.estimates (org_id, status);
CREATE INDEX estimates_org_created_idx  ON public.estimates (org_id, created_at DESC);
CREATE INDEX estimates_customer_idx     ON public.estimates (customer_id);
CREATE INDEX estimates_property_idx     ON public.estimates (property_id);
CREATE INDEX estimates_request_idx      ON public.estimates (service_request_id)
  WHERE service_request_id IS NOT NULL;
CREATE INDEX estimates_converted_job_idx ON public.estimates (converted_job_id)
  WHERE converted_job_id IS NOT NULL;

CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- SERVICE REQUESTS — back-reference to the estimate opened from a request
-- ============================================================================
-- Nullable: requests submitted before this migration have no estimate yet.
-- Requests created manually (not converted) also remain NULL here.

ALTER TABLE public.service_requests
  ADD COLUMN estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL;

CREATE INDEX service_requests_estimate_idx ON public.service_requests (estimate_id)
  WHERE estimate_id IS NOT NULL;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

-- Org staff: full access to estimates within their org.
CREATE POLICY "internal_org_estimates" ON public.estimates
  FOR ALL USING (public.user_is_in_org(org_id));

-- ============================================================================
-- GRANTS — authenticated role (org staff via Supabase Auth)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimates TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_estimate_number() TO authenticated;

-- ============================================================================
-- GRANTS — service_role (server-side writes, bypasses RLS)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.estimate_number_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.next_estimate_number() TO service_role;
