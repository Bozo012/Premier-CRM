-- Premier CRM — Public intake service-role grants
-- Migration: 0017_public_intake_service_role_permissions
--
-- Public unauthenticated intake routes use the service-role client to bypass
-- RLS safely on the server. The underlying tables still need explicit table
-- privileges for the service_role database role.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO service_role;
