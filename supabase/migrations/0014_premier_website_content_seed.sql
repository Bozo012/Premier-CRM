-- Premier CRM — Premier website content seed data
-- Migration: 0014_premier_website_content_seed
--
-- Seeds CRM-owned public website content for the Premier org only.
-- This is intentionally narrow: default website settings and a small set of
-- active service highlights. Promotions are left empty until there is a real,
-- time-bound offer to publish.
--
-- IDEMPOTENT: safe to run multiple times. Uses the canonical Premier org from
-- 0008 and stable UUIDs for seeded website content records.

DO $$
DECLARE
  premier_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  target_org_id UUID;
BEGIN
  -- Match the existing Premier bootstrap pattern from 0008 while still looking
  -- up the org by the controlled slug. If the org has not been bootstrapped for
  -- some reason, create the same canonical Premier org rather than attaching
  -- public content to an arbitrary tenant.
  SELECT id
    INTO target_org_id
    FROM public.organizations
   WHERE slug = 'premier'
   LIMIT 1;

  IF target_org_id IS NULL THEN
    INSERT INTO public.organizations (id, name, slug, created_at)
    VALUES (
      premier_org_id,
      'Premier Property Maintenance LLC',
      'premier',
      now()
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT id
      INTO target_org_id
      FROM public.organizations
     WHERE id = premier_org_id;
  END IF;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve Premier org for website content seed';
  END IF;

  IF target_org_id <> premier_org_id THEN
    RAISE EXCEPTION 'Premier org slug resolved to unexpected id: %', target_org_id;
  END IF;

  -- Published singleton settings for the public website. No public email is
  -- seeded here by design.
  INSERT INTO public.website_settings (
    id,
    org_id,
    singleton_key,
    phone_display,
    phone_e164,
    hero_headline,
    hero_subheadline,
    primary_cta_label,
    primary_cta_path,
    availability_text,
    seo_title,
    seo_description,
    is_published
  ) VALUES (
    'a0000000-0000-0000-0000-000000000101'::UUID,
    target_org_id,
    'default',
    '(859) 912-0526',
    '+18599120526',
    'Reliable property maintenance for rentals, homes, and small projects.',
    'Premier helps landlords, property managers, and homeowners get turnover prep, repairs, and remodel work handled cleanly and on schedule.',
    'Request an Estimate',
    '/contact',
    'Serving Northern Kentucky with responsive scheduling for maintenance, repairs, and project work.',
    'Premier Property Maintenance | Rental Turnovers, Repairs & Remodeling in Northern Kentucky',
    'Premier Property Maintenance helps landlords, property managers, and homeowners with rental turnover prep, property maintenance, remodeling, handyman repairs, and exterior repairs in Northern Kentucky.',
    true
  )
  ON CONFLICT (org_id, singleton_key) DO UPDATE SET
    phone_display = EXCLUDED.phone_display,
    phone_e164 = EXCLUDED.phone_e164,
    hero_headline = EXCLUDED.hero_headline,
    hero_subheadline = EXCLUDED.hero_subheadline,
    primary_cta_label = EXCLUDED.primary_cta_label,
    primary_cta_path = EXCLUDED.primary_cta_path,
    availability_text = EXCLUDED.availability_text,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    is_published = EXCLUDED.is_published,
    updated_at = now();

  -- Promotions intentionally not seeded. The safe default is no active or fake
  -- offers until Premier has a real promotion to publish.

  INSERT INTO public.website_service_highlights (
    id,
    org_id,
    title,
    description,
    icon_key,
    cta_label,
    cta_path,
    sort_order,
    is_active
  ) VALUES
    (
      'a0000000-0000-0000-0000-000000000201'::UUID,
      target_org_id,
      'Rental turnover prep',
      'Punch-list repairs, touch-ups, and make-ready work between tenants.',
      'home-refresh',
      'Request an Estimate',
      '/contact',
      10,
      true
    ),
    (
      'a0000000-0000-0000-0000-000000000202'::UUID,
      target_org_id,
      'Property maintenance',
      'Responsive maintenance help for rental properties and occupied homes.',
      'toolbox',
      'Request an Estimate',
      '/contact',
      20,
      true
    ),
    (
      'a0000000-0000-0000-0000-000000000203'::UUID,
      target_org_id,
      'Remodeling',
      'Clean, practical updates for kitchens, baths, living spaces, and rentals.',
      'paint-roller',
      'Request an Estimate',
      '/contact',
      30,
      true
    ),
    (
      'a0000000-0000-0000-0000-000000000204'::UUID,
      target_org_id,
      'Handyman repairs',
      'Small repairs, installs, adjustments, and punch-list items done right.',
      'wrench',
      'Request an Estimate',
      '/contact',
      40,
      true
    ),
    (
      'a0000000-0000-0000-0000-000000000205'::UUID,
      target_org_id,
      'Exterior repairs',
      'Deck, trim, siding, door, and other exterior repair work.',
      'house-siding',
      'Request an Estimate',
      '/contact',
      50,
      true
    )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    icon_key = EXCLUDED.icon_key,
    cta_label = EXCLUDED.cta_label,
    cta_path = EXCLUDED.cta_path,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RAISE NOTICE 'Premier website content seeded for org: %', target_org_id;
END $$;
