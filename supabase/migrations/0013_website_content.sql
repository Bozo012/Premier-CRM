-- Premier CRM — Website Content Foundation
-- Migration: 0013_website_content
--
-- Adds public-safe website content tables that the CRM owns and the public
-- website can read through narrowly scoped RLS policies. This is structured
-- settings/content, not a CMS or page builder.

-- ============================================================================
-- WEBSITE SETTINGS
-- ============================================================================

CREATE TABLE public.website_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  singleton_key       TEXT NOT NULL DEFAULT 'default',
  phone_display       TEXT,
  phone_uri           TEXT,
  email               CITEXT,
  hero_headline       TEXT,
  hero_subheadline    TEXT,
  primary_cta_label   TEXT,
  primary_cta_path    TEXT,
  availability_text   TEXT,
  seo_title           TEXT,
  seo_description     TEXT,
  social_image_url    TEXT,
  is_published        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT website_settings_org_singleton_unique UNIQUE (org_id, singleton_key),
  CONSTRAINT website_settings_singleton_key_check CHECK (singleton_key <> ''),
  CONSTRAINT website_settings_phone_uri_check CHECK (
    phone_uri IS NULL OR phone_uri ~ '^tel:[+0-9(). -]+$'
  ),
  CONSTRAINT website_settings_primary_cta_path_check CHECK (
    primary_cta_path IS NULL
    OR primary_cta_path LIKE '/%'
    OR primary_cta_path LIKE 'https://%'
  ),
  CONSTRAINT website_settings_social_image_url_check CHECK (
    social_image_url IS NULL
    OR social_image_url LIKE 'https://%'
    OR social_image_url LIKE '/%'
  )
);

CREATE INDEX website_settings_public_idx
  ON public.website_settings (org_id, singleton_key)
  WHERE is_published = true;

CREATE TRIGGER website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- WEBSITE PROMOTIONS
-- ============================================================================

CREATE TABLE public.website_promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  placement       TEXT NOT NULL,
  cta_label       TEXT,
  cta_url         TEXT,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  priority        INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT website_promotions_title_check CHECK (title <> ''),
  CONSTRAINT website_promotions_message_check CHECK (message <> ''),
  CONSTRAINT website_promotions_placement_check CHECK (placement <> ''),
  CONSTRAINT website_promotions_cta_pair_check CHECK (
    (cta_label IS NULL AND cta_url IS NULL)
    OR (cta_label IS NOT NULL AND cta_url IS NOT NULL)
  ),
  CONSTRAINT website_promotions_cta_url_check CHECK (
    cta_url IS NULL
    OR cta_url LIKE '/%'
    OR cta_url LIKE 'https://%'
  ),
  CONSTRAINT website_promotions_window_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at
  )
);

CREATE INDEX website_promotions_public_idx
  ON public.website_promotions (org_id, placement, priority DESC, starts_at DESC)
  WHERE is_active = true;

CREATE TRIGGER website_promotions_updated_at
  BEFORE UPDATE ON public.website_promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- WEBSITE SERVICE HIGHLIGHTS
-- ============================================================================

CREATE TABLE public.website_service_highlights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  icon_key        TEXT NOT NULL,
  cta_label       TEXT,
  cta_path        TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT website_service_highlights_title_check CHECK (title <> ''),
  CONSTRAINT website_service_highlights_description_check CHECK (description <> ''),
  CONSTRAINT website_service_highlights_icon_key_check CHECK (icon_key <> ''),
  CONSTRAINT website_service_highlights_cta_pair_check CHECK (
    (cta_label IS NULL AND cta_path IS NULL)
    OR (cta_label IS NOT NULL AND cta_path IS NOT NULL)
  ),
  CONSTRAINT website_service_highlights_cta_path_check CHECK (
    cta_path IS NULL
    OR cta_path LIKE '/%'
    OR cta_path LIKE 'https://%'
  )
);

CREATE INDEX website_service_highlights_public_idx
  ON public.website_service_highlights (org_id, sort_order, title)
  WHERE is_active = true;

CREATE TRIGGER website_service_highlights_updated_at
  BEFORE UPDATE ON public.website_service_highlights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_service_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_select_published_website_settings"
  ON public.website_settings
  FOR SELECT
  USING (is_published = true);

CREATE POLICY "public_select_active_website_promotions"
  ON public.website_promotions
  FOR SELECT
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

CREATE POLICY "public_select_active_website_service_highlights"
  ON public.website_service_highlights
  FOR SELECT
  USING (is_active = true);

-- Public website content is safe for anonymous reads only through the explicit
-- policies above. No INSERT/UPDATE/DELETE grants or internal admin write
-- policies are added in this foundation slice.
GRANT SELECT ON public.website_settings TO anon, authenticated;
GRANT SELECT ON public.website_promotions TO anon, authenticated;
GRANT SELECT ON public.website_service_highlights TO anon, authenticated;
