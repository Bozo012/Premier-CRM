create type public.team_availability_status as enum (
  'available',
  'on_job',
  'off_shift',
  'on_leave'
);

create table public.team_member_availability (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  availability_status public.team_availability_status not null default 'available',
  skills text[] not null default '{}',
  note text,
  status_expires_at timestamptz,
  last_seen_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id),
  foreign key (org_id, user_id)
    references public.org_members(org_id, user_id)
    on delete cascade
);

create index team_member_availability_org_status_idx
  on public.team_member_availability(org_id, availability_status);

create index team_member_availability_user_idx
  on public.team_member_availability(user_id);

create trigger team_member_availability_updated_at
  before update on public.team_member_availability
  for each row execute function public.set_updated_at();

alter table public.team_member_availability enable row level security;

create policy "team_member_availability_select_org_members"
  on public.team_member_availability
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.org_members
      where org_members.org_id = team_member_availability.org_id
        and org_members.user_id = (select auth.uid())
        and org_members.status = 'active'
    )
  );

create policy "team_member_availability_insert_self_or_admin"
  on public.team_member_availability
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.org_members target_member
      where target_member.org_id = team_member_availability.org_id
        and target_member.user_id = team_member_availability.user_id
        and target_member.status = 'active'
    )
    and (
      team_member_availability.user_id = (select auth.uid())
      or exists (
        select 1
        from public.org_members admin_member
        where admin_member.org_id = team_member_availability.org_id
          and admin_member.user_id = (select auth.uid())
          and admin_member.status = 'active'
          and admin_member.role in ('owner', 'admin')
      )
    )
  );

create policy "team_member_availability_update_self_or_admin"
  on public.team_member_availability
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      team_member_availability.user_id = (select auth.uid())
      or exists (
        select 1
        from public.org_members admin_member
        where admin_member.org_id = team_member_availability.org_id
          and admin_member.user_id = (select auth.uid())
          and admin_member.status = 'active'
          and admin_member.role in ('owner', 'admin')
      )
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.org_members target_member
      where target_member.org_id = team_member_availability.org_id
        and target_member.user_id = team_member_availability.user_id
        and target_member.status = 'active'
    )
    and (
      team_member_availability.user_id = (select auth.uid())
      or exists (
        select 1
        from public.org_members admin_member
        where admin_member.org_id = team_member_availability.org_id
          and admin_member.user_id = (select auth.uid())
          and admin_member.status = 'active'
          and admin_member.role in ('owner', 'admin')
      )
    )
  );

create policy "team_member_availability_delete_admin"
  on public.team_member_availability
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.org_members admin_member
      where admin_member.org_id = team_member_availability.org_id
        and admin_member.user_id = (select auth.uid())
        and admin_member.status = 'active'
        and admin_member.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.team_member_availability to authenticated;

notify pgrst, 'reload schema';
