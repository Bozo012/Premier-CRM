-- Base table-level grants (RLS restricts rows, but the role must also hold
-- the underlying GRANT — a gap found directly in the Storage/vault spike).
-- Tables mutated exclusively through SECURITY DEFINER RPCs get SELECT only;
-- pending_uploads is the one exception designed for direct, RLS-gated client
-- read/write (matching the verified Checkpoint A.1 architecture).
grant select on public.site_visits to authenticated;
grant select on public.site_visit_appointments to authenticated;
grant select on public.estimate_line_items to authenticated;
grant select on public.inspection_templates to authenticated;
grant select on public.inspection_template_versions to authenticated;
grant select, insert, update on public.pending_uploads to authenticated;

notify pgrst, 'reload schema';
