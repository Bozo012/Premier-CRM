# Forge V1.0.1 — Security Patch Release Record

## 1. Release identity

- **Product**: Forge
- **Release**: Forge V1.0.1 (security patch on the Forge V1 baseline)
- **Git tag**: `forge-v1.0.1` — **not yet created**, awaiting explicit approval
- **Base tag**: `forge-v1.0.0` → `9181d56` (unchanged, unaffected by this patch)
- **Implementation PR**: [#97](https://github.com/Bozo012/Premier-CRM/pull/97), "security: harden request estimate and site visit writes"
- **Production application commit**: `2448026` (PR #97 squash-merge to `main`)
- **Production deployment**: Vercel, project `premier-crm-web`, `dpl_5QEtPdyZ5YmiXHrXx9YJoco2e1Zj`, `READY`, aliased to `app.ppmnky.com`
- **Migration**: `supabase/migrations/20260803080000_harden_service_requests_estimates_site_visits.sql`, applied to `premier-crm-prod` via `npx supabase db push --linked`, `2026-08-03T18:22:09Z`–`2026-08-03T18:22:28Z`
- **Release date**: 2026-08-03

## 2. Patch purpose

Closes the direct-authenticated-REST write bypass on `service_requests` and `estimates` documented in `docs/security/service-requests-authorization-audit.md` (audit PR #96): a broad, org-membership-only `FOR ALL` RLS policy combined with full `authenticated` table grants let any signed-in org member — including `viewer`, which should hold zero write capability — INSERT, UPDATE, or DELETE either table directly via the REST API, bypassing every server action and RPC. This is the same defect class already closed for `jobs`/`quotes` in the earlier Batch A patch.

Also removes an unused, dependency-free customer-portal INSERT policy on `service_requests`, and adds a `canTriageRequests` capability gate to `markRequestReviewedAction`, which previously had none.

## 3. Affected tables

| Table | Before | After |
|---|---|---|
| `service_requests` | `authenticated`: SELECT, INSERT, UPDATE, DELETE; broad `FOR ALL` policy; unused portal INSERT policy | `authenticated`: SELECT only; `service_requests_select_org_members` (SELECT-only); portal INSERT policy removed; `customer_select_own_service_requests` preserved |
| `estimates` | `authenticated`: SELECT, INSERT, UPDATE, DELETE; broad `FOR ALL` policy | `authenticated`: SELECT only; `estimates_select_org_members` (SELECT-only) |
| `site_visits` | `authenticated`: SELECT only (already, pre-migration); broad `FOR ALL` policy (stale text) | `authenticated`: SELECT only (unchanged); `site_visits_select_org_members` (SELECT-only) |

## 4. `site_visits` accuracy correction

`site_visits` already had zero `authenticated` INSERT/UPDATE/DELETE grants before this migration, in both `premier-crm-e2e` and `premier-crm-prod` — most likely revoked alongside `save_site_visit_inspection`'s own `authenticated` EXECUTE-grant revocation in an earlier migration (`20260802020200_site_visit_lifecycle_rpcs.sql`). Only the `internal_org_site_visits` RLS policy text was stale/misleading — permissive on paper, inert in practice at the grant layer. This migration is a defense-in-depth/RLS-policy-consistency fix for `site_visits`, **not** the closure of a live vulnerability for that table specifically, unlike `service_requests` and `estimates`, where the vulnerability was live and is now closed by this patch. This distinction is preserved in the audit document and must not be flattened in any future summary of this release.

## 5. Test evidence

- Unit tests: 187/187 pass.
- Typecheck: clean.
- Production build: clean.
- New E2E suite `authorization-service-requests-bot.spec.ts`: 30/30 pass (run against `premier-crm-e2e` post-migration).
- `customer-intake-bot.spec.ts`: 7/7 pass, including a real-UI test of the new `markRequestReviewedAction` capability gate.
- Affected legitimate-workflow regression suites (68 tests across `employee-estimate-workflow-bot`, `estimate-pricing-approval-presentation-bot`, `estimate-pricing-review-handoff-bot`, `estimates-lifecycle-bot`, `quote-response-bot`, `quote-totals-recalc-bot`, `request-conversion-bot`, `request-site-visit-workflow-bot`): all pass, except one pre-existing, unrelated `employee-estimate-workflow-bot.spec.ts` test 12 locator-timing flake (confirmed via isolated re-run, not caused by this patch).
- Production authorization verification: 12 direct-write denial probes + 2 read-behavior checks executed against `premier-crm-prod` using real accounts inside rolled-back `SET LOCAL role` transaction simulations — all denials confirmed (`42501`), zero side effects. `subcontractor`/`viewer` role coverage is E2E-only (no such accounts exist in production).

Full detail: `docs/security/service-requests-authorization-audit.md` §14–§15.

## 6. Known unresolved items (unchanged by this patch)

- SR-1/SR-2: FK cross-org consistency (`customer_id`/`property_id`/etc.) not enforced at the database layer — out of scope.
- Customers and properties share the same defect class that `service_requests`/`estimates` had — explicitly out of scope, recorded as the next focused authorization-audit target.
- F2/F4/F6/F7 from the original Forge V1 readiness audit — not addressed.
- `employee-estimate-workflow-bot.spec.ts` test 12 — pre-existing, unrelated customers-list locator-timing flake.

## 7. Explicit statement

**`forge-v1.0.0` remains unchanged at `9181d56`.** This release record documents a security patch on top of that baseline; it does not modify, move, or supersede the `forge-v1.0.0` tag. The `forge-v1.0.1` tag has not been created as of this record — creating it requires separate explicit approval.
