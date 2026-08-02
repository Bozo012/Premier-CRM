-- Repeatable, idempotent bootstrap for the permanent Premier CRM
-- Demonstration organization (staff training, Brandon's platform testing,
-- screenshots/demos, multi-tenant isolation validation). This is
-- deliberately NOT a general "create organization" feature — no UI route
-- calls this, and it is restricted to service_role only, invoked exclusively
-- via a one-off internal administrative script using the existing service
-- layer (matching the "internal administrative script" option, not a new
-- public capability).
--
-- Idempotent by slug: rerunning this returns the existing org's ID instead
-- of creating a duplicate. No hardcoded Demo org ID is used anywhere —
-- every reference resolves it by slug at call time, so this migration
-- itself does not need to know or embed the ID it will generate.
create or replace function public.bootstrap_demonstration_organization(p_initiator_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_slug text := 'premier-crm-demonstration';
begin
  select id into v_org_id from public.organizations where slug = v_slug;
  if v_org_id is not null then
    return v_org_id;
  end if;

  insert into public.organizations (name, slug, timezone)
  values ('Premier CRM Demonstration', v_slug, 'America/New_York')
  returning id into v_org_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  values (
    v_org_id, 'organization', v_org_id, 'organization_bootstrapped',
    'Premier CRM Demonstration organization created via bootstrap_demonstration_organization().',
    p_initiator_user_id
  );

  return v_org_id;
end;
$$;

revoke execute on function public.bootstrap_demonstration_organization(uuid) from public;
revoke execute on function public.bootstrap_demonstration_organization(uuid) from authenticated;
grant execute on function public.bootstrap_demonstration_organization(uuid) to service_role;
