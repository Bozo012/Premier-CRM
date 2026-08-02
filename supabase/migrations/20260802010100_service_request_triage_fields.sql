-- Explicit, audited triage decision on every service request, plus a
-- correctable record of any change (owner/admin only, enforced at the RPC
-- layer, not here). All additive/nullable — zero backfill risk.
alter table public.service_requests
  add column triage_decision text
    check (triage_decision in ('remote_estimate','site_visit_required','direct_work_order')),
  add column triage_reason text,
  add column triaged_by uuid references auth.users(id),
  add column triaged_at timestamptz,
  add column triage_corrected_from text
    check (triage_corrected_from in ('remote_estimate','site_visit_required','direct_work_order')),
  add column triage_corrected_at timestamptz,
  add column triage_corrected_by uuid references auth.users(id),
  add column triage_correction_reason text;
