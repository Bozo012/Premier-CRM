-- Customer-Safe Photo Visibility, fast-follow slice: extends the exact same
-- model from 20260811030000_customer_safe_photo_visibility.sql (approved in
-- PR #141/#142) to site-visit/inspection-linked photos. No second
-- publication model, no second customer_visible-equivalent flag, no new
-- RPC pair — the existing publish/unpublish/list_customer_visible_photos
-- functions are extended to recognize a third supported parent.
--
-- Ownership chain proven safe before writing this migration (see
-- docs/implementation/customer-safe-photo-visibility-design.md's fast-
-- follow note, and the live audit that produced this migration):
--   vault_items.site_visit_id -> site_visits.service_request_id
--     -> service_requests.customer_id
-- Verified on premier-crm-e2e's live data: zero org mismatches across every
-- hop, zero orphaned site-visit-linked vault_items, zero vault_items rows
-- with more than one parent FK set (including site_visit_id alongside
-- job_id/estimate_id). site_visits.service_request_id is NOT NULL + UNIQUE;
-- service_requests.customer_id is NOT NULL — the chain has no ambiguity by
-- construction, not just by observed data. This mirrors the exact join
-- already used by get_my_site_visit_summary()
-- (20260802020400_customer_safe_site_visit_summary.sql).
--
-- Inspection JSONB audit: photo_list field values inside
-- site_visits.inspection_responses are `{vaultItemId, caption}[]` — real
-- references to actual vault_items rows, never a second copy of the photo
-- or a bypass of vault_items. site-visits/actions.ts's
-- saveSiteVisitInspectionAction already verifies every referenced
-- vaultItemId has a matching site_visit_id before allowing the save. No
-- customer-visible flag exists or is added inside the JSONB —
-- vault_items.customer_visible remains the sole, final gate, exactly as for
-- job/estimate photos. Inspection field definitions carry their own
-- `visibility: 'staff_only' | 'internal_and_estimate_source'` enum, which is
-- an unrelated, pre-existing concept (whether a field feeds internal
-- review vs. estimate generation) — it is never read by this migration and
-- must never be used to infer customer_visible; publication stays an
-- explicit, per-photo staff decision independent of which inspection field
-- a photo was attached to.

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
  if v_item.job_id is null and v_item.estimate_id is null and v_item.site_visit_id is null then
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

-- unpublish_customer_visible_photo needs no change (it never gated on
-- parent type — only publish did) but is CREATE OR REPLACE'd here anyway to
-- keep both functions co-located in one reviewable pair, matching the
-- original migration's structure.
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

-- list_customer_visible_photos gains a third optional parameter and a
-- third OR-branch, added alongside the existing job_id/estimate_id
-- branches — not replacing them. Existing callers (portal dashboard job
-- cards, estimate photo section) that only ever pass p_job_id or
-- p_estimate_id are unaffected: p_site_visit_id defaults to null and that
-- branch's `p_site_visit_id is not null` guard short-circuits it out.
--
-- Postgres treats a different parameter COUNT as a distinct overload, not
-- a replacement — CREATE OR REPLACE alone would leave the old two-arg
-- signature in place alongside the new three-arg one, and PostgREST would
-- then reject every named-argument RPC call as ambiguous ("could not
-- choose the best candidate function"). The old signature is dropped
-- explicitly first so exactly one version of this function ever exists.
drop function if exists public.list_customer_visible_photos(uuid, uuid);

create or replace function public.list_customer_visible_photos(
  p_job_id uuid default null,
  p_estimate_id uuid default null,
  p_site_visit_id uuid default null
)
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
      or
      (
        p_site_visit_id is not null
        and v.site_visit_id = p_site_visit_id
        and exists (
          select 1 from public.site_visits sv
          join public.service_requests sr on sr.id = sv.service_request_id
          join public.customer_accounts ca on ca.customer_id = sr.customer_id
          where sv.id = p_site_visit_id
            and ca.auth_user_id = auth.uid()
            and ca.status = 'active'
        )
      )
    )
  order by v.created_at desc;
$$;

grant execute on function public.list_customer_visible_photos(uuid, uuid, uuid) to authenticated;
