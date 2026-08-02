-- Storage architecture verified in Checkpoint A/A.1: a private bucket, a
-- pending-upload quarantine table + short-lived signed upload URLs into
-- {org_id}/pending/{upload_id}, and a trusted server-side finalization path
-- that is the ONLY writer of the permanent {org_id}/{entity_type}/{entity_id}
-- location. Clients get no Storage policy for the permanent path at all.
create table public.pending_uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null,
  entity_id uuid not null,
  declared_mime_type text not null,
  declared_size_bytes integer not null,
  pending_path text not null unique,
  status text not null default 'pending'
    check (status in ('pending','finalized','rejected','cancelled')),
  rejection_reason text,
  finalized_vault_item_id uuid references public.vault_items(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index pending_uploads_org_id_idx on public.pending_uploads(org_id);
-- Supports the documented stale-cleanup query: pending rows past expiry.
create index pending_uploads_stale_idx on public.pending_uploads(status, expires_at)
  where status = 'pending';

alter table public.pending_uploads enable row level security;
create policy "internal_org_pending_uploads_select" on public.pending_uploads
  for select using (public.user_is_in_org(org_id));
create policy "internal_org_pending_uploads_insert" on public.pending_uploads
  for insert with check (public.user_is_in_org(org_id));
create policy "internal_org_pending_uploads_update" on public.pending_uploads
  for update using (public.user_is_in_org(org_id)) with check (public.user_is_in_org(org_id));
-- No client DELETE policy — cancellation is a status update, not a row delete,
-- so the history of what was requested/rejected/cancelled is retained.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-visit-attachments', 'site-visit-attachments', false, 15728640,
  array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "site_visit_attachments_select_own_org" on storage.objects
  for select using (
    bucket_id = 'site-visit-attachments'
    and public.user_is_in_org(((storage.foldername(name))[1])::uuid)
  );

-- Clients may only write into their own org's pending/ prefix — the
-- permanent path has no client INSERT policy at all; only the service-role
-- finalization path writes there (service_role bypasses RLS entirely).
create policy "site_visit_attachments_insert_pending_own_org" on storage.objects
  for insert with check (
    bucket_id = 'site-visit-attachments'
    and (storage.foldername(name))[2] = 'pending'
    and public.user_is_in_org(((storage.foldername(name))[1])::uuid)
  );
