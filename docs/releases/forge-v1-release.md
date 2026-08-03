# Forge V1 — Release Record

## 1. Release identity

- **Product**: Forge
- **Release**: Forge V1
- **Git tag**: `forge-v1.0.0`
- **Release checkpoint commit**: `24bf3d4` (main HEAD at the time of the Forge V1 readiness verdict, includes the Batch A production-verification addendum)
- **Production application commit**: `9cd737b` (the last commit to change application code — all commits between `9cd737b` and `24bf3d4` are documentation-only, see `docs/releases/forge-v1-readiness-audit.md`)
- **Production deployment**: Vercel, project `premier-crm-web`, most recently rebuilt at `dpl_Ev6wEVwQU5X97nSmcygNvu6KcBc1` (a docs-only rebuild triggered automatically by the documentation commits above; application behavior is identical to the deployment built directly from `9cd737b`, `dpl_Toh88Xdwgn6Zx6PtBLJavbyxvWBv`)
- **Production URL**: `app.ppmnky.com`
- **Release date**: 2026-08-03

## 2. Release summary

Forge V1 is the first audited production baseline of the Forge platform. It covers, as verified working end-to-end in production and/or the E2E environment:

- Customer and property management
- Request intake and triage (remote estimate, site visit required, direct work order)
- Remote estimates
- Site visits and appointment scheduling
- Inspection capture (measurements, quantities, materials, hazards, photos)
- Pricing review (employee submission → owner/admin approval or return-for-changes)
- Quotes (creation, sending, customer response)
- Customer quote response (accept/decline via the share-token portal)
- Job conversion (accepted quote → job; direct work order → job)
- Scheduling
- Deposit invoices
- Working invoices
- Change orders (staff proposal → customer approval/decline → incorporation)
- Final invoices
- Payments
- Customer portal / share-token workflows
- Multi-organization support (active-org resolution and switching)
- Role-aware Today action queue (pricing-review, create-quote, send-quote tasks)

This release record does not claim any feature beyond what is listed above. Deferred or non-blocking items are listed in §5.

## 3. Verification summary

- **Unit tests**: 180/180 passing (`pnpm test`)
- **Batch A authorization E2E**: 15/15 passing (`authorization-batch-a-bot.spec.ts`, `premier-crm-e2e`)
- **Affected workflow regression E2E**: 38/38 passing (accepted-quote→job, scheduling, capability parity, pricing-review handoff, request conversion, site-visit workflow — `premier-crm-e2e`)
- **Typecheck**: clean across all packages
- **Production build**: clean
- **Batch A production verification**: PASSED — direct production checks (real accounts, rolled-back transactions) confirmed the authorization fixes hold in production with zero side effects
- **PPM blank-state**: preserved — 0 customers, 0 jobs, 0 quotes, unchanged throughout
- **Demo health**: preserved — 2 customers, 2 jobs, 3 quotes, unchanged throughout

Full evidence: `docs/releases/forge-v1-readiness-audit.md`.

## 4. Security baseline

- `jobs` and `quotes`: authenticated clients (any role) have SELECT-only access at the database layer. Legitimate creation and mutation of both occur exclusively through trusted server actions (service-role database access) or approved RPCs (e.g. `apply_job_scheduling()`), never through a direct authenticated table write.
- Organization isolation is enforced at the database layer (row-level security scoped by organization membership) across all core entity tables.
- Customer/share-token job and quote access remains scoped to the customer's own linked records.
- Direct unauthorized writes to `jobs`/`quotes` (bypassing the application's role-based capability checks) are denied at both the application layer and the database layer, verified in production.

This is a high-level summary appropriate for an internal release record — see `docs/releases/forge-v1-readiness-audit.md` for the full technical audit.

## 5. Known non-blocking follow-ups

Carried forward from the readiness audit with their existing classification unchanged:

- **F2** — `createEstimateFromRequestAction` triage-state desynchronization (data-integrity/UX defect, not a security issue; out of Batch A scope).
- **F4** — duplicate legacy/canonical UI path on the request-detail page (stale UI, root cause of F1's original exposure; UI-only, not a security issue post-Batch-A).
- **F6** — `customer_archetype_defaults` table has RLS disabled (low-medium severity, non-sensitive reference data, cross-tenant writable; open Kevin decision).
- **F7** — two test-purposed accounts (`e2e-admin-bot@example.com`, `delivered+e2e-employee-persistent@resend.dev`) hold standing membership in the real PPM organization (medium severity, no data at risk while PPM is blank; open Kevin decision).
- **`service_requests` broad-authenticated-write pattern** — discovered during Batch A's database-boundary audit; explicitly classified as a candidate for a future, separate security-focused batch, not Batch B/D, and not a V1 blocker (cannot fabricate a new unauthorized job/quote now that F1/F3 are closed).
- **Resend/transactional email** — not configured in production; no workflow hard-depends on it (all notification sends are best-effort/non-blocking); open product decision on timing, not a functional gap.
- **Global numbering sequences** — request/estimate/invoice numbering remains shared across all organizations rather than per-organization; pre-existing, documented, recommended before broader multi-tenant scale-up.
- **Base44 compatibility spike and future UI refinement** — not started; separate, explicitly-gated future phase.

## 6. Brand boundary

- **Forge** is the software product — the staff CRM, customer portal, and supporting platform.
- **Foundry** is the future umbrella ecosystem name — currently confined to architecture/documentation contexts, not a public brand.
- **Premier Property Maintenance** remains the operating business and the first organization running on Forge — its name, public marketing website, domains, and customer-facing branding are unchanged.
- The public PPM marketing website was not modified or rebranded as part of Forge V1.
- Repository name, package scope (`@premier/*`), Supabase/Vercel project identifiers, and other infrastructure identifiers were deliberately preserved for stability during this rename — this reflects a scoped, deliberate decision (see `docs/architecture/forge-foundry-naming-audit.md`), not an incomplete product rename.

## 7. Next-phase boundary

Forge V1 is the stable, audited baseline before any of the following begin:

- `service_requests` authorization hardening (a dedicated future security batch)
- Remaining non-blocking follow-up items (§5)
- The Base44 compatibility spike and any resulting UI work
- Any future public Foundry branding

None of the above are in scope for or included in Forge V1.
