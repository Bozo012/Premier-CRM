-- service_role is missing table-level grants on most public tables: only the
-- tables explicitly granted in earlier migrations (the 0012/0017 pattern —
-- customers, properties, service_requests, estimates, partial jobs, …) are
-- accessible to it. Everything else (quotes, quote_line_items, invoices,
-- invoice_line_items, payments, org_members, vault_items, …) returns
-- "permission denied for table" (42501), so every server action that uses the
-- service-role client fails at runtime. Supabase's stock posture is
-- service_role holding ALL on app tables — it bypasses RLS by design and the
-- key never leaves the server. Restore that posture, and set default
-- privileges so tables created by future migrations don't regress.

grant usage on schema public to service_role;

-- Grant per-table via a loop instead of GRANT ... ON ALL TABLES because
-- extension-owned tables (spatial_ref_sys, owned by supabase_admin) would
-- make the blanket form fail. relkind 'r' = ordinary table, 'p' = partitioned
-- parent (location_events).
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and pg_get_userbyid(c.relowner) = 'postgres'
  loop
    execute format('grant all privileges on table public.%I to service_role', t.relname);
  end loop;
end $$;

grant all privileges on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
