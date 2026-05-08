-- Premier CRM — Service requests and customer portal accounts
-- Migration: 0012_service_requests_and_customer_accounts
--
-- Adds the text-only Service Request intake model used by the public
-- marketing-site bridge and the first CRM-hosted customer portal account map.

-- ============================================================================
-- TYPES
-- ============================================================================

CREATE TYPE public.service_request_source AS ENUM (
  'website',
  'portal',
  'phone',
  'sms',
  'email',
  'manual',
  'ai_capture',
  'jobber_import'
);

CREATE TYPE public.service_request_status AS ENUM (
  'new',
  'reviewing',
  'approved',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'spam'
);

CREATE TYPE public.service_request_priority AS ENUM (
  'low',
  'normal',
  'high',
  'emergency'
);

CREATE TYPE public.customer_account_status AS ENUM (
  'invited',
  'active',
  'disabled'
);

-- ============================================================================
-- REQUEST NUMBERING
-- ============================================================================

CREATE SEQUENCE public.service_request_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_service_request_number()
RETURNS TEXT AS $$
  SELECT 'SR-' || to_char(nextval('public.service_request_number_seq'), 'FM000000');
$$ LANGUAGE sql VOLATILE
   SET search_path = public;

-- ============================================================================
-- SERVICE REQUESTS
-- ============================================================================

CREATE TABLE public.service_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_number        TEXT NOT NULL DEFAULT public.next_service_request_number(),
  source                public.service_request_source NOT NULL DEFAULT 'website',
  status                public.service_request_status NOT NULL DEFAULT 'new',
  priority              public.service_request_priority NOT NULL DEFAULT 'normal',
  customer_id           UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  property_id           UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  job_id                UUID REFERENCES public.jobs(id) ON DELETE SET NULL,

  -- Contact snapshot at submission time. These fields preserve what the
  -- customer typed even if the canonical customer record is cleaned up later.
  contact_name          TEXT NOT NULL,
  contact_email         CITEXT,
  contact_phone         TEXT,
  contact_preferred_channel public.preferred_channel,

  -- Property snapshot at submission time. Address is required for normal
  -- incoming service requests and duplicated here for intake triage.
  property_address_line_1 TEXT NOT NULL,
  property_address_line_2 TEXT,
  property_city         TEXT NOT NULL,
  property_state        TEXT NOT NULL,
  property_zip          TEXT NOT NULL,
  property_country      TEXT NOT NULL DEFAULT 'US',
  property_type         TEXT,

  service_category      TEXT,
  service_title         TEXT NOT NULL,
  service_description   TEXT NOT NULL,
  preferred_date        DATE,
  preferred_time        TEXT,
  access_notes          TEXT,
  internal_notes        TEXT,

  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at           TIMESTAMPTZ,
  converted_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT service_requests_request_number_unique UNIQUE (request_number),
  CONSTRAINT service_requests_website_unreviewed CHECK (
    source <> 'website' OR (status = 'new' AND reviewed_at IS NULL)
  )
);

CREATE INDEX service_requests_org_status_idx ON public.service_requests (org_id, status);
CREATE INDEX service_requests_customer_idx ON public.service_requests (customer_id);
CREATE INDEX service_requests_property_idx ON public.service_requests (property_id);
CREATE INDEX service_requests_job_idx ON public.service_requests (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX service_requests_submitted_at_idx ON public.service_requests (submitted_at DESC);

CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- CUSTOMER ACCOUNTS
-- ============================================================================

CREATE TABLE public.customer_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL,
  status          public.customer_account_status NOT NULL DEFAULT 'invited',
  invited_at      TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_accounts_org_customer_unique UNIQUE (org_id, customer_id),
  CONSTRAINT customer_accounts_auth_user_unique UNIQUE (auth_user_id),
  CONSTRAINT customer_accounts_org_email_unique UNIQUE (org_id, email)
);

CREATE INDEX customer_accounts_org_idx ON public.customer_accounts (org_id);
CREATE INDEX customer_accounts_customer_idx ON public.customer_accounts (customer_id);
CREATE INDEX customer_accounts_email_idx ON public.customer_accounts (email);

CREATE TRIGGER customer_accounts_updated_at
  BEFORE UPDATE ON public.customer_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_org_service_requests" ON public.service_requests
  FOR ALL USING (public.user_is_in_org(org_id));

CREATE POLICY "customer_select_own_service_requests" ON public.service_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND ca.customer_id = service_requests.customer_id
    )
  );

CREATE POLICY "customer_insert_own_portal_service_requests" ON public.service_requests
  FOR INSERT WITH CHECK (
    source = 'portal'
    AND status = 'new'
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND ca.customer_id = service_requests.customer_id
        AND ca.org_id = service_requests.org_id
    )
  );

CREATE POLICY "internal_org_customer_accounts" ON public.customer_accounts
  FOR ALL USING (public.user_is_in_org(org_id));

CREATE POLICY "customer_select_own_account" ON public.customer_accounts
  FOR SELECT USING (auth_user_id = auth.uid());

-- Customer portal visibility for canonical customer/property rows. These are
-- SELECT-only and scoped through customer_accounts; they do not grant access to
-- all org data and do not make customer accounts org members.
CREATE POLICY "customer_select_own_customer" ON public.customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND ca.customer_id = customers.id
    )
  );

CREATE POLICY "customer_select_own_customer_properties" ON public.customer_properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      WHERE ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND ca.customer_id = customer_properties.customer_id
    )
  );

CREATE POLICY "customer_select_own_properties" ON public.properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.customer_accounts ca
      JOIN public.customer_properties cp ON cp.customer_id = ca.customer_id
      WHERE ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND cp.property_id = properties.id
    )
  );

-- Grants let authenticated Supabase users attempt access; RLS policies above
-- decide which rows are visible. The public intake endpoint writes with the
-- server-side service role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_service_request_number() TO authenticated;
