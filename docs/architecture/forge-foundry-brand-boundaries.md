# Forge / Foundry Brand Boundaries

Status: active reference document. Defines the naming/branding model approved by Kevin (Phase F2, following the read-only audit in `docs/architecture/forge-foundry-naming-audit.md`). Read this before adding any new user-facing text, documentation, or configuration that needs to name the software product, the umbrella ecosystem, or the operating business.

---

## The three names

### Forge
- The software platform/product: the staff CRM and the customer portal.
- The current application. The upcoming baseline release is **Forge V1** (never "Premier CRM V1," "Premier Platform V1," "Foundry V1," or "Forge Platform V1" — see the naming audit §8 question 8 — except where historical wording must be preserved as written).
- Central constant: `PRODUCT_NAME` in `packages/shared/brand.ts`.

### Foundry
- The umbrella/ecosystem name for the broader software company/product family this platform sits inside.
- Not yet a public brand. Does not appear in the live application, customer-facing content, or any public marketing.
- Confined to: architecture documentation, product-organization/planning documentation, and the Base44 handoff's context section where the product/company distinction needs explaining.
- Central constant: `ECOSYSTEM_NAME` in `packages/shared/brand.ts` — used only in documentation/architecture contexts, not wired into any application UI string.

### Premier Property Maintenance
- An independent operating business — the first (and, as of this writing, only real) organization running on Forge.
- Not renamed, not rebranded. Its organization name, public marketing website (`ppmnky.com`), all customer-facing branding, quotes, invoices, portal identity, logos, and contact details remain exactly as they were before this naming work.
- Always represented as tenant/organization **data** (`organizations.name`, read via `getActiveOrgContext()`), never as a hardcoded product-level constant — see "No `ORGANIZATION_NAME` constant" below.

---

## The one-sentence explanation (documentation use only)

> "Forge is a service-business operating platform developed within the Foundry software ecosystem. Premier Property Maintenance is the first organization operating on Forge."

This sentence is for architecture/planning documentation. It is not displayed anywhere in the live application — no screen shows this full explanatory framing to a staff member or a customer.

---

## Where each name may appear

| Surface | Product name (Forge) | Ecosystem name (Foundry) | Business name (Premier Property Maintenance) |
|---|---|---|---|
| Staff app metadata / browser titles | ✅ (`Forge — [Section]`) | ❌ | ❌ (org identity shown separately, e.g. org switcher) |
| PWA manifest | ✅ (`name`/`short_name` = "Forge") | ❌ | ❌ |
| Staff sign-in page | ✅ | ❌ | ❌ |
| Internal staff-notification email templates | ✅ | ❌ | ❌ |
| Customer-facing email templates (quotes, invoices, etc.) | ❌ | ❌ | ✅ (unchanged, already correct) |
| Customer portal doorway/login (headings, browser title) | ❌ (deliberately, per Kevin's decision — no "Forge" in customer-visible headings) | ❌ | ✅ |
| Customer portal body copy explaining the platform mechanism (e.g. "the portal lives inside Forge at app.ppmnky.com") | ✅ (factual/technical aside, not a heading) | ❌ | — |
| Architecture/planning documentation | ✅ | ✅ (sparingly) | ✅ (where discussing the tenant) |
| Base44 handoff documentation | ✅ | ✅ (context only) | ✅ (where discussing tenant boundaries) |
| Public PPM marketing website | ❌ | ❌ | ✅ (untouched) |
| Demo organization display name | — | — | N/A — Demo is its own org, now named **Forge Demonstration** (display name only; id and slug unchanged, see naming audit §5) |

---

## No `ORGANIZATION_NAME` product-level constant

`packages/shared/brand.ts` exports exactly two constants: `PRODUCT_NAME` and `ECOSYSTEM_NAME`. There is deliberately no `ORGANIZATION_NAME` constant — tenant organization names (Premier Property Maintenance, Forge Demonstration, and any future organization) are always read from the database (`organizations.name`) through the existing `getActiveOrgContext()` / org-switcher path, never hardcoded as a product-level constant. The two places in the application that currently hardcode "Premier Property Maintenance" as literal text (`apps/web/app/portal/page.tsx`'s eyebrow heading and portal metadata title, and `apps/web/app/portal/login/page.tsx`'s breadcrumb) are pre-existing, minor technical debt — correct today because Premier Property Maintenance is the only real tenant, but not wired to `organizations.name` — noted here for future cleanup, not addressed as part of this naming pass (out of scope: that's a data-wiring improvement, not a naming/branding one).

---

## Demo organization rename (implemented)

- **Before**: `organizations.name = 'Premier CRM Demonstration'`
- **After**: `organizations.name = 'Forge Demonstration'`
- **Unchanged**: `id` (`a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`), `slug` (`premier-crm-demonstration` — treated as a stable technical identifier, not renamed during Forge V1), `timezone`, all memberships, customer accounts, properties, workflow records, invoices/payments, Storage paths, and historical audit records.
- Implemented via a new, additive migration (`supabase/migrations/20260803060000_forge_demo_org_display_name.sql`), not by editing the immutable original bootstrap migration — see the naming audit §5 and §9 for the full rationale and rollback plan.

---

## Historical-reference policy (restated)

Documents narrating a specific past event (deployment reports, cleanup reports, incident records, dated sections of living documents) are preserved exactly as written, even where they say "Premier CRM" — that was the accurate, correct name of the product at the time those events happened. Where a currently-active document needs to reference an old name for context, use a short note rather than rewriting history:

> "Premier CRM was renamed Forge before the Forge V1 release."

Do not retroactively rewrite old documents as though "Forge" was always the product's name.

---

## What this document does not authorize

This document records the approved naming model and where it applies. It does not authorize: the Base44 compatibility spike, a Forge V1 readiness audit, tagging any V1 release, renaming the GitHub repository, renaming any Supabase/Vercel project, or any change to `ppmnky.com`/`app.ppmnky.com`. See `docs/architecture/forge-foundry-naming-audit.md`'s release-gate section for the required sequencing.
