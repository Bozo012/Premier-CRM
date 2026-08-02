-- Make organizations.timezone portable: the column already exists but defaults
-- to 'America/New_York' globally, which is wrong for any future non-Eastern
-- organization. Switch the default to 'UTC' (a safe, honest fallback) and
-- explicitly (re)set Premier's own row by verified organization ID.
alter table public.organizations
  alter column timezone set default 'UTC';

update public.organizations
set timezone = 'America/New_York'
where id = 'a0000000-0000-0000-0000-000000000001';
