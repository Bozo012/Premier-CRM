-- Structured authorization for jobs created directly from a request without
-- a quote (the direct-work-order triage path). Replaces a single free-text
-- acknowledgment note with a typed authorization_type plus its
-- conditionally-required companion fields (validated in the RPC, not here —
-- which fields are required depends on the type, a cross-field rule).
alter table public.jobs
  add column authorization_type text
    check (authorization_type in (
      'internal','standing_agreement','written_customer_authorization',
      'verbal_customer_authorization','emergency'
    )),
  add column authorized_customer_contact text,
  add column authorized_at timestamptz,
  add column authorization_note text,
  add column not_to_exceed_amount numeric(10,2),
  add column authorization_reference text;
