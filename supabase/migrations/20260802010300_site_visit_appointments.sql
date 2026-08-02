-- Structured appointment history for site visits. Rescheduling never
-- overwrites scheduled_start/end in place — it supersedes the active row and
-- creates a new one, preserving the full history.
create table public.site_visit_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  site_visit_id uuid not null references public.site_visits(id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  assigned_user_id uuid references auth.users(id),
  status text not null check (status in ('scheduled','cancelled','completed')),
  cancellation_reason text,
  supersedes_appointment_id uuid references public.site_visit_appointments(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  constraint site_visit_appointments_valid_window check (scheduled_end > scheduled_start)
);

create index site_visit_appointments_site_visit_id_idx on public.site_visit_appointments(site_visit_id);
create index site_visit_appointments_org_id_idx on public.site_visit_appointments(org_id);

-- At most one active (status='scheduled') appointment per visit — enforced
-- at the database level, not just RPC discipline.
create unique index site_visit_appointments_one_active_per_visit
  on public.site_visit_appointments(site_visit_id) where status = 'scheduled';

alter table public.site_visit_appointments enable row level security;

create policy "internal_org_site_visit_appointments" on public.site_visit_appointments
  for all using (public.user_is_in_org(org_id));
