-- vault_items gains nullable FKs to site_visits/estimates (following the
-- existing change_order_revision_id precedent exactly) plus an object-key
-- column with a uniqueness constraint that makes idempotent finalize-retry
-- real (learned directly from the Storage spike). activity_log gains
-- structured, IDs-only cross-entity linkage for the unified timeline.
alter table public.vault_items
  add column site_visit_id uuid references public.site_visits(id),
  add column estimate_id uuid references public.estimates(id),
  add column storage_object_key text,
  add constraint vault_items_storage_object_key_unique unique (storage_object_key);

alter table public.activity_log
  add column related_ids jsonb;

-- Partial expression index supporting getRequestLifecycleTimeline()'s
-- related_ids->>'service_request_id' predicate, scoped to only rows that
-- actually carry that key.
create index activity_log_related_service_request_idx
  on public.activity_log ((related_ids ->> 'service_request_id'))
  where related_ids ? 'service_request_id';
