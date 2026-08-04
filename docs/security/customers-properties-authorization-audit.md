# `customers` / `properties` Authorization Audit

Status: **read-only audit, complete.** No code, tests, migrations, grants, policies, production data, deployment configuration, or release tags were modified as part of this document. Nothing here is implemented — see "Explicit exclusions" and "Stopping point."

Audited at: `main` HEAD `1af91c5` (Forge V1.0.1 tagged and deployed; the tag itself, `forge-v1.0.1` → `d5e9824`, and `forge-v1.0.0` → `9181d56`, are unaffected by anything in this audit).

---

## 1. Executive conclusion

**Real vulnerabilities are confirmed — both a direct-write bypass matching the pattern already closed for `service_requests`/`estimates`/`site_visits`, and a distinct, more serious relationship-integrity gap that is new to this audit.**

- **Affected roles**: every role holding active membership in an organization (owner, admin, employee, subcontractor, viewer) — `org_isolation_customers` and `org_isolation_properties` make no role distinction, only organization membership. `viewer` again has full database-level write access despite holding zero write capabilities in the TypeScript model.
- **Proven direct-write impact**: any signed-in org member can, via a direct Supabase REST call, INSERT/UPDATE/DELETE `customers` and `properties` rows in their own org, bypassing `createCustomerAction`/`createPropertyForCustomerAction` entirely — forging contact details, billing terms (`payment_terms_days`, `standing_approval_threshold`, `consolidate_invoices_monthly`), archive state, or denormalized fields (`total_jobs`, `total_revenue`) that should be system-managed. This is the same defect class as the already-closed `service_requests`/`estimates` finding.
- **Proven relationship-integrity impact — the more serious finding**: `customer_properties_isolation` (the RLS policy on the customer↔property junction table) validates only that `customer_id` belongs to the caller's org; it never checks `property_id`'s org at all. **A signed-in org member can currently link one of their own org's customers directly to a property belonging to a different organization**, with no RLS or constraint blocking it. Worse, the same asymmetric-check pattern exists on `customer_accounts` (`internal_org_customer_accounts`, `FOR ALL`, org-membership-only) — an org member could insert a `customer_accounts` row whose `org_id` is their own but whose `customer_id` belongs to a different org, and the narrow customer-portal SELECT policies (`customer_select_own_customer`, `customer_select_own_customer_properties`, `customer_select_own_properties`) only join on `customer_id`, not org — creating a path to read another organization's customer, property, and invoice data through the portal-account mechanism. This is a genuine cross-tenant data-exposure vector, not merely a tampering risk.
- **Recommended release classification**: **Forge V1.0.2 normal security patch** for the direct-write boundary (Batch CP-A, mirrors the already-shipped pattern exactly) and the `customer_properties`/`customer_accounts` org-consistency fix (Batch CP-B) together — not an emergency hotfix (no confirmed exploitation, PPM is blank, Demo is the only populated org and is controlled), but not backlog either, since the `customer_accounts` cross-org read path is a genuine privacy/tenant-isolation gap, not just an integrity nicety.
- **Immediate production action required**: No. PPM is blank; Demo is controlled. This audit recommends scheduling the fix.
- **Recommended hardening approach**: Option A (revoke `authenticated` writes, route through service-role/RPC) for `customers`/`properties`, exactly matching the established pattern — zero legitimate authenticated-client write dependency exists (confirmed below). For the relationship-integrity gap, the smallest sufficient fix is **not** a database-level composite-FK (Postgres cannot express `customer_properties.property_id`'s org must equal `customer_properties.customer_id`'s org via a plain FK without a redundant `org_id` column on the junction table) — the practical smallest fix is a `WITH CHECK`/`USING` expression on `customer_properties_isolation` (and `internal_org_customer_accounts`) that validates **both** sides' org membership, which is achievable in RLS alone once direct writes are also closed off entirely by Option A (making the RLS fix largely moot for `authenticated`, but still correct defense-in-depth, and essential if any future RPC ever needs `authenticated`-level enforcement). See §10/§13 for full reasoning.
- **Implementation risk**: Low for Batch CP-A (identical pattern to two already-shipped patches). Low-Medium for Batch CP-B (touches a live junction table with real Demo data; must preserve legitimate property-to-customer linking during creation).

---

## 2. Current authorization state

### Grants (identical on `premier-crm-e2e` and `premier-crm-prod` — no drift)

| Table | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `customers` | none | SELECT, INSERT, UPDATE, DELETE | full |
| `properties` | none | SELECT, INSERT, UPDATE, DELETE | full |
| `customer_properties` | none | SELECT, INSERT, UPDATE, DELETE | full |
| `customer_accounts` | none | SELECT, INSERT, UPDATE, DELETE | full |

### Policies (identical on both environments)

| Table | Policy | Command | USING | WITH CHECK |
|---|---|---|---|---|
| `customers` | `org_isolation_customers` | `FOR ALL` | `user_is_in_org(org_id)` | *(none — falls back to USING)* |
| `customers` | `customer_select_own_customer` | `FOR SELECT` | `EXISTS(active customer_accounts row matching auth.uid() + customer_id)` | — |
| `properties` | `org_isolation_properties` | `FOR ALL` | `user_is_in_org(org_id)` | *(none)* |
| `properties` | `customer_select_own_properties` | `FOR SELECT` | `EXISTS(customer_accounts ⋈ customer_properties matching auth.uid() + property_id)` | — |
| `customer_properties` | `customer_properties_isolation` | `FOR ALL` | `EXISTS(customers WHERE customers.id = customer_properties.customer_id AND user_is_in_org(customers.org_id))` — **checks only the customer side** | *(none)* |
| `customer_properties` | `customer_select_own_customer_properties` | `FOR SELECT` | `EXISTS(active customer_accounts row matching auth.uid() + customer_id)` | — |
| `customer_accounts` | `internal_org_customer_accounts` | `FOR ALL` | `user_is_in_org(org_id)` | *(none)* |
| `customer_accounts` | `customer_select_own_account` | `FOR SELECT` | `auth_user_id = auth.uid()` | — |

**`org_isolation_customers`/`org_isolation_properties` are the direct-write finding** — identical shape to the pre-hardening `internal_org_service_requests`/`internal_org_estimates` policies: `FOR ALL`, org-membership only, no `WITH CHECK`, no role distinction.

**`customer_properties_isolation` is the relationship-integrity finding** — its `USING` expression only proves the caller's org matches the *customer's* org; it never joins to `properties` to check the property's org. Because `customer_properties` has no `org_id` column of its own, there is no fallback check either. This is a genuine, deductively-confirmed gap in the policy's logic (confirmed by reading the policy definition — no exploit attempt was necessary to establish this).

**`internal_org_customer_accounts` has the identical shape and identical gap** relative to the customer it links: it never verifies that `customer_accounts.customer_id` actually belongs to `customer_accounts.org_id`.

### Table structure (schema-verified directly)

- **`customers`**: RLS enabled (not forced), owned by `postgres`. One trigger, `customers_updated_at` (`BEFORE UPDATE`, sets `updated_at`) — no state-transition or ownership-validation trigger. PK `id`; FK `org_id → organizations(id) ON DELETE CASCADE`; FK `referred_by_id → customers(id)` (self-referential, `NO ACTION`); UNIQUE `jobber_id` (global, not per-org — a pre-existing, non-security data-integrity note, unrelated to this audit).
- **`properties`**: RLS enabled (not forced). Two triggers: `properties_updated_at` (sets `updated_at`) and `properties_auto_geofence` (`AFTER INSERT/UPDATE`, auto-creates a geofence row) — no ownership-validation trigger. PK `id`; FK `org_id → organizations(id) ON DELETE CASCADE`; UNIQUE `jobber_id` (global). **`properties` has no `customer_id` column** — the customer↔property relationship is exclusively many-to-many via `customer_properties`.
- **`customer_properties`**: composite PK `(customer_id, property_id)`; FK `customer_id → customers(id) ON DELETE CASCADE`; FK `property_id → properties(id) ON DELETE CASCADE`. **No `org_id` column. No triggers at all.** Both FKs are plain single-column FKs — neither Postgres FK mechanism nor any trigger enforces that the referenced customer and property share the same `org_id`.
- **`customer_accounts`**: the customer-portal auth-link table (`customer_id`, `auth_user_id`, `org_id`, `status`). Same broad-policy shape as above.
- **Drift check**: live schema (both environments) matches what the migrations describe — no undocumented drift found on any of the four tables.

### RPCs affecting these tables

Only one `SECURITY DEFINER` function references `customer_properties` in any way: `_apply_triage_decision()` (called by the triage RPCs), which **reads** `customer_properties` to resolve a property for a request, and never writes to `customers`, `properties`, or `customer_properties`. **No RPC writes to any of the four tables in this audit's scope.**

---

## 3. Customer field-risk matrix

| Field | Purpose | Intended writer | Current exposure | Impact if tampered | Required protection |
|---|---|---|---|---|---|
| `org_id` | Tenant identity | System, at creation | Cross-org reassignment blocked by the implicit `WITH CHECK`-via-`USING` fallback (same incidental protection as the pre-hardening `service_requests` finding) | Low (already mitigated for the row's own org_id) | none additional |
| `first_name`, `last_name`, `company_name`, `display_name`, `email`, `phone_primary`, `phone_secondary`, `preferred_channel`, `notes`, `tags`, `source` | Contact/identity data | Whoever creates/edits the customer (staff) | Any org member can edit freely | Low — legitimate day-to-day staff editing is expected; not itself a security concern | Trusted write path (routes editing through an auditable, capability-aware surface — not required to *prevent* editing, just to close the direct-REST bypass) |
| `referred_by_id` | Self-referential customer link | System/staff | Any org member can repoint to any customer `id`, including a customer in another org (no org-consistency check on this FK) | Low-Medium — cosmetic/reporting corruption (a wrong "referred by" attribution), no read-access bypass since it doesn't gate visibility of anything | Out of scope for this batch — narrow, cosmetic-only field; recorded, not remediated here |
| `standing_approval_threshold`, `payment_terms_days`, `consolidate_invoices_monthly` | **Billing terms** — affect invoicing/consolidation behavior downstream | Owner/admin (billing decision) | Any org member, including `viewer`, can currently set these directly | **Medium-High** — a subcontractor or viewer could silently grant a customer looser billing terms (e.g. raise `standing_approval_threshold`, enable monthly consolidation) with no audit trail through the trusted path | Trusted write path; consider a narrower capability than "any staff member" for these specific fields (Kevin decision, §15) |
| `total_jobs`, `total_revenue`, `last_contact_at`, `last_job_completed_at` | **System-managed denormalized/computed fields** | System only (should never be user-writable) | Any org member can directly set arbitrary values via REST — no application code currently writes these either (not found in the write-path inventory), meaning they may be entirely stale/unmaintained today, a separate product question outside this audit's scope | Medium — could mislead reporting/dashboards if forged; no direct financial-transaction impact (nothing charges money based on these fields, confirmed via the jobs/invoices audits) | Trusted write path; these should arguably never be authenticated-writable at all, regardless of role |
| `is_archived` | Archive flag | Should be system/staff, but **no application code path ever sets it** (confirmed: only one read-filter reference in `estimates/actions.ts`'s customer picker) | Any org member can set it directly today; would silently hide a customer from the estimate-creation picker with no corresponding "archive" UI to explain why | Low-Medium — availability/visibility impact, not a data-exposure or financial risk; more of a product gap (archive column exists, feature doesn't) than a security hole | Trusted write path once an actual archive feature exists (Kevin decision, §15) |
| `jobber_id` | Import identifier | Jobber import script only (service-role, offline) | Any org member can set/clear this via direct REST, potentially colliding with the **global** unique constraint and blocking a future legitimate import | Low — denial-of-service against the import process, not data exposure | Trusted write path |
| `created_at`, `updated_at` | Timestamps | System | `updated_at` is trigger-managed (any manual write is overwritten); `created_at` has no trigger and is directly writable | Low — cosmetic/audit-trail distortion only | Trusted write path closes this incidentally |

---

## 4. Property field-risk matrix

| Field | Purpose | Intended writer | Current exposure | Impact if tampered | Required protection |
|---|---|---|---|---|---|
| `org_id` | Tenant identity | System, at creation | Cross-org reassignment blocked by the same incidental `USING`-fallback protection | Low | none additional |
| `address_line_1/2`, `city`, `state`, `zip`, `country` | Physical address | Whoever creates/edits the property | Any org member can edit freely | Low-Medium — legitimate editing is expected, but an address change on an *existing* property with live scheduled work could misdirect a crew; not itself an authorization exploit, a workflow-integrity concern | Trusted write path |
| `location`, `geocoded_at`, `geofence_center`, `geofence_radius_m`, `hide_from_auto_tracking` | Geolocation / auto-tracking | System (`properties_auto_geofence` trigger) + staff overrides | Any org member can directly set these, including `hide_from_auto_tracking` (could suppress legitimate location-based automation) | Low-Medium | Trusted write path |
| `property_type`, `year_built`, `square_footage`, `lot_size_sqft`, `stories` | Property attributes | Staff | Any org member can edit | Low | Trusted write path |
| **`gate_code`, `access_notes`, `parking_notes`, `hazards`** | **Physical access/security information** | Staff, entered once and referenced by field crews | Any org member can read/edit; a `viewer` (should hold zero write capability) can currently overwrite a gate code or hazard note, potentially creating a genuine physical-safety issue if a crew relies on stale/tampered access instructions | **Medium** — the realistic risk is corruption/staleness (a malicious or careless direct write silently changing a gate code a crew then can't use, or removing a hazard warning), not disclosure (these fields are already org-visible by design; RLS SELECT is correctly org-scoped) | Trusted write path — the write boundary matters more than the read boundary here, since the field is *supposed* to be staff-visible |
| `notes`, `satellite_image_url`, `street_view_url` | Staff notes / imagery | Staff/system | Any org member can edit | Low | Trusted write path |
| `jobber_id` | Import identifier | Jobber import script only | Same as customers — global-uniqueness collision risk | Low | Trusted write path |
| `created_at`, `updated_at` | Timestamps | System | Same as customers | Low | Trusted write path |

**Relationship field, tracked separately since it lives on `customer_properties`, not `properties`**: the customer↔property link itself (`customer_id`, `property_id`, `relationship`, `is_primary`) is the subject of the relationship-integrity finding in §7 — its risk profile is materially higher than any single column above, since it's the one field-set that can produce genuine cross-org data exposure, not just tampering.

---

## 5. Complete write-path inventory

| File / Function | Actor | Client type | Operation | Fields | Current authorization | Direct-write dependency | Test coverage | Hardening impact |
|---|---|---|---|---|---|---|---|---|
| `packages/db/queries/customers.ts` → `createCustomer()` | Staff (via server action) | `createServiceClient()` (service-role) | INSERT `customers` | all customer-entry fields | Caller context requires signed-in + active org (`getActiveOrgContext`); **no capability check anywhere in the call chain** | None — already service-role | No dedicated unit test found for the action's authorization boundary (only shape/validation coverage implied by the Zod schema) | None — unaffected by revoking `authenticated` grants |
| `packages/db/queries/properties.ts` → `createPropertyForCustomer()` | Staff (via server action) | `createServiceClient()` | INSERT `properties`, UPSERT `customer_properties` | property fields + link row | Same as above; verifies `customerId` belongs to `orgId` before creating the property, but performs no capability check | None — already service-role | Same gap as above | None |
| `apps/web/app/(app)/customers/actions.ts` → `createCustomerAction` | Staff | delegates to the service-role query above | INSERT `customers` | — | `getCustomerActionContext()` = signed-in + org membership only; **`hasCapability` is never imported or called in this file** | None | None found | None (server action already correct client-side; the *missing capability gate* is a separate, TS-layer-only finding — see §15) |
| `apps/web/app/(app)/customers/actions.ts` → `createPropertyForCustomerAction` | Staff | same | INSERT `properties` + `customer_properties` link | — | same as above | None | None found | None |
| `apps/web/app/(app)/customers/actions.ts` → `checkCustomerEmailAction` | Staff | same | SELECT only (dedupe check) | — | same auth context | N/A | None found | N/A |
| `packages/db/queries/service-requests.ts` → `createServiceRequest()` | **Anonymous public visitor** | `createServiceClient()` | SELECT/INSERT `customers` (dedupe by email then phone), SELECT/INSERT `properties` (dedupe by org+zip+address), UPSERT `customer_properties` | contact + address fields from the public form | No auth at all — CORS-gated to marketing-site origins, honeypot field, in-memory IP rate limit (10/hr, does not survive multi-instance/redeploy) | None — service-role | `customer-intake-bot.spec.ts` (happy path, honeypot, validation, rate-limit — 7/7 passing) | None — unaffected by an `authenticated`-role grant change, since this path never uses the `authenticated` role |
| `apps/web/app/portal/actions.ts` → `ensureCustomerAccount()` | Newly-signed-up portal user | `createServiceClient()` | SELECT/INSERT `customers`, UPSERT `customer_accounts` | email-matched customer + account link | Identity comes from a just-completed Supabase Auth `signUp` (trusted); org hardcoded to `PREMIER_ORG_ID` | None — service-role | Not explicitly enumerated in this audit's search; existing portal E2E coverage (`portal-auth-bot.spec.ts`) exists per prior session notes | None |
| `apps/web/app/api/v1/portal/link-account/route.ts` | Authenticated marketing-site portal user (bearer token verified via `anonClient.auth.getUser(token)`) | `createServiceClient()` | SELECT/INSERT `customers`, UPSERT `customer_accounts` | same as above | Token-verified identity (not attacker-supplied), rate-limited (20/hr/IP), org hardcoded | None — service-role | Not enumerated in this audit's search | None |
| `apps/web/app/(app)/requests/actions.ts` → `getRequestConversionContext()` | Staff | `createServiceClient()` | **Reads** `customer_properties` only; never creates a customer/property (returns a validation error if none exists) | — | N/A (read-only) | Covered indirectly by existing request-conversion E2E | N/A |
| `apps/web/app/(app)/estimates/actions.ts` | Staff | `createServiceClient()` | Reads `customers`/`customer_properties`/`properties` for picker UI only | — | N/A | N/A | N/A |
| `packages/db/queries/jobs.ts`, `packages/db/queries/quotes.ts` | Staff | `createServiceClient()` | Reads only (denormalized joins for list/detail display) | — | N/A | N/A | N/A |
| `packages/automation/engine.ts` | System (rule engine) | service-role context | Reads `customer_properties` only | — | N/A | N/A | N/A |
| `scripts/import-jobber-export.mjs` | Developer, CLI-only | Hand-rolled REST client using `SUPABASE_SERVICE_ROLE_KEY` from env/`.env` | Bulk UPSERT/INSERT/UPDATE `customers`, `properties`, `customer_properties` | full import payload | Not HTTP-reachable; same trust model as any offline admin script holding the service-role key | None — offline, service-role | N/A (not part of the running app) | None |
| `scripts/dedupe-properties-by-address.mjs` | Developer, CLI-only | Same hand-rolled service-role REST client | DELETE duplicate `properties` rows + cascaded `customer_properties`/related rows | — | Same as above; `--execute` flag gates real deletes | None | N/A | None |
| `tests/e2e/utils/cleanup.ts` and ~13 spec files | Test harness | `createGuardedServiceClient()` (service-role, gated by `hasServiceRoleCleanupCredentials()`) | INSERT (fixtures) / DELETE (teardown) across `customers`, `properties`, `customer_properties` | fixture data | Service-role by design, not `authenticated` | None — confirmed no spec uses an authenticated-role client to write directly to these tables | Self-referential (these *are* the tests) | None — but new specs must continue using the guarded service-role client, not an authenticated one, or they would start exercising (and depending on) the currently-open `authenticated` grants |
| Marketing-site repo (`Modern Service System Website`) — `RequestService.tsx` | Public visitor | Marketing site's own `fetch()` to the CRM's public API route | POSTs JSON to `/api/v1/service-requests` | — | CRM-API-mediated, not a direct Supabase write | N/A (separate repo, no direct DB dependency) | None |
| Marketing-site repo — `portal-api.ts` | Portal user | Marketing site's own browser Supabase Auth client (`supabase.auth.*`) + CRM bridge endpoint | Auth session only; delegates all `customers`/`customer_accounts` writes to the CRM's `/api/v1/portal/link-account` | — | Bridge-mediated, not a direct table write | N/A | None |
| Marketing-site repo — `portal-dashboard-data.ts` | Portal user | Marketing site's own **anon-key** browser Supabase client | **Reads only** — `.from('customer_accounts')`, `.from('service_requests')`, `.from('customer_properties')` joined with `properties`, `.from('invoices')` joined with `jobs` | — | Relies entirely on RLS SELECT policies (`customer_select_own_*`), not app-layer filtering | Not verified by this audit's marketing-site check | N/A — read-only, not affected by an INSERT/UPDATE/DELETE grant revoke, but **directly depends on the correctness of the narrow SELECT policies staying intact** during any hardening (must not be broken by Batch CP-A/CP-B) |

**Write-site count**: 4 first-party app-reachable write paths (2 staff-authenticated, 2 anonymous/token-verified), all already using `createServiceClient()`. Zero direct-browser-write dependencies on `customers`/`properties`/`customer_properties`/`customer_accounts` — every write already goes through a service-role path. This mirrors the `service_requests`/`estimates` conclusion exactly: **revoking `authenticated`'s direct grants would break nothing in the application.**

---

## 6. Role/capability matrix

| | owner | admin | employee | subcontractor | viewer | customer (portal) | anonymous | cross-org authenticated |
|---|---|---|---|---|---|---|---|---|
| Create customer | ✅ (intended) | ✅ (intended) | ✅ (intended, unclear) | ❓ (unclear — no capability exists to say either way) | ❌ (intended) | — | — | ❌ |
| Edit customer contact info | ✅ | ✅ | ✅ | ❓ | ❌ | — | — | ❌ |
| Edit customer billing terms | ✅ | ✅ | ❓ | ❌ (presumed) | ❌ | — | — | ❌ |
| Archive/delete customer | ✅ | ✅ | ❌ (presumed) | ❌ | ❌ | — | — | ❌ |
| Create property | ✅ | ✅ | ✅ | ❓ | ❌ | — | — | ❌ |
| Edit property address/access info | ✅ | ✅ | ✅ | ❓ | ❌ | — | — | ❌ |
| Reassign property to another customer | ✅ | ✅ | ❓ | ❌ (presumed) | ❌ | — | — | ❌ |
| Delete property | ✅ | ✅ | ❌ (presumed) | ❌ | ❌ | — | — | ❌ |
| **Currently enforced (DB grants + RLS)** | full write | full write | full write | full write | **full write** | SELECT-own only | none | none (blocked by org_isolation's implicit fallback for direct writes; but see §7 for the `customer_properties`/`customer_accounts` gap) |

**Parity gap, identical in shape to the original `service_requests` finding**: `viewer` has zero write capability anywhere in the TypeScript model (confirmed — no customer/property capability exists at all, so *no* role is distinguished in the app layer beyond "signed in + org member"), yet has full database-level write access to all four tables. This is the single most severe authorization finding in this audit.

**A second, distinct gap**: because *no* capability exists for customers/properties at all (not even the coarse-grained kind `service_requests` originally lacked only for one action), the TypeScript layer cannot currently distinguish owner/admin from employee/subcontractor for customer/property actions even in the *trusted* server-action path — every signed-in org member can call `createCustomerAction`/`createPropertyForCustomerAction` today, regardless of role. Whether this is intentional (customers/properties are low-stakes, any staff member should be able to add one) or a gap depends on Kevin's product intent — recorded as a decision, not assumed (§15).

---

## 7. Relationship-integrity matrix

| Source table | Relationship | Current protection | Cross-org mismatch possible | Impact | Recommended enforcement |
|---|---|---|---|---|---|
| `customer_properties` | customer ↔ property (many-to-many) | **RLS only, and asymmetric** — `customer_properties_isolation` checks the customer's org, never the property's | **Yes — confirmed, not speculative.** An authenticated org-A member can INSERT a row linking an org-A customer to an org-B property's UUID | Data-integrity corruption today (a property appears linked to the wrong org's customer); becomes a genuine **read-exposure** vector if combined with the `customer_accounts` gap below | RLS `USING`/`WITH CHECK` validating both `customer_id`'s and `property_id`'s org match (once direct-write is otherwise closed, this is defense-in-depth against any future RPC that needs `authenticated`-level checks); no composite FK is possible without adding a redundant `org_id` column to the junction table (assessed as unnecessary — RLS-level enforcement is sufficient once writes are trusted-only) |
| `customer_accounts` | customer ↔ portal auth user | **RLS only, and asymmetric** — `internal_org_customer_accounts` checks only the row's own `org_id`, never that `customer_id` actually belongs to that `org_id` | **Yes — confirmed.** An org-A member can INSERT a `customer_accounts` row with `org_id = org_A`, `customer_id = <org_B customer>`, `auth_user_id = <any auth uid, including their own>` | **High** — combined with `customer_select_own_account`/`customer_select_own_customer`/`customer_select_own_customer_properties` (all of which join only on `customer_id`, never re-verify org), this is a path to read another organization's customer, property, and (via `portal-dashboard-data.ts`'s invoice query) financial data | RLS `WITH CHECK` on `customer_accounts` requiring the referenced customer's `org_id` to equal the row's own `org_id`, in addition to closing direct `authenticated` writes |
| `service_requests.customer_id` / `.property_id` | request → customer/property | FK only (`RESTRICT` on delete, no org-consistency check) — **pre-existing, already-documented gap (SR-1/SR-2 from the prior audit)**, unchanged by this audit | Yes (already known, out of scope for both this and the prior patch) | Data-integrity corruption; RLS on `service_requests` itself is correctly org-scoped for reads, so this is not a new read-exposure path, just an existing recorded gap | Unchanged recommendation from the prior audit — out of scope here |
| `estimates.customer_id` / `.property_id` | estimate → customer/property | FK only, `NO ACTION` (practically equivalent to `RESTRICT`), no org-consistency check | Yes (same class as above, not previously called out by table name but structurally identical) | Same as above | Out of scope for this batch; recorded for completeness |
| `jobs.customer_id` / `.property_id` | job → customer/property | FK only, `NO ACTION`, no org-consistency check | Yes | Same as above — also touches financial workflows (jobs → invoices), slightly higher stakes than requests/estimates alone, but still requires an already-compromised or malicious org member to exploit, and doesn't expose cross-org visibility (jobs RLS is correctly org-scoped for reads) | Out of scope for this batch; flagged as the highest-priority item in a future FK-consistency follow-up if one is ever authorized |
| `quote_line_items.property_id` | quote line item → property | FK only, `NO ACTION`, no org-consistency check | Yes | Low — line-item-level, not customer-facing | Out of scope |
| `communications.customer_id` / `.property_id`, `tasks.customer_id` / `.property_id`, `vault_items.customer_id` / `.property_id`, `user_prompts.customer_id` | various → customer/property | FK only, `NO ACTION`, no org-consistency check | Yes | Low — internal/ancillary records, not independently exploitable beyond what's already possible by directly writing `customers`/`properties`/`customer_properties` | Out of scope |
| `customer_properties`/`customer_accounts`/`customer_location_prefs` → `customers` | cascade on customer delete | `ON DELETE CASCADE` | N/A | Deleting a genuinely orphaned customer (see §9) cleanly cascades its links/portal-account/prefs — reasonable, not a gap | none needed |
| `geofences` → `properties` | cascade on property delete | `ON DELETE CASCADE` | N/A | Same reasoning, ancillary auto-generated data | none needed |

**Deletion is meaningfully constrained today, independent of the grant issue**: `service_requests.customer_id`/`.property_id` use `RESTRICT`, and most other FKs use `NO ACTION` (which behaves the same as `RESTRICT` for a non-deferred constraint) — meaning a customer or property with **any** live downstream record (a request, estimate, job, communication, task, vault item, etc.) **cannot actually be deleted**, even though the `authenticated` DELETE grant is open. The real exposure is narrower than "any customer can be deleted": it is "a customer or property with **zero** downstream records can be deleted by any org member, including `viewer`." This is still a confirmed weakness (recorded in §10), but it is not the "arbitrary destruction of live business data" that the raw grant might suggest — severity is scoped accordingly in §9, per the explicit instruction not to exaggerate findings solely because grants are broad.

**RLS visibility is not equivalent to relationship integrity, per instruction**: SELECT on `customers`/`properties`/`estimates`/`jobs`/etc. is correctly org-scoped in every case checked — the relationship-integrity gap does not, by itself, let one org read another org's *primary* records. The one place it **does** create a read-exposure path is specifically through `customer_accounts` (§ above), because that table's own SELECT policies key off `customer_id` alone.

---

## 8. Public/portal/import assessment

| Path | Classification | Notes |
|---|---|---|
| Public PPM request intake (`createServiceRequest`, `/api/v1/service-requests`) | Trusted service-role | Anonymous, rate-limited, hardcoded org, dedupe is org-scoped (by email/phone for customers, by org+zip+address for properties) |
| Portal signup (`ensureCustomerAccount`) | Trusted service-role | Identity from a completed Supabase Auth signup; org hardcoded |
| Portal link-account bridge (`/api/v1/portal/link-account`) | Trusted service-role | Bearer-token-verified identity; org hardcoded; rate-limited |
| Marketing-site portal dashboard reads (`portal-dashboard-data.ts`) | Direct authenticated (anon-key) read, **not** a write path | Relies entirely on RLS; must remain correctly scoped through any hardening — verified in this audit that the relevant SELECT policies (`customer_select_own_*`) key correctly on `customer_id`, **except** `customer_accounts`'s own row-creation gap (§7), which is the actual exposure, not this read path itself |
| Jobber import (`scripts/import-jobber-export.mjs`) | Test-only / offline-tool, service-role | Not HTTP-reachable; org_id and dedupe logic not deeply re-verified in this pass (out of scope — it's not a live authorization boundary) |
| Address-dedupe cleanup (`scripts/dedupe-properties-by-address.mjs`) | Offline-tool, service-role | `--execute`-gated, dry-run by default |
| E2E fixture creation/cleanup | Test-only, service-role | Confirmed no spec uses an `authenticated`-role client for direct writes to these tables |
| Demo population | Not separately re-audited in this pass — prior session history establishes Demo customers/properties were created via the same `createCustomer`/`createPropertyForCustomer` service-role path, not a separate mechanism |

**Duplicate-prevention reliability**: customer dedupe in the public-intake path is by email then normalized phone, scoped by `org_id` (hardcoded, so effectively always PPM in the only path anonymous users reach); property dedupe is by `org_id` + zip + normalized address fields. Both are org-scoped correctly. **Public users cannot attach a request to an arbitrary existing customer/property** — the intake path only creates-or-matches within its own hardcoded org, never accepts a customer/property ID as input.

**Email-matching risk**: the public intake and portal-linking paths both match by email within an org. This is standard, intentional dedupe behavior (not a new finding) — if two different real people share an email, they'd be merged, but this is a pre-existing product-design property, not introduced or affected by this audit's findings, and is explicitly out of scope for a customer/property *authorization* audit.

---

## 9. Deletion and archival assessment

- **DELETE is not exposed in the UI** for either `customers` or `properties` — confirmed via repository search, no delete button, no delete server action exists for either table.
- **DELETE is not used by any server action** — confirmed absent from `packages/db/queries/customers.ts` and `properties.ts`.
- **DELETE is currently only reachable via**: (a) direct authenticated REST (the vulnerability), (b) the offline `dedupe-properties-by-address.mjs` script (properties only, service-role, `--execute`-gated), (c) test cleanup (service-role).
- **DELETE is meaningfully FK-restricted already** (see §7) — a customer/property with any live downstream record cannot be deleted regardless of grants. Only genuinely orphaned rows are deletable.
- **No archive action exists for either table.** `customers.is_archived` exists as a column and is respected by exactly one read filter (the estimate-creation customer picker) but is never *set* anywhere in the application — an unfinished/stub feature, not a security concern in itself, but worth flagging as a product gap. `properties` has no archive column at all.
- **No merge-customer action exists.** No reassign-property-to-another-customer UI action was found (property-to-customer linking only happens at property-creation time via `createPropertyForCustomerAction`; there is no "move this property to a different customer" action in the current product).
- **No GDPR/privacy-deletion path exists** for customer data specifically (out of scope to design one here).

**Recommendation for future production behavior** (not implemented, Kevin decision candidate, §15): **no hard delete** for `customers`/`properties` via any authenticated-reachable path — matches the precedent already set for `service_requests`/`estimates`/`site_visits`/`jobs`/`quotes` in the prior two hardening batches. If archival is wanted as a real feature, it should be built deliberately (an `archiveCustomerAction` with a capability gate), not inherited from the currently-unused `is_archived` column.

---

## 10. Confirmed findings

| ID | Observed behavior | Expected behavior | Evidence | Affected roles | Impact | Severity | Confidence | Proposed regression test | Release classification |
|---|---|---|---|---|---|---|---|---|---|
| CP-1 | `customers`/`properties` have full `authenticated` INSERT/UPDATE/DELETE grants + a broad `FOR ALL` org-membership-only RLS policy with no `WITH CHECK` | Only service-role/trusted paths should write; any signed-in org member, including `viewer`, can currently write directly | Direct grant/policy inspection on both `premier-crm-e2e` and `premier-crm-prod`, confirmed no drift | owner, admin, employee, subcontractor, viewer | Tampering with contact info, billing terms, denormalized fields, archive state; deletion of orphaned rows | High | Confirmed | `authorization-customers-properties-bot.spec.ts` items 1-9, 11-19 (see §11) | Forge V1.0.2 normal security patch |
| CP-2 | `customer_properties_isolation` validates only the customer side of the link, never the property side | Both sides of a cross-table relationship should be org-verified before permitting a write | Direct policy-text inspection (deductively certain, no exploit executed) | owner, admin, employee, subcontractor, viewer | Cross-org customer↔property linking possible today; primarily an integrity risk on its own, but compounds with CP-3 | **High** | Confirmed | `authorization-customers-properties-bot.spec.ts` items 21-24 | Forge V1.0.2 normal security patch |
| CP-3 | `internal_org_customer_accounts` validates only the row's own `org_id`, never that `customer_id` belongs to that org; combined with `customer_select_own_*` policies keying only on `customer_id` | Portal-account creation should verify the linked customer actually belongs to the account's org | Direct policy-text inspection across `customer_accounts`, `customers`, `properties`, `customer_properties` SELECT policies | owner, admin, employee, subcontractor, viewer (as the attacker, via direct REST) | **Cross-tenant data exposure** — a malicious/compromised org member could grant portal-style read access to another organization's customer, property, and invoice data | **High** | Confirmed | New test: attempt `customer_accounts` INSERT with mismatched org/customer, verify denied; verify no cross-org read is possible through the portal-scoped SELECT policies afterward | Forge V1.0.2 normal security patch (bundled with CP-2, same root cause and fix shape) |
| CP-4 | No capability (`canCreateCustomer`, `canEditCustomer`, etc.) exists anywhere in `packages/shared/permissions.ts` for customers/properties | Some product decision should exist about which roles may create/edit customers and properties, even at the trusted server-action layer | Direct grep of `permissions.ts`, confirmed zero matches | employee, subcontractor (uncertain intended access) | Currently every signed-in org member can create/edit customers and properties through the *trusted* path too — may be intentional (low-stakes action) or a genuine gap | Low-Medium (this is a product-policy gap, not a live security bypass, since the trusted path is already service-role and org-scoped correctly) | Confirmed (as a fact); severity of the *policy* question is Kevin's call | Unit test enforcing whatever capability model Kevin approves | Kevin decision required before classification (§15) |
| CP-5 | `total_jobs`, `total_revenue`, and other denormalized fields are directly writable by any org member with no application code ever writing them | System-computed fields should never be authenticated-writable | Field-by-field write-path search, confirmed no writer exists in application code | owner, admin, employee, subcontractor, viewer | Low — reporting/dashboard distortion only, no financial-transaction impact | Low | Confirmed | Covered by the general CP-1 direct-write regression tests (no separate test needed) | Bundled into Forge V1.0.2 (Batch CP-A) |
| CP-6 | `customers.is_archived` exists and is read-filtered in one place, but no write path ever sets it | An archive feature implied by the schema doesn't functionally exist | Repository search, confirmed | N/A (product gap, not an authorization finding) | Informational | Informational | N/A | N/A | No change required as part of this patch — recorded for Kevin's awareness only |
| CP-7 | `customer_properties`, `customer_accounts`, most FKs to `customers`/`properties` from downstream tables (`estimates`, `jobs`, `quote_line_items`, `communications`, `tasks`, `vault_items`, etc.) have no org-consistency enforcement beyond the already-known SR-1/SR-2 pattern | Same class of gap as the prior audit's SR-1/SR-2, now confirmed to extend structurally to essentially every table referencing customers/properties | FK inventory query against `premier-crm-prod` | N/A (structural, not role-specific) | Data-integrity corruption; does not independently create a read-exposure path (each downstream table's own RLS remains correctly org-scoped) | Low (informational/backlog) | Confirmed | N/A — out of scope for this batch | Defense-in-depth backlog, unchanged classification from the original SR-1/SR-2 finding |

---

## 11. Adversarial test plan (proposed — not created)

Proposed filename: `tests/e2e/authorization-customers-properties-bot.spec.ts`

| # | Test | Expected current result | Expected hardened result | Fixture requirements | Cleanup | Parallel-safety | Persistent role account needed | Layer |
|---|---|---|---|---|---|---|---|---|
| 1 | Same-org INSERT `customers` (employee) | Succeeds (bug) | `42501` denied | org fixture, employee account | service-role delete | Yes, disposable org | No — created per-test | E2E |
| 2 | Cross-org INSERT `customers` | Succeeds (bug) | Denied | two orgs | service-role delete | Yes | No | E2E |
| 3 | UPDATE name/contact info (employee) | Succeeds (bug) | Denied | one customer row | rollback via service-role re-read/no mutation expected | Yes | No | E2E |
| 4 | UPDATE `org_id` | Succeeds (bug) | Denied | one customer row, two orgs | as above | Yes | No | E2E |
| 5 | UPDATE portal linkage (via `customer_accounts`, not a `customers` column — test the `customer_accounts` row directly) | Succeeds (bug) | Denied | customer + customer_accounts fixture | as above | Yes | No | E2E |
| 6 | UPDATE billing/status fields (`payment_terms_days`, `is_archived`) | Succeeds (bug) | Denied | one customer row | as above | Yes | No | E2E |
| 7 | DELETE (orphaned customer, zero dependents) | Succeeds (bug) | Denied | disposable customer with zero downstream records | service-role verify still exists | Yes | No | E2E |
| 8 | Cross-org UPDATE | Succeeds (bug) | Denied | two orgs | as above | Yes | No | E2E |
| 9 | Cross-org DELETE | Succeeds (bug) | Denied | two orgs | as above | Yes | No | E2E |
| 10 | Create duplicate/conflicting customer identity via direct INSERT (bypassing `createServiceRequest`'s dedupe) | Succeeds (bug — no dedupe exists at the DB layer, only in application code) | Denied (moot once INSERT is closed — dedupe is an application-layer concern, this test documents that the DB layer never enforced it) | org fixture | service-role delete | Yes | No | E2E |
| 11 | Same-org INSERT `properties` | Succeeds (bug) | Denied | org fixture | service-role delete | Yes | No | E2E |
| 12 | Cross-org INSERT `properties` | Succeeds (bug) | Denied | two orgs | as above | Yes | No | E2E |
| 13 | UPDATE address/access fields (`gate_code`, `access_notes`) | Succeeds (bug) | Denied | one property row | as above | Yes | No | E2E |
| 14 | UPDATE `org_id` | Succeeds (bug) | Denied | one property row, two orgs | as above | Yes | No | E2E |
| 15 | Reassign customer↔property link within same org (INSERT into `customer_properties`) | Succeeds (currently correct behavior, since it's same-org) | Should still succeed if routed through a trusted path, or denied if direct-REST is fully closed — **Kevin decision**: is same-org direct linking ever legitimate to leave open, or does it also route through service-role only? | two customers, one property, same org | service-role delete | Yes | No | E2E |
| 16 | **Reassign customer↔property link across orgs (INSERT into `customer_properties` linking an org-A customer to an org-B property)** — the CP-2 finding | **Succeeds today (confirmed vulnerability)** | Denied | customer in org A, property in org B | service-role delete | Yes | No | E2E — highest-priority test in this suite |
| 17 | DELETE `properties` (orphaned) | Succeeds (bug) | Denied | disposable property with zero downstream records | service-role verify | Yes | No | E2E |
| 18 | Cross-org UPDATE `properties` | Succeeds (bug) | Denied | two orgs | as above | Yes | No | E2E |
| 19 | Cross-org DELETE `properties` | Succeeds (bug) | Denied | two orgs | as above | Yes | No | E2E |
| 20 | Create `customer_properties` row with mismatched org/customer relationship (same as #16, phrased as the schema-level attempt) | Succeeds (bug) | Denied | as #16 | as above | Yes | No | E2E |
| 21 | Link a `service_requests` row to a cross-org customer | Already denied at the `service_requests` INSERT boundary (post-V1.0.1) — this test documents that the *upstream* customer/property hardening doesn't change this pre-existing, already-correct denial | Unchanged | request fixture, cross-org customer | as above | Yes | No | E2E (documentation test, not a new boundary) |
| 22 | Link a `service_requests` row to a cross-org property | Same as #21 | Unchanged | as above | as above | Yes | No | E2E |
| 23 | **`customer_accounts` INSERT with `org_id` = caller's org but `customer_id` from a different org** — the CP-3 finding | **Succeeds today (confirmed vulnerability)** | Denied | two orgs, one customer in org B | service-role delete | Yes | No | E2E — second-highest-priority test |
| 24 | After #23 is denied, verify no cross-org read is achievable via `customer_select_own_customer`/`customer_select_own_properties`/`customer_select_own_customer_properties` even with a legitimately-created same-org `customer_accounts` row | N/A (test proves the read side stays correctly scoped once the write side is closed) | Passes | one legitimate customer_accounts row | as above | Yes | No | E2E |
| 25 | Verify denied attempts (all of the above) create no side effects — no rows, no `activity_log` entries | N/A until hardening | Passes | combined with the above | N/A | Yes | No | E2E |
| 26 | Verify audit/activity history remains unchanged after denied attempts | N/A until hardening | Passes | as above | N/A | Yes | No | E2E |
| 27 | Verify legitimate same-org SELECT continues to work after hardening | N/A | Passes | one customer/property | N/A | Yes | No | E2E |
| 28 | Verify cross-org SELECT remains denied (RLS-filtered, not an error) | Already correctly denied today | Unchanged | two orgs | N/A | Yes | No | E2E |
| 29 | Verify public intake (`createServiceRequest`) still works end-to-end after hardening | N/A until hardening | Passes | none (uses the public route) | service-role cleanup | Yes | No | E2E — reuses `customer-intake-bot.spec.ts` patterns |
| 30 | Verify `createCustomerAction`/`createPropertyForCustomerAction` still work end-to-end after hardening | N/A until hardening | Passes | staff account | service-role cleanup | Yes | No | E2E |

**Action/unit-layer coverage** (separate from the E2E suite above, mirroring the `markRequestReviewedAction` precedent): if Kevin approves a capability gate for `createCustomerAction`/`createPropertyForCustomerAction` (§15), add direct action-layer tests analogous to `apps/web/app/(app)/requests/actions.test.ts`'s pattern — mocked context, no live DB, proving denial occurs before any service-role call.

---

## 12. Hardening-option comparison

| | Option A (revoke + narrow SELECT policy) | Option B (limited authenticated write + strict WITH CHECK) | Option C (purpose-specific RPCs) | Option D (A + cross-org constraint/trigger) | Option E (split sensitive vs. common fields) |
|---|---|---|---|---|---|
| Security strength | High — matches the proven, already-shipped pattern | Medium — still exposes a REST-reachable write surface, just narrower | High, but architecturally heavier | Highest — closes both the direct-write and relationship gaps | Medium — doesn't address the relationship-integrity gap at all |
| Compatibility risk | Low — zero legitimate authenticated-client dependency found (§5) | Medium — `WITH CHECK` expressions are easy to get subtly wrong | Medium — requires rewriting two server actions to call RPCs instead of direct queries | Low (same as A, plus one policy-text change) | Low, but leaves CP-2/CP-3 open |
| Migration scope | One migration, same shape as the last two | One migration, more complex `WITH CHECK` logic | One migration + RPC definitions | One migration (A) + a second small migration for the `customer_properties`/`customer_accounts` policy fix | One migration, narrower |
| Application-code scope | None (already service-role) | None | Two server actions rewritten to call RPCs | None | None for the split itself, but doesn't fix the actual vulnerability |
| Public-site impact | None (public intake already service-role) | None | None | None | None |
| Portal impact | None if narrow SELECT policies are preserved exactly (verified in §8) | Same | Same | Same | Same |
| Import/E2E impact | None (already service-role/service-role) | None | None | None | None |
| Rollback complexity | Low — mirrors two prior successful rollbacks | Low-Medium | Medium | Low | Low |
| Long-term maintainability | High — consistent with the established Forge trusted-write model | Medium — a second, different pattern to maintain | Medium-High — more moving parts than needed for a repo with 4 total write sites | High | Low — leaves a known gap |
| Consistency with established Forge model | **Exact match** | Diverges | Diverges (heavier than needed given only 4 write sites exist) | **Exact match, extended correctly** | Diverges (incomplete) |

**Recommendation: Option D — Option A's revoke/narrow-policy pattern for `customers`/`properties` (Batch CP-A), plus a targeted RLS fix on `customer_properties`/`customer_accounts` closing the asymmetric org-check (Batch CP-B).** This is the smallest option that closes both confirmed direct-write bypasses, prevents the cross-org customer/property/portal-account mismatch, preserves every legitimate staff/public/portal workflow (zero application-code changes required, as established in §5/§8), and stays fully consistent with the trusted-write architecture already proven twice in this codebase. Option C (purpose-specific RPCs) is explicitly not recommended — with only 4 total write sites, all already service-role, introducing RPCs would add architecture without closing any gap that Option A/D doesn't already close.

**Staged, not bundled**: per instruction, CP-A (direct-write revoke) and CP-B (relationship-integrity RLS fix) are proposed as two separate migrations within the same overall patch, not one combined migration — CP-A is a pure copy of an already-proven pattern with essentially zero risk; CP-B touches live junction-table policy logic and deserves to be independently reviewable and independently revertible if something unexpected surfaces.

---

## 13. Recommended implementation batches

### Batch CP-A — Direct-write authorization boundary
- **Finding IDs**: CP-1, CP-5
- **Migration scope**: `REVOKE INSERT, UPDATE, DELETE ON customers, properties FROM authenticated`; replace `org_isolation_customers`/`org_isolation_properties` (`FOR ALL`) with `*_select_org_members` (`FOR SELECT`); preserve `customer_select_own_customer`/`customer_select_own_properties` untouched.
- **Application changes**: none required (zero legitimate dependency, confirmed in §5).
- **Tests**: adversarial suite items 1-4, 6-9, 11-14, 17-19, 27, 29, 30 (§11).
- **Dependencies**: none — independent of CP-B, can ship first.
- **Production risk**: Low — identical shape to the already-shipped `service_requests`/`estimates`/`jobs`/`quotes` patches.
- **Rollback plan**: re-`GRANT`/recreate the `FOR ALL` policy (same rollback shape as the two prior patches; not expected to be needed).
- **Recommended release version**: Forge V1.0.2.

### Batch CP-B — Cross-org relationship consistency
- **Finding IDs**: CP-2, CP-3
- **Migration scope**: rewrite `customer_properties_isolation`'s `USING`/`WITH CHECK` to also verify `property_id`'s org matches the caller's org (via a join to `properties`, mirroring the existing join to `customers`); rewrite `internal_org_customer_accounts` to also verify the referenced `customer_id` belongs to the row's own `org_id`. Both become effectively moot for `authenticated` once CP-A-style direct-write revocation is applied to `customer_properties`/`customer_accounts` too (recommended in the same migration, extending CP-A's pattern to these two tables as well, since they were found to share the identical direct-write exposure) — but the corrected `USING` logic remains valuable as defense-in-depth and for any `service_role`/future-RPC context that might still rely on RLS.
- **Application changes**: none required — `createPropertyForCustomer()` already links within a single, already-org-verified customer, so the corrected policy doesn't affect any legitimate write.
- **Tests**: adversarial suite items 15, 16, 20-24 (§11) — item 16 and 23 are the two highest-priority regression tests in the entire suite.
- **Dependencies**: logically follows CP-A (both close writes on the same tables), but is a separate migration for independent reviewability.
- **Production risk**: Low-Medium — touches a junction table with live Demo data (2 customers, linked properties); must verify Demo's existing legitimate links remain intact after the policy rewrite (a pure `SELECT`/policy-logic change, not a data rewrite, so existing rows are unaffected either way).
- **Rollback plan**: revert to the prior `USING` expression; no data migration involved, so rollback is a pure policy-text revert.
- **Recommended release version**: Forge V1.0.2 (same patch as CP-A).

### Batch CP-C — Deletion/archive/merge policy
- **Finding IDs**: none confirmed as vulnerabilities (CP-6 is informational) — this batch is **not currently justified** as a security fix. It exists in this document only to record that DELETE is already meaningfully FK-restricted (§9) and that no archive/merge feature exists.
- **Recommendation**: no migration needed for security reasons. If Kevin wants a real archive feature built, that's a product feature request, not an authorization-hardening batch — track separately.

### Batch CP-D — Adjacent-table hardening
- **Finding IDs**: none beyond what CP-B already covers (`customer_accounts` is included in CP-B, not a separate batch, since it shares CP-B's exact root cause and fix shape).
- **`customer_archetype_defaults`**: already secure / not applicable — org-agnostic static reference table, no `org_id`, no `customer_id`, no cross-tenant exposure possible. F6 is not implicated by any finding in this audit and is not being referenced or implemented here.
- **`customer_location_prefs`**: separate follow-up, not required in this batch — no write path was found for it in this audit's search (flagged as unresolved, not confirmed-safe, in §5's adjacency notes); recommend a narrow follow-up check before Forge V1.1, not blocking this patch.
- **`geofences`, `vault_items`**: already secure for this audit's purposes — `geofences` cascades correctly and has no independent write path found; `vault_items` is out of scope (a large, already-partially-audited table via the request/estimate/site-visit work) and not directly coupled to the customer/property *authorization* boundary specifically.

---

## 14. Explicit exclusions

This audit and its proposed batches do **not** include:

- Base44 (not started, not referenced beyond confirming it remains unstarted)
- F2/F4/F7 (not addressed)
- Any unrelated table hardening beyond `customers`/`properties`/`customer_properties`/`customer_accounts`
- `jobs`/`quotes` changes (already complete, Batch A)
- `service_requests`/`estimates`/`site_visits` policy changes (already complete, Forge V1.0.1)
- Repository renaming
- Foundry marketing changes
- PPM data modifications
- Release-tag changes (`forge-v1.0.0` and `forge-v1.0.1` are both unaffected and untouched by this document)
- `customer_location_prefs` hardening (flagged as a separate follow-up, not bundled)
- Any new archive/merge/delete *feature* (Batch CP-C explicitly recommends against building one as part of a security patch)

---

## 15. Kevin decisions

1. **Which staff roles may create customers and properties?** Currently every signed-in org member can (no capability exists at all). Should this stay "any staff member" (matching the current de facto behavior, formalized), or should it require a specific capability (e.g. excluding `subcontractor`)?
2. **Which roles may edit customer billing terms specifically** (`standing_approval_threshold`, `payment_terms_days`, `consolidate_invoices_monthly`)? These are more sensitive than contact-info fields — should they require `owner`/`admin` only, distinct from general customer editing?
3. **May employees reassign a property to a different customer, or link a property to an additional customer, once same-org relationship-integrity is enforced (Batch CP-B)?** No such action exists in the product today — this is a forward-looking policy question, not a fix for existing behavior.
4. **Should `customers`/`properties` ever be genuinely hard-deletable**, or should deletion always mean `is_archived = true` (once an archive feature actually exists)? This audit recommends fully revoking DELETE, matching the precedent set by every prior hardening batch, unless Kevin wants a deliberately-gated future delete feature.
5. **Does the `customer_properties`/`customer_accounts` cross-org fix (Batch CP-B) ship together with Batch CP-A, or does Kevin want it staged separately given it's a new class of finding (not a straight repeat of the already-approved pattern)?** This audit recommends shipping both together as Forge V1.0.2, since they share highly related root causes and the fix is small, but flags this as a genuine sequencing decision, not a technical detail.
6. **Is the currently-unused `is_archived` column on `customers` intended to become a real feature soon**, or should it be left as-is (unused, informational-only) for now? Not a security decision, but relevant to whether Batch CP-C should ever be revisited.

---

## Stopping point (original audit)

Per instruction, this audit stops here. No migration was created, no grants or RLS policies were modified, no test files were added, no application code was changed, the marketing site was not touched, nothing was deployed, no production data was modified, Base44 was not started, F2/F4/F7 were not addressed, and `forge-v1.0.0`/`forge-v1.0.1` were not moved.

Waiting for explicit approval before implementing `customers`/`properties`/`customer_properties`/`customer_accounts` authorization hardening.

---

## 16. Implementation addendum (Forge V1.0.2, Batches CP-A/CP-B)

Approval was given; this section records what was actually implemented, on which environment, and how a pre-existing E2E migration-bookkeeping drift (unrelated to this audit) was handled safely without being "fixed" as part of this patch.

### Migrations

- `20260804000000_harden_customers_and_properties.sql` (**CP-A**) — revokes `authenticated` INSERT/UPDATE/DELETE on `customers`/`properties`; replaces `org_isolation_customers`/`org_isolation_properties` (`FOR ALL`) with `customers_select_org_members`/`properties_select_org_members` (`FOR SELECT`, org-membership only). Portal SELECT policies untouched.
- `20260804000001_harden_customer_properties_and_accounts.sql` (**CP-B**) — revokes `authenticated` INSERT/UPDATE/DELETE on `customer_properties`/`customer_accounts`; replaces `customer_properties_isolation`/`internal_org_customer_accounts` with SELECT-only policies whose `USING` clause validates **both** sides of the relationship (customer's org and property's org for the junction table; account's org and the linked customer's actual org for `customer_accounts`).
- `20260804000002_fix_customer_properties_accounts_policy_recursion.sql` — a same-session bug fix. The first CP-B policies queried `customers`/`properties` directly inside their `USING` clauses, which created a genuine RLS policy cycle (`customers` ↔ `customer_accounts` via the pre-existing `customer_select_own_customer` policy, and `customer_properties` ↔ `properties` via the pre-existing `customer_select_own_properties` policy), raising Postgres error `42P17 infinite recursion detected in policy`. Caught immediately by `authorization-customers-properties-bot.spec.ts` before this ever reached any shared or production environment. Fixed by adding two `STABLE SECURITY DEFINER` helper functions (`customer_org_id()`, `property_org_id()`), matching the codebase's existing `user_is_in_org()` pattern, so the cross-table org lookup bypasses RLS on the underlying table and never re-enters the caller's own policy evaluation.

### Pre-existing E2E migration-bookkeeping drift (found during recovery, not caused by this work)

Before any CP-A/CP-B work began, `premier-crm-e2e` (`slbnizoskumwhleeiccv`) was found to have 27 migrations (`20260802010000` through `20260803080000` by local filename) recorded in `supabase_migrations.schema_migrations` under **different version timestamps** than their local files (e.g. local `20260802020400_customer_safe_site_visit_summary.sql` was recorded remotely as version `20260802164632`, same migration name, different version number). This is bookkeeping-only: direct schema inspection confirmed the live E2E schema already contains the full effect of every one of those 27 migrations (`site_visits`, `inspection_templates`, `role_has_capability()`/`capability_matrix`, `_apply_triage_decision()` all present; `service_requests`'s `authenticated` INSERT grant already revoked). `premier-crm-prod` (`apnbpcauqrjvkoleisde`) has **no such drift** — every local migration file's version matches its recorded production version exactly.

Because the CLI's `supabase migration list`/`db push` compares purely by version number (not name or content), a normal `supabase db push --linked` against E2E right now would attempt to re-run all 27 of those already-effectively-applied migrations under their local version numbers — unsafe (would error on already-existing objects or silently duplicate schema effects). This drift **predates** CP-A/CP-B, was not introduced or worsened by this work, and was **not reconciled, repaired, renamed, or otherwise touched** as part of this patch — reconciling it is out of scope here and should be a separate, deliberate follow-up if ever undertaken.

**How CP-A/CP-B were applied safely instead**: each migration's exact SQL content was executed directly against E2E (bypassing `db push` entirely, so the diverged 27-migration range was never touched), verified via direct grant/policy/data inspection after each step, then recorded as a normal, purely additive new row in `supabase_migrations.schema_migrations` (version + name matching the local file exactly, `statements` array holding the executed SQL, `created_by` matching the pattern of every other row in the table). No existing row was read-modified, renamed, or deleted; migration-row count went from 73 → 74 (CP-A) → 75 (CP-B) → 76 (recursion fix), each step confirmed as exactly `+1`.

### Pre-flight relationship-integrity check (before CP-B)

Queried E2E directly for any pre-existing cross-org mismatch before applying CP-B's stricter policies: zero mismatches found across all 64 `customer_properties` rows and the 1 `customer_accounts` row present. CP-B's policy rewrite is a pure grant/policy-logic change — no data was rewritten, and none needed to be.

### Tests

`tests/e2e/authorization-customers-properties-bot.spec.ts` — 30 tests, all passing against `premier-crm-e2e`, covering: CP-1/CP-5 direct-write denial (customers/properties INSERT/UPDATE/DELETE, same-org and cross-org, across employee/subcontractor/viewer/owner/admin), CP-2 (`customer_properties` same-org and both directions of cross-org linking denied), CP-3 (`customer_accounts` cross-org account forgery denied, same-org direct-write also denied), no-side-effects verification, legitimate same-org SELECT retention, cross-org SELECT correctly RLS-filtered (not an error), and a live signed-in-portal-account regression proving the CP-3 fix doesn't leak cross-org customer/property data through the narrow `customer_select_own_*` policies.

Regression run: `pnpm test` 187/187, `pnpm typecheck` clean across all packages, `pnpm build` clean. Adjacent E2E suites (`customer-crud-bot`, `customer-command-center-bot`, `customer-intake-bot`, `operator-workflow-bot`) — 2 failures observed when run together under 4 parallel workers (a rate-limit-timing test and an operator-workflow customer-search-picker timeout), both confirmed as parallel-worker races by clean isolated re-runs (`--workers=1`), not caused by this patch — matching the same class of pre-existing locator-timing flake already documented for `employee-estimate-workflow-bot.spec.ts` in the Forge V1.0.1 verification record.

### Local dev-server safety note

While preparing to run the Playwright suite, `apps/web/.env.local` was found pointed at **production** (`apnbpcauqrjvkoleisde`) rather than E2E — the exact near-miss scenario `/api/e2e-health` exists to catch (it correctly refused to answer, blocking the whole Playwright run via `global-setup.ts`). `apps/web/.env.local` was **not modified**; the dev server was instead started with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` overridden at the shell level (Next.js gives process-level env vars precedence over `.env.local`), confirmed via `/api/e2e-health` reporting `slbnizoskumwhleeiccv` before any test ran.

### Production rollout plan (not executed — E2E only per this patch's authorized scope)

1. Confirm `premier-crm-prod`'s migration history is still fully synchronized (no drift, unlike E2E) immediately before rollout.
2. Dry-run `supabase db push --linked` against `premier-crm-prod` with only `20260804000000`, `20260804000001`, and `20260804000002` pending — production has none of the E2E bookkeeping drift, so a normal dry-run/push is expected to be safe and match exactly the two prior hardening batches' rollout shape.
3. Apply via `supabase db push --linked`.
4. Verify grants/policies directly (mirroring the verification queries used on E2E in this session).
5. Re-run the same pre-flight cross-org relationship check against production's live `customer_properties`/`customer_accounts` data before/after, given production holds real (though currently limited: PPM blank, Demo controlled) data.
6. Re-run `pnpm test`, `pnpm typecheck`, `pnpm build`, and the new adversarial suite's applicable non-mutating checks against production read paths only, matching the Forge V1.0.1 production-verification precedent.

**Not done in this session, per authorized scope**: no production migration, no merge of the implementation PR, no `forge-v1.0.2` tag, no Base44 work, `customer_location_prefs`/F2/F4/F6/F7 untouched.

---

## 17. Production verification (2026-08-04)

Implementation PR #101 was reviewed, merged, deployed, and its three migrations applied to `premier-crm-prod` in this session. This section records that rollout.

### Merge and deployment

- **PR #101**: squash-merged to `main` at commit `fba6b7e` (2026-08-04T01:12:13Z). Diff re-verified before merge: exactly the six expected files (three migrations, one new E2E spec, the §16 addendum, `SESSION_STATE.md`) — no application code, no config, no scratch/generated files, no `.env` files. `forge-v1.0.0`/`forge-v1.0.1` unchanged; no overlapping PR or migration on `main`; Base44 not started.
- **Helper-function pre-merge review**: `customer_org_id(uuid)`/`property_org_id(uuid)` — `STABLE SECURITY DEFINER`, `search_path` explicitly set to `public` (matching `user_is_in_org()`'s pattern), owned by `postgres`, `EXECUTE` granted to `PUBLIC` by Postgres's own default (same default as `user_is_in_org()`, not a broadening introduced by this migration — necessary for `authenticated` to evaluate the RLS policies that call them). Verified empirically: nonexistent/NULL customer or property IDs resolve to `NULL` org, and `user_is_in_org(NULL)` returns `false` — fail-closed, never fail-open.
- **Vercel deployment**: `dpl_5dRrqLCUGvrYnZkL7nXM7UTkDvCq`, target `production`, `READY` at `2026-08-04T01:13:15Z` (buildingAt → ready), aliased to `app.ppmnky.com`, serving `fba6b7e` exactly (confirmed via deployment metadata `githubCommitSha`). `app.ppmnky.com` responsive (307, expected auth redirect) before any migration was applied.

### Migrations applied to `premier-crm-prod`

Unlike E2E, `premier-crm-prod` had **zero migration drift** going into this rollout — every local file's version matched its recorded remote version exactly. This meant the normal workflow (`npx supabase db push --linked`) was safe to use directly, unlike the additive-raw-SQL method required for E2E.

1. Linked CLI explicitly to `apnbpcauqrjvkoleisde` (`premier-crm-prod`) — confirmed via `project-ref` file read back before any command.
2. `npx supabase db push --linked --dry-run` → confirmed exactly the three intended migrations pending (`20260804000000`, `20260804000001`, `20260804000002`), nothing else.
3. `npx supabase db push --linked` (2026-08-04T01:13:56Z–01:14:40Z) → all three applied in one run: "Applying migration 20260804000000...", "...20260804000001...", "...20260804000002...", `{"upToDate":false,"dryRun":false,...}`. (Docker-dependent post-push catalog-caching step failed locally — no Docker Desktop running — unrelated to the actual migration application, which completed via direct Postgres connection before that step ran.)
4. Verified directly: `supabase_migrations.schema_migrations` row count went from 73 → 76 (exactly +3), all three new rows present with correct version/name, newest version `20260804000002`.

### Pre-migration production baseline (recorded before step 3)

- Grants: `authenticated` had full `SELECT,INSERT,UPDATE,DELETE` on all four tables (matching the documented pre-hardening state exactly).
- Policies: `org_isolation_customers`/`org_isolation_properties`/`customer_properties_isolation`/`internal_org_customer_accounts` all present, `FOR ALL`, asymmetric — identical text to what was already confirmed in §2/§7 before implementation began.
- RLS enabled (not forced) on all four tables — unchanged by this patch.
- Cross-org mismatch check (mandatory stop condition): **zero** mismatches in `customer_properties` (customer org ≠ property org) and **zero** in `customer_accounts` (account org ≠ linked customer's actual org).
- Counts: PPM (`a0000000-...`) — 0 customers/properties/customer_properties/customer_accounts (blank, as expected). Demo (`a0c9b59d-...`) — 2 customers, 3 properties, 3 customer_properties, 1 customer_accounts (healthy).
- `customer_org_id`/`property_org_id` confirmed **absent** before migration (pristine pre-migration state).

### Post-migration schema verification

- Grants: `authenticated` now `SELECT`-only on all four tables; `service_role` unchanged (full access retained).
- Policies: old `FOR ALL` policies gone; `customers_select_org_members`, `properties_select_org_members`, `customer_properties_select_org_members`, `customer_accounts_select_org_members` present with the corrected both-sides logic; `customer_select_own_customer`/`customer_select_own_properties`/`customer_select_own_customer_properties`/`customer_select_own_account` (portal policies) preserved verbatim.
- Helper functions: `customer_org_id`/`property_org_id` present on production with identical definition/config to what was verified pre-merge.
- **Recursion fix confirmed live in production**: a `SET LOCAL role authenticated` + forged `request.jwt.claims` probe (rolled back) queried all four tables — zero `42P17` errors, confirming migration `...000002`'s fix works in production, not just E2E.
- Unrelated protections re-confirmed unchanged: `jobs`/`quotes`/`service_requests`/`estimates`/`site_visits` still `authenticated` SELECT-only (Batch A / V1.0.1, untouched by this patch); `customer_archetype_defaults`/`customer_location_prefs` still carry their pre-existing broad grants, confirming they were correctly left out of scope.

### Production authorization probes (all executed directly against `premier-crm-prod`, inside rolled-back `SET LOCAL role` transactions, using real production accounts — Demo owner/employee, PPM admin as the cross-org actor, and the real portal `customer_accounts` auth user)

All of the following were denied with `42501 permission denied`:

- `customers`: INSERT (employee), UPDATE contact info (employee), UPDATE `org_id` (employee), DELETE (employee), cross-org UPDATE (PPM admin against Demo's customer).
- `properties`: INSERT (employee), UPDATE `gate_code`/`access_notes` (employee), UPDATE `org_id` (employee), DELETE (employee), cross-org UPDATE (PPM admin against Demo's property).
- `customer_properties`: INSERT, UPDATE, DELETE (employee, same-org — direct writes fully closed regardless of target).
- `customer_accounts`: **CP-3 probe** — PPM admin (member of PPM, not Demo) attempted INSERT with `org_id = PPM`, `customer_id = ` Demo's real customer — denied. UPDATE by the real portal auth user against their own row — denied (portal accounts are SELECT-only). DELETE (cross-org actor) — denied.

Reads (all correct, unambiguously confirmed via `count(*)`, not just row-shape inspection):
- Same-org SELECT (Demo employee reading Demo's customer): succeeds, returns the row.
- Cross-org SELECT (PPM admin reading Demo's customer/property): `count = 0` — RLS-filtered, not an error.
- Portal SELECT (the real portal auth user reading their own `customer_accounts` row): succeeds, returns exactly their own `customer_id`/`org_id`.
- Portal SELECT of any other customer (`id != their own`): `count = 0` — confirms the CP-3 fix closes the cross-org exposure path without breaking the user's own legitimate access.

**Zero side effects**: re-queried PPM (still 0/0/0/0) and Demo (still 2/3/3/1, byte-identical to the pre-migration baseline) counts after all probes; the specific probed customer's `first_name` (`Dana`), the probed property's `address_line_1`/`gate_code`/`org_id`, and the probed `customer_accounts` row's `status` (`active`) were all re-read directly and confirmed untouched.

### Legitimate workflow verification

Labeled explicitly by evidence type, per instruction:

- **Production executed (service-role, rolled back)**: simulated exactly what `createCustomer()`/`createPropertyForCustomer()`/`ensureCustomerAccount()` do — INSERT `customers`, INSERT `properties`, UPSERT `customer_properties`, INSERT `customer_accounts` (all as `service_role`, all inside a rolled-back transaction, all against Demo) — all four succeeded with no error (the `customer_accounts` case correctly no-op'd on its pre-existing unique constraint, not a permission failure). Confirms CP-A/CP-B did not break the underlying trusted write paths at the constraint/grant level.
- **Production read-only inspection**: all of §7's post-migration grant/policy queries, plus the counts/row-content checks above.
- **E2E on identical migrations**: the full `authorization-customers-properties-bot.spec.ts` (30/30) plus `customer-crud-bot`/`customer-command-center-bot`/`customer-intake-bot`/`operator-workflow-bot` (47/47, 7 pre-existing TODO-skips unrelated) — run against E2E after the *exact same three migrations* were applied there, then re-run again post-merge with a freshly-restarted, explicitly-E2E-pointed dev server (`/api/e2e-health` confirmed `slbnizoskumwhleeiccv` before the run). Zero unexplained failures.
- **Code-path inspected only, not re-executed live against production this session**: public intake (`createServiceRequest`, hardcoded to PPM — deliberately **not** exercised live in production this session, since it would write a real row into PPM, which this task's scope prohibits; unaffected by this patch, since it's already service-role and its target tables' grants are untouched by CP-A/CP-B for the `service_requests` table itself); downstream request→estimate→site-visit→quote→job→invoice workflow (unaffected — none of its grants/policies were touched by this patch; already independently verified in the Forge V1.0.1 and Batch A production-verification records).

### Test/typecheck/build (re-run after merge, on `main` @ `fba6b7e`)

`pnpm test` 187/187, `pnpm typecheck` clean, `pnpm build` clean (dev server stopped first). E2E re-run after a clean `.next` clear and a freshly-started, explicitly-E2E-pointed dev server: `authorization-customers-properties-bot.spec.ts` 30/30, plus 17/17 across the four adjacent regression suites (7 skipped, pre-existing TODOs unrelated to this patch) — 47/47 passing, zero flakes, zero unexplained failures.

### CP finding closure status

| Finding | Status |
|---|---|
| CP-1 (customers/properties direct-write bypass) | **Closed in production** |
| CP-2 (customer_properties asymmetric cross-org check) | **Closed in production** |
| CP-3 (customer_accounts asymmetric cross-org check / portal exposure) | **Closed in production** |
| CP-4 (no capability model for customer/property creation) | Unresolved — Kevin decision, §15, not part of this patch's scope |
| CP-5 (denormalized fields directly writable) | **Closed in production** (bundled into CP-A) |
| CP-6 (`is_archived` unused) | Informational, no change required |
| CP-7 (broader FK cross-org consistency, `estimates`/`jobs`/etc.) | Unresolved — defense-in-depth backlog, unchanged from original audit |

### Unresolved findings / non-blocking follow-ups

- CP-4, CP-6, CP-7 as above — none are regressions or newly discovered, all were already recorded as out-of-scope or Kevin-decision items in the original audit.
- E2E's 27-migration bookkeeping drift remains **unresolved and untouched** — it predates this work, does not affect production (which has zero drift), and reconciling it was explicitly out of scope for this patch.
- `customer_location_prefs` follow-up (flagged in §14, not required for this batch) remains open.

### Production risk outcome

No incidents, no unexpected schema state, no data loss, no side effects from any probe. PPM confirmed blank throughout. Demo confirmed healthy and numerically unchanged throughout. All three migrations applied cleanly in one controlled run, exactly as required. The recursion defect was caught and fixed in E2E before ever reaching production.
