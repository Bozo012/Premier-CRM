-- Real template parent table (not an unenforced grouping convention) plus
-- immutable-once-published versions. A published version can never have its
-- field_definitions/response_schema_version changed and can never be
-- deleted; corrections always create a new version.
create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id), -- NULL = platform-default template
  trade text,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.inspection_template_versions (
  id uuid primary key default gen_random_uuid(),
  inspection_template_id uuid not null references public.inspection_templates(id),
  version integer not null,
  field_definitions jsonb not null,
  response_schema_version integer not null,
  publication_status text not null default 'draft'
    check (publication_status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint inspection_template_versions_unique_version unique (inspection_template_id, version)
);

create index inspection_template_versions_template_id_idx
  on public.inspection_template_versions(inspection_template_id);

alter table public.site_visits
  add constraint site_visits_inspection_template_version_fkey
  foreign key (inspection_template_version_id) references public.inspection_template_versions(id);

alter table public.inspection_templates enable row level security;
alter table public.inspection_template_versions enable row level security;

-- inspection_templates: platform-default (org_id NULL) rows are readable by
-- everyone, mutable by no one through RLS; org rows are staff-managed within
-- their own org.
create policy "select_platform_default_inspection_templates" on public.inspection_templates
  for select using (org_id is null);
create policy "select_own_org_inspection_templates" on public.inspection_templates
  for select using (org_id is not null and public.user_is_in_org(org_id));
create policy "insert_own_org_inspection_templates" on public.inspection_templates
  for insert with check (org_id is not null and public.user_is_in_org(org_id));
create policy "update_own_org_inspection_templates" on public.inspection_templates
  for update using (org_id is not null and public.user_is_in_org(org_id));
create policy "delete_own_org_inspection_templates" on public.inspection_templates
  for delete using (org_id is not null and public.user_is_in_org(org_id));

-- inspection_template_versions: same split. No policy of any kind allows
-- INSERT/UPDATE/DELETE when the parent template is a platform default —
-- enforced by joining through inspection_templates.org_id.
create policy "select_platform_default_template_versions" on public.inspection_template_versions
  for select using (
    exists (select 1 from public.inspection_templates t
            where t.id = inspection_template_id and t.org_id is null)
  );
create policy "select_own_org_template_versions" on public.inspection_template_versions
  for select using (
    exists (select 1 from public.inspection_templates t
            where t.id = inspection_template_id and t.org_id is not null and public.user_is_in_org(t.org_id))
  );
create policy "insert_own_org_template_versions" on public.inspection_template_versions
  for insert with check (
    exists (select 1 from public.inspection_templates t
            where t.id = inspection_template_id and t.org_id is not null and public.user_is_in_org(t.org_id))
  );
create policy "update_own_org_template_versions" on public.inspection_template_versions
  for update using (
    exists (select 1 from public.inspection_templates t
            where t.id = inspection_template_id and t.org_id is not null and public.user_is_in_org(t.org_id))
  );
create policy "delete_own_org_template_versions" on public.inspection_template_versions
  for delete using (
    exists (select 1 from public.inspection_templates t
            where t.id = inspection_template_id and t.org_id is not null and public.user_is_in_org(t.org_id))
  );

-- Publication immutability: once a version is published (or archived), its
-- content can never change again, and it can never be deleted. Only 'draft'
-- versions remain editable/deletable.
create or replace function public.enforce_template_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if old.publication_status != 'draft' then
      if new.field_definitions is distinct from old.field_definitions
        or new.response_schema_version is distinct from old.response_schema_version then
        raise exception 'inspection_template_versions.field_definitions/response_schema_version is immutable once published';
      end if;
    end if;
    return new;
  end if;

  if TG_OP = 'DELETE' then
    if old.publication_status = 'published' then
      raise exception 'A published inspection_template_versions row can never be deleted';
    end if;
    return old;
  end if;

  return new;
end;
$$;

create trigger inspection_template_versions_enforce_immutability
  before update or delete on public.inspection_template_versions
  for each row execute function public.enforce_template_version_immutability();

-- Seed the one v1 platform-default general-maintenance template, published.
insert into public.inspection_templates (id, org_id, trade, name)
values ('b0000000-0000-0000-0000-000000000001', null, 'general', 'General Property Maintenance');

insert into public.inspection_template_versions
  (id, inspection_template_id, version, field_definitions, response_schema_version, publication_status, published_at)
values (
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  1,
  '[
    {"key":"customerConcerns","type":"longtext","label":"Customer concerns","required":true,"displayOrder":1,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"observedConditions","type":"longtext","label":"Observed conditions","required":true,"displayOrder":2,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"measurements","type":"measurement_list","label":"Measurements","required":false,"displayOrder":3,"visibility":"staff_only","estimateMappingHint":"none"},
    {"key":"quantities","type":"quantity_list","label":"Quantities","required":false,"displayOrder":4,"visibility":"staff_only","estimateMappingHint":"line_item_quantity"},
    {"key":"materialsNeeded","type":"material_list","label":"Materials needed","required":false,"displayOrder":5,"visibility":"staff_only","estimateMappingHint":"line_item_material"},
    {"key":"laborAssumptions","type":"longtext","label":"Labor assumptions","required":false,"displayOrder":6,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"hazards","type":"multiselect","label":"Hazards","required":false,"displayOrder":7,"options":["electrical","roof-height","asbestos-suspected","structural","other"],"visibility":"staff_only","estimateMappingHint":"none"},
    {"key":"accessIssues","type":"longtext","label":"Access issues","required":false,"displayOrder":8,"visibility":"staff_only","estimateMappingHint":"none"},
    {"key":"photos","type":"photo_list","label":"Photos","required":false,"displayOrder":9,"visibility":"staff_only","estimateMappingHint":"none"},
    {"key":"notes","type":"longtext","label":"Notes","required":false,"displayOrder":10,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"recommendations","type":"longtext","label":"Recommendations","required":false,"displayOrder":11,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"proposedScope","type":"longtext","label":"Proposed scope","required":true,"displayOrder":12,"visibility":"staff_only","estimateMappingHint":"description_text"},
    {"key":"estimatedDurationHours","type":"number","label":"Estimated duration (hours)","required":false,"displayOrder":13,"unit":"hours","visibility":"staff_only","estimateMappingHint":"none"},
    {"key":"followUpNeeded","type":"boolean","label":"Follow-up needed","required":false,"displayOrder":14,"visibility":"staff_only","estimateMappingHint":"none"}
  ]'::jsonb,
  1,
  'published',
  now()
);
