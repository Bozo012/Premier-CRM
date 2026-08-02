-- Links a generated estimate back to its source site visit (the ONLY
-- direction of this relationship — site_visits never points forward to an
-- estimate) plus explicit staff pricing-review fields. No
-- estimates.site_visit_status column exists anywhere in this schema — visit
-- state is read live through source_site_visit_id via the
-- estimate_visit_state view below.
alter table public.estimates
  add column source_site_visit_id uuid references public.site_visits(id),
  add constraint estimates_source_site_visit_id_unique unique (source_site_visit_id),
  add column pricing_reviewed_at timestamptz,
  add column pricing_reviewed_by uuid references auth.users(id);

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  is_system_suggested boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index estimate_line_items_estimate_id_idx on public.estimate_line_items(estimate_id);

alter table public.estimate_line_items enable row level security;
create policy "internal_org_estimate_line_items" on public.estimate_line_items
  for all using (public.user_is_in_org(org_id));

-- Read-optimization view, DB-maintained (never a manually-synced column) —
-- staff-only badges/filters query this instead of a denormalized status.
create view public.estimate_visit_state as
select
  e.id as estimate_id,
  e.source_site_visit_id,
  sv.status as site_visit_status,
  sv.completed_at as site_visit_completed_at
from public.estimates e
left join public.site_visits sv on sv.id = e.source_site_visit_id;

-- Lock approved estimate content until explicitly reopened.
create or replace function public.enforce_estimate_pricing_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate record;
begin
  if TG_TABLE_NAME = 'estimate_line_items' then
    select * into v_estimate from public.estimates where id = coalesce(new.estimate_id, old.estimate_id);
    if v_estimate.pricing_reviewed_at is not null then
      raise exception 'Estimate pricing is approved — call reopen_estimate_for_edit() before editing line items';
    end if;
    return coalesce(new, old);
  end if;

  if TG_TABLE_NAME = 'estimates' and TG_OP = 'UPDATE' then
    if old.pricing_reviewed_at is not null
      and new.pricing_reviewed_at is not distinct from old.pricing_reviewed_at
      and new.description is distinct from old.description then
      raise exception 'Estimate pricing is approved — call reopen_estimate_for_edit() before editing the description';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create trigger estimate_line_items_enforce_pricing_lock
  before insert or update or delete on public.estimate_line_items
  for each row execute function public.enforce_estimate_pricing_lock();

create trigger estimates_enforce_pricing_lock
  before update on public.estimates
  for each row execute function public.enforce_estimate_pricing_lock();
