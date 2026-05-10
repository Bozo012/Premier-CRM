-- Premier CRM — Upgrade website content tables to the structured read/admin model
-- Migration: 0015_website_content_admin_model
--
-- 0013/0014 established the initial CRM-owned website content foundation and
-- Premier seed data. This migration expands those tables to support the final
-- structured public read surface and narrow CRM admin UI without introducing
-- CMS-style flexibility.

ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS text_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS request_service_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS portal_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS service_area_summary TEXT,
  ADD COLUMN IF NOT EXISTS emergency_message TEXT,
  ADD COLUMN IF NOT EXISTS portal_status_message TEXT,
  ADD COLUMN IF NOT EXISTS homepage_seo_title TEXT,
  ADD COLUMN IF NOT EXISTS homepage_seo_description TEXT;

UPDATE public.website_settings
SET
  published = COALESCE(published, is_published, true),
  active = COALESCE(active, true),
  call_cta_label = COALESCE(call_cta_label, primary_cta_label, 'Call Now'),
  text_cta_label = COALESCE(text_cta_label, 'Text Us'),
  request_service_cta_label = COALESCE(request_service_cta_label, 'Request Service'),
  portal_cta_label = COALESCE(portal_cta_label, 'Request Your First Service'),
  service_area_summary = COALESCE(service_area_summary, hero_subheadline, seo_description),
  emergency_message = COALESCE(
    emergency_message,
    'Professional maintenance you can trust. Available 24/7 for emergencies.'
  ),
  portal_status_message = COALESCE(
    portal_status_message,
    'Portal access is set up after your first service request.'
  ),
  homepage_seo_title = COALESCE(homepage_seo_title, seo_title),
  homepage_seo_description = COALESCE(homepage_seo_description, seo_description);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'website_settings_org_unique'
  ) THEN
    ALTER TABLE public.website_settings
      ADD CONSTRAINT website_settings_org_unique UNIQUE (org_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS website_settings_org_active_idx
  ON public.website_settings (org_id, active, published);

ALTER TABLE public.website_promotions
  ALTER COLUMN message DROP NOT NULL,
  ALTER COLUMN placement DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS button_text TEXT,
  ADD COLUMN IF NOT EXISTS button_link TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

UPDATE public.website_promotions
SET
  description = COALESCE(description, message),
  button_text = COALESCE(button_text, cta_label),
  button_link = COALESCE(button_link, cta_url),
  start_date = COALESCE(start_date, starts_at::date),
  end_date = COALESCE(end_date, ends_at::date),
  active = COALESCE(active, is_active, false),
  display_order = COALESCE(display_order, priority, 0);

CREATE INDEX IF NOT EXISTS website_promotions_org_active_idx
  ON public.website_promotions (org_id, active, display_order);
CREATE INDEX IF NOT EXISTS website_promotions_org_window_idx
  ON public.website_promotions (org_id, start_date, end_date);

ALTER TABLE public.website_service_highlights
  ALTER COLUMN description DROP NOT NULL,
  ALTER COLUMN icon_key DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false;

UPDATE public.website_service_highlights
SET
  slug = COALESCE(
    slug,
    NULLIF(
      trim(BOTH '-' FROM regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    substr(id::text, 1, 8)
  ),
  featured = COALESCE(featured, false),
  display_order = COALESCE(display_order, sort_order, 0),
  active = COALESCE(active, is_active, false);

CREATE UNIQUE INDEX IF NOT EXISTS website_service_highlights_org_slug_unique_idx
  ON public.website_service_highlights (org_id, slug);
CREATE INDEX IF NOT EXISTS website_service_highlights_org_active_idx
  ON public.website_service_highlights (org_id, active, featured, display_order);
