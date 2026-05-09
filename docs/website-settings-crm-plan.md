# CRM-backed website settings plan

## Purpose

Premier's public website should stay a fast, simple React/Vercel frontend while the CRM becomes the canonical place for lightweight public website content. This plan defines the first safe slice: structured website settings and small reusable content records stored in Supabase, governed by CRM-owned schema and RLS, and consumed by the website through an anon-safe public read surface.

This is intentionally **not** a page builder, visual editor, blog engine, FAQ system, or full CMS. It is a narrow settings/content layer for public website copy that changes occasionally and should not require a website deploy once the website integration exists.

## What becomes CRM-controlled first

The first CRM-controlled website content is limited to public-safe, low-risk content that the website already treats as constants or simple cards:

- Global public contact and hero settings:
  - display phone number
  - phone URI
  - public email address
  - hero headline and subheadline
  - primary CTA label and path
  - public availability text
  - SEO title and description
  - social image URL
- Time-bound or placement-specific promotions:
  - banner or section title/message
  - optional CTA label and URL
  - placement key
  - active date window
  - priority
- Service highlight cards:
  - title and short description
  - icon key from the website's static icon registry
  - optional CTA label/path
  - sort order
  - active flag

These records are public by design. They must not contain customer data, pricing internals, job notes, staff-only notes, vault data, credentials, or operational CRM data.

## What stays static in the website repo

The public website repo remains responsible for presentation and productized frontend behavior:

- routes, layouts, React components, design system, styling, animations, and responsive behavior
- static image assets that are checked into the website repo
- icon components and the mapping from `icon_key` values to actual icons
- validation and fallback constants used when CRM content is unavailable
- copy that is tightly coupled to a designed page section and not yet worth making configurable
- build/deploy configuration, analytics wiring, and performance optimizations

The website should not gain CRM admin screens, CMS modeling, or private CRM data access.

## Data ownership

The CRM repository owns the website content schema, migrations, access model, and future admin editing workflow. Supabase stores the canonical records. The website repository reads only the public-safe projection needed to render public pages.

Each website content table includes `org_id` even though production is a single Premier org today. This follows the existing CRM tenant model and keeps the schema compatible with the open-source/multi-org direction documented in the architecture.

The CRM admin UI will eventually own editing and validation. Until that UI exists, records can be seeded or maintained through controlled database operations by an administrator.

## Public read strategy

For the first pass, the website should read directly from Supabase using the anon key against dedicated public-safe `website_*` tables.

### Why direct Supabase reads first

- It keeps the website fast and simple: the public frontend can fetch small structured rows directly from Supabase and cache them at the route/component layer.
- The data model is already explicitly public-safe, so a CRM-owned proxy endpoint would add operational complexity without materially reducing exposure for this first slice.
- RLS and table grants provide the public contract: anon users can select only published/active website content from these tables, and no internal CRM tables are granted through this slice.
- It avoids coupling the public website to the CRM web app runtime while still keeping the CRM database/schema as the source of truth.

### Tradeoff accepted

Direct reads expose the shape and values of these public tables to anyone with the anon key. That is acceptable only because the tables are intentionally limited to public website content. If future website content needs personalization, preview drafts, sensitive segmentation, or data assembled from private CRM records, that content should move behind a CRM-owned public endpoint or Supabase Edge Function that returns an explicit public DTO.

## RLS and public-safe access model

The first migration creates three tables and enables RLS on each:

- `website_settings`
- `website_promotions`
- `website_service_highlights`

Public policies are select-only:

- settings are readable only when `is_published = true`
- promotions are readable only when `is_active = true` and the current time is within the optional `starts_at`/`ends_at` window
- service highlights are readable only when `is_active = true`

The migration grants `SELECT` to `anon` and `authenticated` for these website tables only. It does not grant public access to any existing CRM tables and does not add write policies. Supabase's service role can still perform operational maintenance, while authenticated admin CRUD policies are intentionally deferred until the CRM admin UI is designed.

## Fallback strategy

The website integration should treat CRM-backed settings as an enhancement, not a hard runtime dependency:

1. Fetch published website settings, active promotions, and active service highlights from Supabase.
2. Cache/revalidate according to the website's rendering strategy.
3. If Supabase is unavailable, returns an empty result, or returns invalid content, render the website repo's existing static fallback constants.
4. Log or surface fetch failures in the website's normal observability path without blocking public page rendering.

The fallback constants should stay in the website repo until the CRM admin editing flow and production content are stable.

## Admin UI scope

The future CRM admin UI should be structured, not visual:

- A single website settings form for the singleton public settings row.
- A promotions list with create/edit/archive controls, placement keys, active windows, and priority.
- A service highlights list with active toggles and drag-free numeric ordering.
- Field-level validation for URLs, CTA paths, phone URI format, SEO length guidance, and allowed icon keys/placement keys.
- Preview links to the public website when practical.

The admin UI should not include freeform page layout editing, custom HTML, arbitrary scripts, blog authoring, FAQ management, customer portal settings, or private CRM data embedding.

## Rollout sequence

1. **Schema foundation (this branch):** Add this plan and create the `website_*` tables with RLS and public select policies.
2. **Seed/maintenance path:** Add controlled seed data or administrator maintenance steps for the Premier production org.
3. **Website read integration:** Update the website repo to read from Supabase using the anon key, map records to existing components, and keep static fallback constants.
4. **CRM admin editing:** Add authenticated CRM admin screens and org-scoped write policies for owners/admins.
5. **Observability and hardening:** Add validation, preview/draft decisions if needed, and monitoring around website content fetches.
6. **Expand only when justified:** Consider additional structured content types only after this slice proves useful and remains operationally simple.

## Explicitly deferred

- full CMS/page builder functionality
- visual drag-and-drop editing
- blog, FAQ, or broad `website_pages` tables
- draft/preview workflow
- CRM-owned public endpoint or Edge Function
- website repo integration work
- customer portal/auth changes
- any access to internal customer, job, quote, invoice, vault, automation, or staff data
