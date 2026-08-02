-- Regression found running the full existing E2E suite: the quote
-- eligibility trigger fired for EVERY estimate-linked quote, which broke the
-- pre-existing "manual estimate -> approve -> create quote" flow (an
-- established, unmodified system this workflow must not touch) — those
-- estimates never go through approve_estimate_pricing(), so they'd never
-- pass pricing_reviewed_at IS NOT NULL.
--
-- Fix: scope the gate to only estimates that actually went through the new
-- triage system (service_requests.triage_decision IS NOT NULL) — this
-- covers both the site_visit_required and remote_estimate paths (both set
-- triage_decision), while leaving every pre-existing estimate-creation path
-- (manual estimates, the old createEstimateFromRequestAction flow, neither
-- of which ever sets triage_decision) exactly as it worked before.
create or replace function public.enforce_quote_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
  v_triage_decision text;
begin
  if new.estimate_id is not null then
    select * into v_estimate from public.estimates where id = new.estimate_id;
    if v_estimate is null then
      raise exception 'Referenced estimate does not exist';
    end if;

    if v_estimate.service_request_id is not null then
      select triage_decision into v_triage_decision from public.service_requests where id = v_estimate.service_request_id;
    end if;

    -- Only estimates that went through the new triage system are gated.
    if v_triage_decision is not null then
      if v_estimate.pricing_reviewed_at is null or v_estimate.pricing_reviewed_by is null then
        raise exception 'Estimate pricing must be reviewed and approved before a quote can be created';
      end if;
      if v_estimate.source_site_visit_id is not null then
        if (select status from public.site_visits where id = v_estimate.source_site_visit_id) != 'completed' then
          raise exception 'The source site visit must be completed before a quote can be created';
        end if;
      end if;
      if exists (select 1 from public.quotes where estimate_id = new.estimate_id and status != 'declined') then
        raise exception 'An active quote already exists for this estimate';
      end if;
    end if;

    if new.org_id != v_estimate.org_id then
      raise exception 'Quote org must match the source estimate org';
    end if;
  end if;
  return new;
end;
$$;
