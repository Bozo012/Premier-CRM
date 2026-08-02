-- No RLS SELECT policy is ever added to site_visits for the customer role —
-- RLS is row-level, not column-level, and this table has columns
-- (inspection_responses, cancellation_reason, actor identities) that must
-- never reach the portal. This function's RETURNS TABLE list is the entire
-- portal-visible surface, by construction.
create or replace function public.get_my_site_visit_summary(p_service_request_id uuid)
returns table (
  site_visit_id uuid,
  safe_status text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  is_rescheduled boolean,
  is_cancelled boolean
)
security definer
set search_path = public
language sql
stable
as $$
  select
    sv.id,
    sv.status::text,
    appt.scheduled_start,
    appt.scheduled_end,
    (appt.supersedes_appointment_id is not null),
    (sv.status = 'cancelled')
  from public.site_visits sv
  join public.service_requests sr on sr.id = sv.service_request_id
  join public.customer_accounts ca on ca.customer_id = sr.customer_id
  left join public.site_visit_appointments appt on appt.site_visit_id = sv.id and appt.status = 'scheduled'
  where sv.service_request_id = p_service_request_id
    and ca.auth_user_id = auth.uid()
    and ca.status = 'active';
$$;

grant execute on function public.get_my_site_visit_summary(uuid) to authenticated;
