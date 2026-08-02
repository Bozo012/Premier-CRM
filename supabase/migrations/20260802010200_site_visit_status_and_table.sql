-- Site visits originate from service requests, not estimates. An estimate is
-- a later, optional product of a completed visit (linked via
-- estimates.source_site_visit_id in a later migration) — site_visits never
-- points forward to an estimate.
create type public.site_visit_status as enum (
  'awaiting_scheduling', 'scheduled', 'in_progress', 'completed', 'cancelled'
);

create table public.site_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  service_request_id uuid not null references public.service_requests(id),
  status public.site_visit_status not null default 'awaiting_scheduling',
  assigned_user_id uuid references auth.users(id),
  started_at timestamptz,
  started_by uuid references auth.users(id),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  inspection_template_version_id uuid, -- FK added once inspection_template_versions exists
  inspection_responses jsonb,
  response_schema_version integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_visits_one_per_request unique (service_request_id)
);

create index site_visits_org_id_idx on public.site_visits(org_id);
create index site_visits_status_idx on public.site_visits(status);

alter table public.site_visits enable row level security;

create policy "internal_org_site_visits" on public.site_visits
  for all using (public.user_is_in_org(org_id));

-- No customer-portal policy on this table at all (see the dedicated
-- get_my_site_visit_summary() RPC in a later migration) — RLS is row-level,
-- not column-level, and this table has columns (inspection_responses,
-- cancellation_reason, actor identities) that must never reach the portal.

-- Legal transition trigger, fires for every role including service_role.
create or replace function public.enforce_site_visit_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    if not (
      (old.status = 'awaiting_scheduling' and new.status = 'scheduled') or
      (old.status = 'scheduled' and new.status = 'in_progress') or
      (old.status = 'scheduled' and new.status = 'awaiting_scheduling') or
      (old.status = 'in_progress' and new.status = 'completed') or
      (old.status in ('awaiting_scheduling','scheduled') and new.status = 'cancelled')
    ) then
      raise exception 'Illegal site_visits status transition: % -> %', old.status, new.status;
    end if;
  end if;

  -- Findings are immutable once completed.
  if TG_OP = 'UPDATE' and old.completed_at is not null then
    if new.inspection_responses is distinct from old.inspection_responses
      or new.response_schema_version is distinct from old.response_schema_version then
      raise exception 'inspection_responses is immutable after site visit completion';
    end if;
  end if;

  return new;
end;
$$;

create trigger site_visits_enforce_transitions
  before update on public.site_visits
  for each row execute function public.enforce_site_visit_transitions();
