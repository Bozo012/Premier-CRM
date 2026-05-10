-- Premier CRM — Website content grants
-- Migration: 0016_website_content_permissions
--
-- 0015 upgrades the website-content tables to the final structured read/admin
-- model. These grants allow authenticated admin reads/writes and service-role
-- public snapshot access.

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_promotions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_service_highlights TO authenticated, service_role;
