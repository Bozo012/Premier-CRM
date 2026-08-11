-- Customer-Safe Photo Visibility (docs/implementation/customer-safe-photo-
-- visibility-design.md, approved via PR #141). First slice: job- and
-- estimate-linked photos only. Site-visit/inspection photos are an explicit
-- fast-follow (see the design doc's ownership-chain note), not silently
-- included here.
--
-- Default is INTERNAL ONLY. customer_visible is additive, false by default,
-- and never inferred from ownership (job_id/estimate_id/customer_id
-- presence) — only an explicit staff publish action ever sets it true.

alter table public.vault_items
  add column customer_visible boolean not null default false;

-- ============================================================================
-- canPublishCustomerMedia — owner/admin only (approved product decision:
-- customer publication is a distinct outward-facing authorization decision,
-- not an operational media action). employee/subcontractor keep whatever
-- upload capabilities they already have (canScheduleJobs, unchanged) but
-- gain no publish/unpublish authority here.
--
-- CREATE OR REPLACE of the full function body, mirroring every prior
-- capability addition to this function (20260802020000_capability_matrix.sql
-- and its callers) — every existing case is preserved verbatim, only the new
-- 'canPublishCustomerMedia' case is added. Must be kept in exact sync with
-- packages/shared/permissions.ts's CAPABILITIES map (parity test enforces
-- this on the app side).
-- ============================================================================

create or replace function public.role_has_capability(p_role public.user_role, p_capability text)
returns boolean
language sql
immutable
as $$
  select case p_capability
    when 'canCreateEstimates' then p_role in ('owner','admin','employee','subcontractor')
    when 'canSendEstimates' then p_role in ('owner','admin','employee','subcontractor')
    when 'canCreateInvoices' then p_role in ('owner','admin','employee','subcontractor')
    when 'canSendInvoices' then p_role in ('owner','admin','employee','subcontractor')
    when 'canRecordPayments' then p_role in ('owner','admin')
    when 'canVoidInvoices' then p_role in ('owner','admin')
    when 'canDeleteInvoices' then p_role in ('owner','admin')
    when 'canIssueRefunds' then p_role in ('owner','admin')
    when 'canScheduleJobs' then p_role in ('owner','admin','employee','subcontractor')
    when 'canProposeChangeOrders' then p_role in ('owner','admin','employee','subcontractor')
    when 'canManageDeposits' then p_role in ('owner','admin')
    when 'canEditWorkingInvoice' then p_role in ('owner','admin','employee','subcontractor')
    when 'canTriageRequests' then p_role in ('owner','admin','employee','subcontractor')
    when 'canCreateDirectWorkOrder' then p_role in ('owner','admin')
    when 'canManageInspectionTemplates' then p_role in ('owner','admin')
    when 'canEditEstimate' then p_role in ('owner','admin','employee','subcontractor')
    when 'canApproveEstimatePricing' then p_role in ('owner','admin')
    when 'canCreateQuote' then p_role in ('owner','admin','employee')
    when 'canSendQuote' then p_role in ('owner','admin','employee')
    when 'canCreateExpenses' then p_role in ('owner','admin','employee','subcontractor')
    when 'canApproveExpenses' then p_role in ('owner','admin')
    when 'canPublishCustomerMedia' then p_role in ('owner','admin')
    else false
  end;
$$;

-- ============================================================================
-- publish_customer_visible_photo / unpublish_customer_visible_photo —
-- SECURITY DEFINER, following the exact idiom used throughout
-- 20260802020200_site_visit_lifecycle_rpcs.sql and
-- 20260731160000_scheduling_and_portal_boundary.sql: org/role derived
-- server-side via get_actor_org_role(), never accepted as a parameter.
-- Scope enforcement (job- or estimate-linked only, for this slice) happens
-- here too — a site-visit-linked or otherwise-scoped vault item is rejected,
-- not silently published, until the fast-follow slice reviews that chain.
-- ============================================================================

create or replace function public.publish_customer_visible_photo(p_vault_item_id uuid)
returns public.vault_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.vault_items;
  v_role public.user_role;
begin
  select * into v_item from public.vault_items where id = p_vault_item_id for update;
  if v_item.id is null then
    raise exception 'Photo not found.';
  end if;

  v_role := public.get_actor_org_role(v_item.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canPublishCustomerMedia') then
    raise exception 'Role does not have canPublishCustomerMedia';
  end if;

  if v_item.type != 'photo' then
    raise exception 'Only photos can be published to the customer portal.';
  end if;
  if v_item.job_id is null and v_item.estimate_id is null then
    raise exception 'This media type is not yet supported for customer publication.';
  end if;

  update public.vault_items
  set customer_visible = true
  where id = p_vault_item_id
  returning * into v_item;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  values (v_item.org_id, 'vault_item', v_item.id, 'photo_published_to_customer',
    'Photo made visible to customer.', auth.uid());

  return v_item;
end;
$$;

create or replace function public.unpublish_customer_visible_photo(p_vault_item_id uuid)
returns public.vault_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.vault_items;
  v_role public.user_role;
begin
  select * into v_item from public.vault_items where id = p_vault_item_id for update;
  if v_item.id is null then
    raise exception 'Photo not found.';
  end if;

  v_role := public.get_actor_org_role(v_item.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canPublishCustomerMedia') then
    raise exception 'Role does not have canPublishCustomerMedia';
  end if;

  update public.vault_items
  set customer_visible = false
  where id = p_vault_item_id
  returning * into v_item;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  values (v_item.org_id, 'vault_item', v_item.id, 'photo_unpublished_from_customer',
    'Photo removed from customer portal.', auth.uid());

  return v_item;
end;
$$;

revoke all on function public.publish_customer_visible_photo(uuid) from public;
revoke all on function public.unpublish_customer_visible_photo(uuid) from public;
grant execute on function public.publish_customer_visible_photo(uuid) to authenticated, service_role;
grant execute on function public.unpublish_customer_visible_photo(uuid) to authenticated, service_role;

-- ============================================================================
-- list_customer_visible_photos — the ONE centralized customer read path.
-- SECURITY DEFINER, mirrors get_my_site_visit_summary
-- (20260802020400_customer_safe_site_visit_summary.sql): no RLS SELECT
-- policy is ever added to vault_items for the customer role — this
-- function's RETURNS TABLE list is the entire portal-visible surface, by
-- construction. Ownership AND publication are proven together in the same
-- WHERE clause, never as two separately-satisfiable checks. Takes an
-- explicit parent id, never a vault_item id — no enumeration surface.
-- ============================================================================

create or replace function public.list_customer_visible_photos(p_job_id uuid default null, p_estimate_id uuid default null)
returns table (
  id uuid,
  storage_object_key text,
  image_url text,
  caption text,
  created_at timestamptz
)
security definer
set search_path = public
language sql
stable
as $$
  select
    v.id,
    v.storage_object_key,
    v.image_url,
    v.content,
    v.created_at
  from public.vault_items v
  where v.type = 'photo'
    and v.customer_visible = true
    and (
      (
        p_job_id is not null
        and v.job_id = p_job_id
        and exists (
          select 1 from public.jobs j
          join public.customer_accounts ca on ca.customer_id = j.customer_id
          where j.id = p_job_id
            and ca.auth_user_id = auth.uid()
            and ca.status = 'active'
        )
      )
      or
      (
        p_estimate_id is not null
        and v.estimate_id = p_estimate_id
        and exists (
          select 1 from public.estimates e
          join public.customer_accounts ca on ca.customer_id = e.customer_id
          where e.id = p_estimate_id
            and ca.auth_user_id = auth.uid()
            and ca.status = 'active'
        )
      )
    )
  order by v.created_at desc;
$$;

grant execute on function public.list_customer_visible_photos(uuid, uuid) to authenticated;

-- No SELECT/UPDATE grant of any kind is added to vault_items for the
-- customer-facing role — the existing org_isolation_vault_items policy
-- (staff-only, via user_is_in_org) is untouched, and customers remain
-- unable to query vault_items directly by any path.
