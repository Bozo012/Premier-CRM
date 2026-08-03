# Premier CRM Demonstration Organization

**Date:** 2026-08-02
**Production project:** `premier-crm-prod` (`apnbpcauqrjvkoleisde`)
**Status:** Organization created, Kevin's membership added, multi-tenant isolation verified. **No Demo dataset populated yet.** Brandon not onboarded. Platform v1.0 not tagged.

---

## 1. Purpose

A permanent, isolated organization for:
- Staff training
- Brandon's platform testing
- Screenshots and demonstrations
- Validating the complete request-to-payment lifecycle end to end
- Validating multi-tenant isolation
- Future UX observation
- Safe experimentation without ever touching real Premier Property Maintenance (PPM) records

This is explicitly **not** temporary E2E test data — it is a permanent fixture of production, created once and expected to persist.

## 2. Organization identity

| Field | Value |
|---|---|
| ID | `a0c9b59d-77d9-48ad-9760-8555c9ed8fe5` |
| Name | Premier CRM Demonstration |
| Slug | `premier-crm-demonstration` |
| Timezone | `America/New_York` |
| Created | 2026-08-02 23:32:25 UTC |

## 3. A real multi-tenant blocker was found and fixed before this could happen

Before creating this org, architecture inspection found that `getActiveOrgContext()` — called from ~36 places across the app — **hard-rejected any account with more than one active org membership** (`ErrorCode.CONFLICT`, "only one is supported today"). Adding Kevin's real staff account to a second org without fixing this would have broken his real PPM login on every page load.

**Fix** (migration `20260802030000_multi_org_active_selection.sql`, PR #82, merge commit `2d51546`): a nullable `user_profiles.active_org_id` preference, written only by a guarded `switch_active_org()` RPC (verifies the caller actually holds an active membership in the target org before writing anything — denies switching to a non-member org). `getActiveOrgContext()` now resolves a multi-membership account by honoring this preference when valid, and otherwise deterministically defaults to the **oldest** active membership (by `org_members.joined_at`) — never a random/unstable choice, and never silently defaulting away from a user's original org. This required **zero signature or call-site changes** — all ~36 existing callers keep working unchanged.

**Minimal UI**: the static org-name pill on `/today` becomes a `<select>` (`apps/web/app/(app)/today/_components/org-switcher.tsx`) only when the signed-in account has more than one active membership.

## 4. Bootstrap method

`bootstrap_demonstration_organization(p_initiator_user_id uuid)` (migration `20260802030100_bootstrap_demonstration_organization.sql`) — a repeatable, idempotent RPC:
- Idempotent by slug (`premier-crm-demonstration`) — rerunning returns the existing org's ID, never creates a duplicate. Verified twice in production (`node prod-bootstrap-demo-org.mjs` run twice, identical returned ID both times).
- **Restricted to `service_role` only** — no `authenticated` grant, no UI route. Invoked exclusively via a one-off internal administrative script using the existing service layer, matching the "internal administrative script" option from the approved plan rather than building a new public "create organization" feature.
- Creates an `activity_log` audit record (`event_type: 'organization_bootstrapped'`) naming the initiating user — for the real production bootstrap, this correctly recorded Kevin's real user ID (`234ecd59-0003-4e68-bc21-df8a3535d7bb`) as initiator.
- No hardcoded Demo org ID exists anywhere in the codebase — every reference resolves the org by slug at call time.

## 5. Initialized settings

| Concern | Result |
|---|---|
| `organizations` row | Created with name/slug/timezone above; all other columns use table defaults (`default_markup_pct=25.0`, `ai_enabled=true`, etc. — same defaults every new org gets). |
| Numbering (request/estimate/invoice sequences) | **Global, not per-org** — `service_request_number_seq`, `estimate_number_seq`, `invoice_number_seq` are shared Postgres sequences across all organizations. Demo's first service request will continue the same global counter PPM uses (e.g. `SR-000009`, not a fresh `SR-000001`). This is pre-existing platform behavior, unrelated to this bootstrap, and applies identically to any future third org. |
| Automation rules | **Auto-seeded — a real finding, not something this bootstrap built.** An existing trigger (`on_organization_created` → `seed_default_automations()`, from migration `0006_seed_automations.sql`) fires on every `organizations` INSERT and seeded 12 generic, `is_system_default = true` automation rules for Demo automatically (verified: "Start time on arrival", "Notify customer on arrival", "Close out job when leaving", etc. — no PPM-specific names, addresses, or business data in any of them). This corrects an earlier planning assumption that automation rules would need explicit seeding or would start empty. |
| Geofences | **Empty, by design** — no trigger seeds these (PPM's 4 supplier geofences were added manually/via import, not by generic bootstrap infrastructure). Demo starts with zero geofences; add manually if geofence-dependent automation needs to be demonstrated. |
| Website content (`website_settings`, promotions, service highlights) | **Not initialized.** Demo has no associated public marketing site (unlike PPM/`ppmnky.com`), so this is not applicable — the `/settings/website` CRM page and any public-intake API route remain PPM-specific (see §6). |
| Storage | No Demo-specific bucket needed — `site-visit-attachments` is a single shared bucket, already org-prefixed (`{org_id}/...`) for every organization; Demo's uploads will land under its own `a0c9b59d-.../` prefix automatically once real uploads happen. |

## 6. A real architectural finding: no public intake path exists for Demo

The public-intake API routes (`/api/v1/service-requests`, `/api/v1/quote-requests`, `/api/v1/portal/link-account`, `/api/v1/website-content`) all hardcode `PREMIER_ORG_ID` (env override, defaulting to PPM's org ID) — this is **correct and intentional**, since these routes serve `ppmnky.com`, a marketing site that only ever represents PPM. There is no marketing site for the Demo organization and none is planned as part of this phase.

**Consequence for the proposed dataset (§8)**: a Demo service request cannot be created through the real public-facing intake form the way a PPM one can. The minimum controlled setup is either (a) a direct, deliberate row insert for the initial "public-intake-equivalent" service request only (documented as such, not hidden), with every subsequent step of the lifecycle performed through real staff-facing application workflows, or (b) temporarily pointing `PREMIER_ORG_ID` at the Demo org for one deliberate populate session (not recommended — risks accidentally routing a real PPM inquiry to the wrong org if forgotten). Option (a) is recommended when the dataset is actually populated (a separate, not-yet-approved step).

## 7. Kevin's Demo membership

| Field | Value |
|---|---|
| `org_members.id` | `05521ad6-efde-458a-8219-d36107509770` |
| `user_id` | `234ecd59-0003-4e68-bc21-df8a3535d7bb` (real, existing PPM auth identity — no second account created) |
| `role` | `owner` |
| `status` | `active` |
| `joined_at` | 2026-08-02 23:32:51 UTC |

Kevin's original PPM membership (`org_members.id = aaf3f37b-97e0-4404-a0af-fd43919dd067`, joined 2026-05-01) is **untouched** and remains the default: with no `active_org_id` preference set, `getActiveOrgContext()` was verified — using the real, unmodified function against real production data — to resolve to PPM (`orgId: a0000000-...`, `orgName: Premier Property Maintenance LLC`), with `hasMultipleOrgs: true` and both organizations correctly listed for the switcher.

A round-trip preference test (set `active_org_id` to Demo directly, verify resolution follows it, clear it, verify resolution returns to PPM) was performed and Kevin's original `null` preference state was fully restored afterward. The guarded RPC's write-path authorization was **not** exercised with Kevin's specific real session (would require his real password, which was never obtained or handled) — that boundary is proven generically with real signed-in temporary accounts in `tests/e2e/multi-org-switching-bot.spec.ts` (6/6 passing), which exercises the identical code path any real multi-org account — including Kevin's — goes through.

## 8. Organization-switching behavior

- Active organization is explicit, resolved server-side on every request via `getActiveOrgContext()` — never inferred from a client-supplied value.
- The org switcher (`/today`) is visible only when `hasMultipleOrgs` is true; for every single-org account (the other 3 real PPM staff, unaffected), the UI is unchanged.
- `switchActiveOrgAction()` calls the guarded RPC, then `revalidatePath('/', 'layout')` — every already-rendered page picks up the new active org on next navigation.
- Because `getActiveOrgContext()` is the single resolution point every one of the ~36 call sites already uses, switching correctly affects navigation, dashboard counts, and server actions uniformly — no call site needed individual updates.
- Direct URLs to a specific entity remain safe: every entity page already filters its query by the resolved active `orgId` (pre-existing pattern, unchanged) — navigating to a PPM entity's URL while Demo is active resolves to `NOT_FOUND`, not a leaked cross-org read, exactly as it already did for genuinely non-member cross-org attempts before this feature existed.
- Portal/customer sessions are entirely unaffected — `active_org_id` lives on `user_profiles`, which has no relationship to `customer_accounts` or the portal auth flow.

## 9. Multi-tenant isolation tests

Automated, run against `premier-crm-e2e` (temporary fixtures, fully torn down):

- `packages/db/queries/org-context.test.ts` (5 unit tests) — single membership unchanged, zero memberships still `NOT_FOUND`, valid preference honored, no-preference deterministic oldest-default, stale/non-member preference falls back safely rather than being trusted.
- `tests/e2e/multi-org-switching-bot.spec.ts` (6 tests) — deterministic oldest-default with real data; `switch_active_org()` denies a genuinely non-member org; switch succeeds and updates the preference; the real `getActiveOrgContext()` function follows the switch; RLS correctly still allows a genuine multi-membership user to read either org they actually belong to (the active-org preference is an application-layer default, not an RLS boundary — cross-org denial for a truly non-member actor is proven separately and already extensively by the pre-existing `request-site-visit-workflow-bot`'s cross-org tests); round-trip switching works both directions.
- `tests/e2e/demonstration-org-bootstrap-bot.spec.ts` (4 tests) — `service_role`-only restriction, idempotency, audit record, org identity.

Verified directly against **real production data** (not test fixtures):
- Kevin's real identity resolves to PPM by default despite holding 2 active memberships (§7).
- Explicit-preference resolution followed Demo when set, returned to PPM when cleared, with his original state fully restored.
- Post-bootstrap counts: `organizations=2, org_members=5` (4 real PPM + Kevin's new Demo row), `demo_org_members=1`, `ppm_org_members=4` (unchanged), zero customers/properties/service_requests/estimates/quotes/jobs/invoices/payments in either organization.

**Not separately re-verified against real production identities** (already proven exhaustively against the identical RLS/RPC mechanisms in the prior production deployment's cross-org audit, and re-proven generically for the new preference/switch mechanism above): Demo staff cannot access PPM entities, PPM-non-Demo staff cannot access Demo entities, Storage/activity_log/customer-portal cross-org denial. These all rely on the same `user_is_in_org()`-based RLS and the same per-query `org_id` scoping that this phase did not modify — only the *default org selected when a user has multiple memberships* changed, not what any query is allowed to read once an org is selected.

## 10. Brandon's account status (discovery only — not acted on)

Verified directly against production, not assumed from prior notes (which turned out to reference a stale user ID):

| Field | Value |
|---|---|
| Real auth user exists | Yes — `7eda95cf-74ca-4c26-a15f-2141e3789be5` |
| Email | `brandonjfleenor28@gmail.com` |
| Account created | 2026-08-01 20:41:30 UTC |
| Email confirmed | **No** |
| Ever signed in | **No** |
| PPM `org_members` row | **None exists** |
| Invite history | 4 total attempts: 2 revoked for `brandonjfleenor28@gmail.com`, 1 revoked for a differently-spelled `fleenor.brandon7@gmail.com`, 1 **currently pending** (employee role, PPM org, expires 2026-08-15) |

Since Brandon has zero existing memberships, adding a Demo membership later would not affect any existing PPM state. **Not added — awaiting explicit approval**, per instruction.

## 11. Proposed Demo dataset (design only — not populated)

Realistic, fictional names/addresses; no real PPM customer, financial, or employee data cloned. Prefer real application workflows over direct SQL wherever a path exists (§6 notes the one exception).

| Element | Fictional identity / real workflow |
|---|---|
| Residential customer | "Angela Whitfield", 123 Maple Grove Ln, Lexington, KY — created via `/customers/new` |
| Commercial customer | "Riverbend Property Group" (property manager type) — created via `/customers/new` |
| Properties | Angela's home; Riverbend's two managed properties (456 Commerce Way Suite 100; 789 Oakhill Plaza), both Lexington, KY |
| Public intake | One initial service request created via the minimum controlled setup in §6 (direct insert, clearly documented as such — not a real public-form submission, since none exists for Demo) |
| Remote-estimate path | Triage decision `remote_estimate` on a second request, via the real triage panel |
| Site-visit-required path | Full lifecycle via real UI: triage → schedule → reschedule once → start → inspect (2 real distinct findings, at least one photo) → complete → generate estimate |
| Direct-work-order path | Triage decision `direct_work_order` with structured authorization (`written_customer_authorization` type) via the real triage panel |
| Appointment scheduling/rescheduling | Part of the site-visit-required path above |
| Inspection findings/photos | Part of the site-visit-required path above — recommend at least 2 genuinely distinct real or realistic photos (the production smoke test's one-fixture limitation should not be repeated here if avoidable) |
| Estimate generation | Real `generate_estimate_from_site_visit()` RPC via the UI |
| Pricing approval | Kevin (owner) via the real pricing-review panel |
| Quote sending/acceptance | Real quote-send action; acceptance via a real Demo customer portal account (see below) |
| Job creation/scheduling | Real accepted-quote → job flow (unmodified by this work) |
| Deposit requirement | Real deposit-management action |
| Working invoice | Real job-in-progress working invoice flow |
| Change order | Real propose/respond change-order flow, exercised from both the staff and portal sides |
| Final invoice | Real generate-final-invoice action |
| Payment | **Decision needed before populating**: recommend a manual/no-real-money payment record (this schema's existing manual payment-recording path, not a real Stripe/processor charge) — flagging explicitly rather than defaulting silently |
| Customer portal visibility | Real portal accounts for Angela and Riverbend's contact, exercising the same customer-safe projections already proven in the site-visit workflow |
| Staff-role differences | Requires at least one additional Demo-org staff member beyond Kevin (e.g., an `employee` and a `subcontractor`) — real invite-and-accept flow, with clearly Demo-labeled fictional identities (not `E2E_TEST_`-style naming, since these are permanent) |
| Timeline history | Populates automatically via `activity_log` as every workflow above executes — no separate step |

**This dataset has not been created.** Populating it is a separate, not-yet-approved next step.

## 12. Known limitations / intentionally not initialized

- Numbering sequences are global across all organizations (§5) — a Demo request/estimate/invoice number will not start at 1.
- Website content/marketing-site configuration is not applicable to Demo and was not initialized.
- Geofences start empty for Demo (no seeding trigger exists for these).
- No organization-deletion/deprovisioning tooling was built or considered in this phase — out of scope.
- `docs/PREMIER_PLATFORM_VISION.md` was not created — no new architectural decision in this phase warranted it; it remains a later, explicit Milestone/Phase deliverable.
