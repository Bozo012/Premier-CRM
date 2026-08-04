# Forge V1.0.2 — Security Patch Release Record

## 1. Release identity

- **Product**: Forge
- **Release**: Forge V1.0.2 (security patch on the Forge V1.0.1 baseline)
- **Git tag**: `forge-v1.0.2` — **not yet created**, awaiting explicit approval
- **Base tag**: `forge-v1.0.1` → `d5e9824` (unchanged, unaffected by this patch)
- **Audit PR**: [#100](https://github.com/Bozo012/Premier-CRM/pull/100), "docs: audit customer and property authorization", squash-merged at `4e9ef66`
- **Implementation PR**: [#101](https://github.com/Bozo012/Premier-CRM/pull/101), "security: harden customers/properties authorization (Forge V1.0.2, CP-A/CP-B)"
- **Production application commit**: `fba6b7e` (PR #101 squash-merge to `main`)
- **Production deployment**: Vercel, project `premier-crm-web`, `dpl_5dRrqLCUGvrYnZkL7nXM7UTkDvCq`, `READY`, aliased to `app.ppmnky.com`
- **Migrations**: `20260804000000_harden_customers_and_properties.sql`, `20260804000001_harden_customer_properties_and_accounts.sql`, `20260804000002_fix_customer_properties_accounts_policy_recursion.sql` — applied to `premier-crm-prod` via `npx supabase db push --linked`, `2026-08-04T01:13:56Z`–`2026-08-04T01:14:40Z`
- **Release date**: 2026-08-04
- **Production verification**: **PASSED**
- **Release verdict**: **READY WITH NON-BLOCKING FOLLOW-UPS**
- **Production migration history**: fully synchronized before and after this patch (no drift, unlike E2E — see §7)

## 2. Patch purpose

Closes two findings on `customers`/`properties`/`customer_properties`/`customer_accounts` documented in `docs/security/customers-properties-authorization-audit.md`:

- **Batch CP-A** (CP-1, CP-5): the same direct-authenticated-REST write bypass already closed for `jobs`/`quotes` (Batch A) and `service_requests`/`estimates`/`site_visits` (Forge V1.0.1) — a broad, org-membership-only `FOR ALL` RLS policy plus full `authenticated` grants let any signed-in org member, including `viewer`, write directly to `customers`/`properties` via REST, bypassing every server action.
- **Batch CP-B** (CP-2, CP-3): a distinct, more serious relationship-integrity gap — `customer_properties_isolation` validated only the customer side of the customer↔property link, never the property side, and `internal_org_customer_accounts` validated only the row's own `org_id`, never that the linked customer actually belonged to it. The `customer_accounts` gap was a genuine **cross-tenant data-exposure path**: combined with the portal's `customer_id`-only SELECT policies, a malicious org member could forge a portal-account row linking their own org to another organization's customer/property/invoice data.

## 3. Why migration `...000002` exists

CP-B's first version (`20260804000001`) introduced a real bug: its policies queried `customers`/`properties` directly inside `USING`, which cycled with pre-existing policies (`customer_select_own_customer`, `customer_select_own_properties`) that query back into `customer_accounts`/`customer_properties` — a genuine RLS policy-recursion cycle, raising Postgres error `42P17`. This was caught by `authorization-customers-properties-bot.spec.ts` against E2E **before it ever reached a shared or production environment**. `20260804000002` fixes it with two `STABLE SECURITY DEFINER` helper functions (`customer_org_id()`, `property_org_id()`), matching the codebase's existing `user_is_in_org()` pattern, so the cross-table org lookup bypasses RLS on the underlying table and never re-enters the caller's own policy evaluation. **All three migrations are one indivisible patch** — `...000001` alone leaves production in a broken (recursion-error) state; only `...000000` + `...000001` + `...000002` together represent a complete, correct release.

## 4. Affected tables

| Table | Before | After |
|---|---|---|
| `customers` | `authenticated`: SELECT, INSERT, UPDATE, DELETE; broad `FOR ALL` policy | `authenticated`: SELECT only; `customers_select_org_members` (SELECT-only, org-scoped) |
| `properties` | `authenticated`: SELECT, INSERT, UPDATE, DELETE; broad `FOR ALL` policy | `authenticated`: SELECT only; `properties_select_org_members` (SELECT-only, org-scoped) |
| `customer_properties` | `authenticated`: full writes; `customer_properties_isolation` (customer-side-only check) | `authenticated`: SELECT only; `customer_properties_select_org_members` (both-sides org check via `customer_org_id()`/`property_org_id()`) |
| `customer_accounts` | `authenticated`: full writes; `internal_org_customer_accounts` (org-only check) | `authenticated`: SELECT only; `customer_accounts_select_org_members` (org + linked-customer's-actual-org check via `customer_org_id()`) |

All four tables' pre-existing customer-portal SELECT policies (`customer_select_own_customer`, `customer_select_own_properties`, `customer_select_own_customer_properties`, `customer_select_own_account`) are preserved verbatim.

## 5. Test evidence

- Unit tests: 187/187 pass.
- Typecheck: clean.
- Production build: clean.
- New E2E suite `authorization-customers-properties-bot.spec.ts`: 30/30 pass, run against `premier-crm-e2e` after all three migrations, and again after merge with a freshly-restarted, explicitly-E2E-pointed dev server.
- Adjacent regression suites (`customer-crud-bot`, `customer-command-center-bot`, `customer-intake-bot`, `operator-workflow-bot`): 47/47 pass on isolated re-run (7 pre-existing TODO-skips, unrelated). Two failures seen only under 4 parallel workers were confirmed as worker races via clean isolated re-runs, not regressions.
- Production authorization verification: 17 direct-write/cross-org denial probes plus 4 read-behavior checks executed against `premier-crm-prod` using real accounts (Demo owner/employee, PPM admin as cross-org actor, the real portal `customer_accounts` auth user) inside rolled-back `SET LOCAL role` transactions — all denials confirmed (`42501`), all reads correctly scoped, zero side effects. `subcontractor`/`viewer` role coverage remains E2E-only (no such accounts exist in production).
- Production recursion-fix verification: direct RLS-evaluated queries against all four tables as `authenticated` (forged `request.jwt.claims`, rolled back) — zero `42P17` errors.

Full detail: `docs/security/customers-properties-authorization-audit.md` §16–§17.

## 6. CP finding closure status

| Finding | Status |
|---|---|
| CP-1 (customers/properties direct-write bypass) | **Closed** |
| CP-2 (customer_properties asymmetric cross-org check) | **Closed** |
| CP-3 (customer_accounts asymmetric cross-org check / portal exposure) | **Closed** |
| CP-4 (no capability model for customer/property creation) | Non-blocking — Kevin decision, not part of this patch |
| CP-5 (denormalized fields directly writable) | **Closed** (bundled into CP-A) |
| CP-6 (`is_archived` unused) | Informational only — no change required |
| CP-7 (broader FK cross-org consistency) | Non-blocking — defense-in-depth backlog, unchanged from original audit |

## 7. Known unresolved items (unchanged by this patch)

- CP-4: no capability model exists for customer/property creation/editing even at the trusted server-action layer — Kevin decision, not addressed here.
- CP-7: broader FK cross-org consistency (`estimates`/`jobs`/`quote_line_items`/etc. referencing `customers`/`properties`) — defense-in-depth backlog, unchanged from the original audit.
- `customer_location_prefs` — flagged as a separate follow-up, not required for this batch.
- E2E's pre-existing 27-migration bookkeeping-timestamp drift (found during this session's recovery, unrelated to CP-A/CP-B) — intentionally left untouched; does not affect production, which has zero such drift.
- F2/F4/F6/F7 from the original Forge V1 readiness audit — not addressed.

## 8. Explicit statement

**`forge-v1.0.0` remains unchanged at `9181d56`, and `forge-v1.0.1` remains unchanged at `d5e9824`.** This release record documents a security patch on top of the V1.0.1 baseline; it does not modify, move, or supersede either tag. The `forge-v1.0.2` tag has not been created as of this record — creating it requires separate explicit approval.
