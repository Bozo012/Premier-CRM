# `service_requests` Authorization Audit

Status: **read-only audit, complete.** No code, tests, migrations, grants, policies, production data, deployment configuration, or the `forge-v1.0.0` tag were modified as part of this document. Nothing here is implemented — see "Explicit exclusions" and "Stopping point."

Audited at: `main` HEAD `fb56827` (post Forge V1 tag; the tag itself, `forge-v1.0.0` → `9181d56`, is unaffected by anything in this audit).

---

## 1. Executive conclusion

**A real authorization weakness is confirmed — not a fabricated-record vulnerability, but a real integrity/tampering gap.** It is narrower than the Batch A jobs/quotes findings in one specific way (it cannot be used to fabricate a wholly new job or quote out of nothing, since those are now closed), but it is broader in another way (it also affects two adjacent tables — `estimates` and `site_visits` — that share the identical pattern and are directly coupled to `service_requests` via foreign keys).

- **Affected roles**: every role holding active membership in an organization (owner, admin, employee, subcontractor, viewer) — the RLS policy makes no role distinction at all, only organization membership. This includes `viewer`, a role that should have **zero write capability anywhere in the product**.
- **Proven impact**: any signed-in org member's own authenticated session can, via a direct Supabase REST call (bypassing every server action and RPC), (a) directly set `service_requests.triage_decision`, `triaged_by`, `triaged_at`, `status`, `job_id`, or `estimate_id` without ever calling `record_request_triage()` — forging a triage record or silently reassigning which job/estimate a request appears to have produced; (b) DELETE a request outright (no soft-delete/archive state exists in the schema — deletion is unrecoverable and not exercised by any product code path today, but is not prevented at the database layer either); (c) INSERT a request directly, bypassing `createServiceRequest()`'s customer/property resolution and dedup logic. The identical class of gap is independently confirmed on `estimates` and `site_visits` (see §9) — both directly coupled to `service_requests` by foreign key.
- **Recommended release classification**: **Forge V1.0.1 security patch** — not a hotfix requiring an out-of-band emergency release (no confirmed exploitation, no path to fabricating a new unauthorized *financial* record now that jobs/quotes are closed, PPM remains blank), but also not a backlog item — the gap is real, proven, and inexpensive to close using the exact pattern already established for jobs/quotes.
- **Immediate production action required**: No. PPM is blank; Demo is the only populated organization and is a controlled environment. This audit recommends scheduling the fix, not an emergency rollback or immediate production write.
- **Recommended hardening model**: Option D (purpose-specific trusted paths for sensitive transitions, narrow direct-write surface preserved only for genuinely harmless intake/status fields) is closest to correct, but this audit recommends a **hybrid of Option B and Option D** as the smallest sufficient fix — see §9/§10 for the exact reasoning; full option comparison in §9 [renumbered §10 below].
- **Implementation risk**: Low. The trusted-write pattern (service-role server actions + `SECURITY DEFINER` RPCs) already exists and already handles 100% of legitimate `service_requests` mutation in application code today (confirmed in §4) — this is a database-boundary closure, not a new architecture.

---

## 2. Current authorization state

### Grants (identical on `premier-crm-e2e` and `premier-crm-prod` — no drift)

| Role | Privileges on `service_requests` |
|---|---|
| `anon` | none |
| `authenticated` | SELECT, INSERT, UPDATE, DELETE |
| `service_role` | SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE |

### Policies (identical on both environments)

| Policy | Command | Permissive | USING | WITH CHECK |
|---|---|---|---|---|
| `internal_org_service_requests` | `FOR ALL` (`*`) | yes | `user_is_in_org(org_id)` | *(none specified — Postgres uses the USING expression for both read-filtering and the implicit write-check when `WITH CHECK` is omitted on a `FOR ALL`/`FOR INSERT`/`FOR UPDATE` policy)* |
| `customer_insert_own_portal_service_requests` | `FOR INSERT` (`a`) | yes | — | `source='portal' AND status='new' AND reviewed_at IS NULL AND EXISTS(active customer_accounts row matching auth.uid() + customer_id + org_id)` |
| `customer_select_own_service_requests` | `FOR SELECT` (`r`) | yes | `EXISTS(active customer_accounts row matching auth.uid() + customer_id)` | — |

**`internal_org_service_requests` is the core finding**: `FOR ALL` with only an org-membership `USING` clause means every role (owner through viewer) can INSERT, UPDATE, or DELETE any row belonging to their organization, with no field-level, role-level, or state-transition restriction. Because no `WITH CHECK` is specified, Postgres falls back to the `USING` expression for write validation too — this does provide one real, if incidental, protection: a member **cannot** reassign `org_id` to an organization they don't belong to (the new row would fail `user_is_in_org(org_id)` against their own membership set). Cross-org row *creation* is therefore blocked; cross-org *tampering with fields inside your own org's rows* — including fields that reference other tables — is not.

### Table structure (schema-verified directly, not inferred from migration files)

- **Trigger**: exactly one — `service_requests_updated_at` (`BEFORE UPDATE`, sets `updated_at`). **No state-transition validation trigger exists at the database layer** — nothing in the database itself prevents an arbitrary combination of `status`/`triage_decision`/`job_id`/`estimate_id` being written in a single UPDATE.
- **Foreign keys**: `org_id → organizations(id) ON DELETE CASCADE`; `customer_id → customers(id) ON DELETE RESTRICT`; `property_id → properties(id) ON DELETE RESTRICT`; `estimate_id → estimates(id) ON DELETE SET NULL`; `job_id → jobs(id) ON DELETE SET NULL`; `triaged_by`/`triage_corrected_by → auth.users(id)`. **None of these FKs verify that the referenced row's `org_id` matches the request's own `org_id`** — Postgres FKs cannot express cross-table tenant consistency natively, and no trigger fills that gap here. This means a member can point their own org's request at a customer/property/estimate/job/that belongs to a *different* organization, as long as that row exists somewhere in the database and they can discover its ID (not exploitable to *read* cross-org data — RLS on the referenced tables still applies for reads — but it can corrupt a request's relationships and, if a downstream process ever trusts the FK's presence over an explicit org check, has correction/consistency implications).
- **CHECK constraints**: `triage_decision`/`triage_corrected_from` are restricted to the three valid triage-decision strings by a plain CHECK (`ANY (ARRAY[...])`) — this constrains the *value*, not *who* may set it or *when*.
- **Status enum** (`service_request_status`): `new, reviewing, approved, scheduled, in_progress, completed, cancelled, spam, estimate_created`. No soft-delete/archived value exists — "deletion" of a request, if it ever happens, is a genuine hard DELETE, not a status transition.
- **RPCs touching this table**: only `record_request_triage()` and `correct_request_triage()` (both `SECURITY DEFINER`, both role/capability-gated internally per `packages/shared/permissions.ts`'s `canTriageRequests`/`canCreateDirectWorkOrder`). No RPC exists for "mark reviewed," "convert to estimate," "convert to direct job," or deletion — those are handled by direct table writes from server actions (see §4).
- **Drift check**: live schema (both environments) matches what the migration files describe — no undocumented drift found.

---

## 3. Field-risk matrix

| Field | Purpose | Intended writer | Current direct-write exposure | Impact if tampered | Required protection |
|---|---|---|---|---|---|
| `org_id` | Tenant identity | System, at creation only | Write blocked cross-org by the implicit `WITH CHECK` (see §2) | Low (already mitigated) | none additional |
| `customer_id`, `property_id` | Request-to-customer/property linkage | System, at creation; staff during triage-adjacent flows | Any org member can repoint to any existing customer/property row, including one belonging to another org (FK doesn't check org match) | Medium — data-integrity/audit-trail corruption; not a read-access bypass | Trusted write path + (ideally) a cross-table org-consistency check |
| `contact_name`, `contact_email`, `contact_phone`, `contact_preferred_channel`, `property_address_*`, `service_category`, `service_title`, `service_description`, `preferred_date`, `preferred_time`, `access_notes` | User-entered intake data | Whoever created the request (public form or staff) | Any org member can edit freely | Low — legitimate day-to-day staff editing of intake details is expected product behavior; not a security concern on its own | none required beyond org-scoping (already present) |
| `internal_notes` | Staff-only notes | Staff | Any org member can edit | Low | none required |
| `status` | Workflow state | System, via the trusted conversion/triage paths | Any org member can set directly to any enum value, including skipping intermediate states or reverting a converted request | Medium-High — can desynchronize the UI's "already converted" signals (see Batch A's Finding F2, a related but distinct issue) and could mark a request `completed`/`cancelled` without the corresponding real-world action ever happening | Trusted write path |
| `triage_decision`, `triage_reason`, `triaged_by`, `triaged_at`, `triage_corrected_from`, `triage_corrected_at`, `triage_corrected_by`, `triage_correction_reason` | Triage audit trail | `record_request_triage()`/`correct_request_triage()` RPCs only | Any org member can set these directly, **entirely bypassing the RPCs** — no authorization check, no state validation, no downstream estimate/site-visit/job creation | **High** — this is the audit-trail forgery risk: a member could make a request appear triaged (with a fabricated `triaged_by`/`triaged_at`) without the RPC's `canTriageRequests`/`canCreateDirectWorkOrder` checks ever running, and without any of the RPC's actual side effects (no estimate/site-visit/job is created) — producing a request whose triage fields claim one thing while its actual downstream state says another | Trusted write path (RPC-only, already correctly designed — the gap is that direct table access can route around it) |
| `estimate_id`, `job_id` | Generated-record linkage | `record_request_triage()` RPC, or the two `requests/actions.ts` conversion actions | Any org member can set/clear directly, including pointing at an estimate/job in a different org (FK doesn't check org match) | **High** — can make a request falsely appear converted (or falsely appear unconverted, clearing a real linkage), and can misattach an unrelated estimate/job | Trusted write path |
| `reviewed_at`, `converted_at` | Timestamps marking staff review / conversion | `markRequestReviewedAction`, the two conversion actions | Any org member can set directly | Low-Medium — timestamp forgery, no downstream state actually changes as a result | Trusted write path (already used in practice; gap is the bypass) |
| `submitted_at`, `created_at`, `request_number` | System-managed | System only, at creation | `request_number` is DB-generated (`next_service_request_number()`); `created_at`/`submitted_at` are freely writable by any org member post-creation | Low-Medium — could misrepresent when a request was actually received, an audit-integrity concern more than a functional one | Trusted write path (for consistency; low urgency) |
| *(deletion — no column, this is a DELETE)* | — | Not currently exercised by any product path | Any org member can hard-delete any request in their org | **Medium-High** — irreversible data loss, no product code currently does this, but nothing prevents it via direct REST | Revoke DELETE / require archive-not-delete semantics (Kevin decision, see §12) |

---

## 4. Write-path inventory (application code)

| File/function | Actor | Client type | Operation | Fields | Current authorization | Direct-write dependency | Test coverage | Hardening impact |
|---|---|---|---|---|---|---|---|---|
| `packages/db/queries/service-requests.ts` → `createServiceRequest()` | caller-supplied | whatever `DbClient` the caller passes (service-role in every current call site) | INSERT | org_id, source, status='new', priority, customer_id, property_id, contact_*, property_address_*, service_*, preferred_*, access_notes | none in-function — trusts caller | No — no legitimate caller uses a browser client | vitest (`site-visit-attachments.test.ts` transitively; not directly unit-tested) | Would continue working unchanged if authenticated INSERT is revoked, since it already always runs service-role |
| `apps/web/app/api/v1/service-requests/route.ts` (`POST`) | anonymous public visitor | `createServiceClient()` (service-role) | INSERT (via `createServiceRequest()`) | full intake set; `org_id` hardcoded to `PREMIER_ORG_ID` env var | CORS-origin allowlist + honeypot field + in-memory per-IP rate limit (no user auth — by design, public form) | No | E2E (`request-conversion-bot.spec.ts` and others exercise it) | Unaffected by revoking `authenticated` grants — never used them |
| `apps/web/app/(app)/requests/actions.ts` → `createEstimateFromRequestAction` | signed-in org member | `createServiceClient()` (service-role) | UPDATE | `estimate_id`, `status='estimate_created'`, `converted_at` | `getRequestActionContext()` only — **no capability check** (Finding F2 from the Forge V1 readiness audit, already known, explicitly out of this batch's proposed scope) | No — action itself is service-role | `apps/web/app/(app)/requests/actions.test.ts` (added in Batch A, covers the *sibling* `createJobFromRequestAction` fix; this action's lack of a capability check is pre-existing F2, not newly discovered here) | Unaffected by revoking authenticated grants |
| `apps/web/app/(app)/requests/actions.ts` → `createJobFromRequestAction` | signed-in org member | `createServiceClient()` | UPDATE | `job_id`, `status='approved'`, `converted_at` | `hasCapability(role, 'canCreateDirectWorkOrder')` (owner/admin only) — fixed in Batch A | No | `requests/actions.test.ts`, `authorization-batch-a-bot.spec.ts` | Unaffected |
| `apps/web/app/(app)/requests/actions.ts` → `markRequestReviewedAction` | signed-in org member | `createServiceClient()` | UPDATE | `status='reviewing'`, `reviewed_at` | `getRequestActionContext()` only — **no capability check at all** (any org role, including subcontractor/viewer, can mark a request reviewed) | No | none found specifically for this action | Unaffected by revoking authenticated grants; a policy question (see §12) on whether this needs a capability gate independent of the DB-boundary fix |
| `packages/db/queries/site-visits.ts` → `recordRequestTriage()` / `correctRequestTriage()` (wrap `record_request_triage`/`correct_request_triage` RPCs) | signed-in org member | `getServerSupabase()` — **RLS-subject, not service-role** (intentional — the RPCs are `SECURITY DEFINER` and self-gate) | UPDATE (inside the RPC body) | `triage_decision`, `triage_reason`, `triaged_by`, `triaged_at`, plus `estimate_id`/`job_id`/site-visit creation as a side effect | RPC-internal: `role_has_capability(v_role, 'canTriageRequests')`, and `canCreateDirectWorkOrder` for the direct-work-order branch | **This is the one legitimate path that already correctly relies on RLS/session context rather than service-role** — but it is unaffected by hardening the base-table grant, because the RPC is `SECURITY DEFINER` (it writes as the function owner, not as the calling `authenticated` role, so revoking `authenticated`'s direct table INSERT/UPDATE/DELETE does not affect the RPC's own internal writes) | `request-site-visit-workflow-bot.spec.ts` (extensive, includes the live capability-parity test) | **None** — `SECURITY DEFINER` RPC writes are not gated by the calling role's table grants, only by the RPC's own internal logic |
| `tests/e2e/utils/cleanup.ts` (test-fixture cleanup) | E2E test harness | service-role | DELETE | (all fixture rows) | test-harness only, not product-reachable | N/A | is the coverage | Unaffected — service-role, always exempt |
| *(no code path)* | — | — | — | — | — | Portal customer INSERT policy (`customer_insert_own_portal_service_requests`) exists in the database but **no application code currently submits through it** — confirmed by exhaustive search of `apps/web/app/portal/**` | N/A | This policy's `WITH CHECK` is real and narrow, but since `authenticated` holds the raw grant and nothing in the app enforces additional validation (dedup, rate-limiting, etc.) before this policy's constraints, a portal customer's own session could INSERT directly today, bypassing `createServiceRequest()`'s customer/property resolution — narrow but real, flagged in §7 |

**Total write sites found**: 5 application code paths that write `service_requests` (1 INSERT-only public route, 3 staff server actions, 2 RPC-wrapping functions used by 1 UI flow) + 1 test-only DELETE utility + 1 unused-but-live database policy. **Zero client-side (`'use client'`) components call Supabase directly against this table** — every UI-triggered write goes through a server action or a service-role-backed query function.

---

## 5. Role/capability matrix

| Role | Create request | View all org requests | View assigned only | Edit intake | Change customer/property | Triage | Assign | Change status | →site visit | →remote estimate | →direct work order | Cancel | Delete | Alter generated relationships | Bypass via direct REST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| owner | ✅ (staff-created) | ✅ | N/A (no assignment concept exists in the schema) | ✅ | ✅ | ✅ (`canTriageRequests`) | N/A | ✅ (`markRequestReviewedAction`, no gate) | ✅ | ✅ | ✅ (`canCreateDirectWorkOrder`) | ✅ (via `status`, no dedicated action) | **not exposed in UI, but DB permits** | ✅ (via triage) | **yes, DB-layer** |
| admin | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | **DB permits, UI doesn't expose** | ✅ | **yes** |
| employee | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | N/A | ✅ (should this be allowed? see §12) | ✅ | ✅ | ❌ (correctly denied — `canCreateDirectWorkOrder` excludes employee, both at RPC and, since Batch A, at the legacy action) | ✅ (via status) | **DB permits, UI doesn't expose** | ✅ (via triage) | **yes** |
| subcontractor | ✅ | ✅ | N/A | ✅ | ✅ | ✅ (holds `canTriageRequests`) | N/A | ✅ | ✅ | ✅ | ❌ (correctly denied) | ✅ | **DB permits** | ✅ | **yes** |
| viewer | should be **read-only everywhere** | ✅ (read) | N/A | **DB permits write — should not** | **DB permits — should not** | **DB permits — should not, `canTriageRequests` excludes viewer at the RPC layer, but direct REST bypasses that entirely** | N/A | **DB permits — should not** | **DB permits — should not** | **DB permits — should not** | **DB permits — should not** | **DB permits — should not** | **DB permits — should not** | **DB permits — should not** | **yes — this is the most severe parity gap: viewer has zero capabilities in the TS model but full table-level write access** |
| customer (portal) | via the unused portal-insert policy only | ❌ (own requests only) | own only | ❌ | ❌ | ❌ | N/A | ❌ | N/A | N/A | N/A | ❌ | ❌ | ❌ | narrow — see §7 |
| anonymous/public | via the trusted intake route only | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | N/A | N/A | N/A | ❌ | ❌ | ❌ | no — `anon` has zero table grants |
| service_role | full | full | full | full | full | full | N/A | full | full | full | full | full | full | full | N/A (trusted) |
| cross-org authenticated user | ❌ (blocked by implicit WITH CHECK on org_id) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **no** — the one place the current policy already works correctly |

**Parity gaps identified**: (1) `viewer` has no write capability anywhere in the TypeScript capability model (`packages/shared/permissions.ts` has no `service_requests`-specific capability at all — the table is entirely ungated by capability, only by org membership) yet has full database-level write access — the most severe finding in this audit. (2) `markRequestReviewedAction` has no capability gate in TypeScript either, so even the "trusted" server-action path doesn't distinguish roles for this one action — though this is a milder, TS-layer-only gap (Kevin decision, §12), not a DB-layer bypass by itself.

---

## 6. Public/customer intake assessment

- **PPM public website** → `POST /api/v1/service-requests` (`apps/web/app/api/v1/service-requests/route.ts`) → `createServiceClient()` (service-role) → `createServiceRequest()`. Gated by CORS origin allowlist, a honeypot field, and an in-memory per-IP rate limit (10/hour). **No user authentication** — correct, by design, for a public form. `org_id` is **hardcoded** to a `PREMIER_ORG_ID` env var (default the real PPM org ID) — this is a single-tenant assumption baked into the public intake route; it cannot currently accept requests for any other organization (including Demo), which is consistent with Demo having no public-facing intake path (already documented in `docs/SESSION_STATE.md`'s known-issues list, item 10, as a pre-existing, accepted limitation).
- **Customer portal** → confirmed via exhaustive search: **no code path submits a `service_requests` INSERT from the portal today.** The `customer_insert_own_portal_service_requests` RLS policy exists and is well-formed (narrow `WITH CHECK`), but is currently dead application code — nothing calls it. It remains live at the database/grant level, meaning a portal customer's own authenticated session *could* insert directly today, bypassing `createServiceRequest()`'s dedup/resolution logic, if a customer discovered and called the Supabase REST endpoint directly. No rate-limiting or duplicate-submission protection exists for this path since it isn't exercised by any real UI. Low real-world likelihood (no discoverable UI surface points at it) but real if a customer inspects network calls or the Supabase client bundle.
- **Share-token page** (`/q/[token]`, `/i/[token]`) — these are quote/invoice response surfaces, not request-creation surfaces; confirmed no `service_requests` write occurs there.
- **Imported requests** — Jobber import (`service_request_source` enum includes `jobber_import`) uses the same `createServiceRequest()`/service-role path per the existing `source` enum value; no separate authorization concern beyond what's already covered.
- **Test fixtures** — E2E specs create requests directly via `admin.from('service_requests').insert(...)` using the service-role client (the established, approved pattern throughout this test suite) — not a product-reachable path, not a finding.
- **The `premier-property-maintenance` marketing-site repository** — inspected read-only. It calls the same `POST /api/v1/service-requests` endpoint on `app.ppmnky.com`; it does not hold or use any Supabase credentials of its own for this table, and does not depend on the `authenticated` grants being audited here at all (it only ever talks to the trusted intake route, never directly to Supabase for this table). No changes needed or possible there as part of this or any future batch — not touched.
- **Duplicate-submission protection**: the public route's honeypot + rate-limit is the only protection; `createServiceRequest()` itself does not check for near-duplicate submissions. This is a pre-existing characteristic, not part of the authorization boundary this audit is scoped to, and is not newly flagged here as a finding.

---

## 7. Confirmed findings

| ID | Observed behavior | Expected behavior | Evidence | Affected roles | Impact | Severity | Confidence | Proposed regression test |
|---|---|---|---|---|---|---|---|---|
| SR-1 | `internal_org_service_requests` (`FOR ALL`, org-only, no `WITH CHECK`) combined with full `authenticated` grants lets any org member directly INSERT/UPDATE/DELETE `service_requests`, including `triage_decision`/`triaged_by`/`triaged_at`/`job_id`/`estimate_id`/`status`, entirely bypassing `record_request_triage()`/`correct_request_triage()` and the two conversion actions | Direct table writes to sensitive/generated fields should be impossible for any role; only the trusted RPCs/server actions should be able to set them | Direct production/E2E policy+grant query (§2); write-path inventory (§4) confirms zero legitimate code path needs direct authenticated write access to these fields | owner, admin, employee, subcontractor, viewer (all — no role distinction in the policy) | Audit-trail forgery (a request can appear triaged/converted with fabricated actor/timestamp and no real downstream record); relationship corruption (`job_id`/`estimate_id`/`customer_id`/`property_id` can point at unrelated or cross-org rows) | **High** | Confirmed (schema-verified, not inferred) | Direct-REST INSERT/UPDATE attempts on sensitive fields for every role, asserting denial after hardening |
| SR-2 | `viewer` role has zero capabilities defined for `service_requests` in `packages/shared/permissions.ts` (no capability gates this table at all) yet has full database write access identical to owner/admin | `viewer` should have no write capability on any table | Role/capability matrix (§5); direct comparison of the capability map against the RLS policy | viewer specifically (the most privileged-gap role) | Same as SR-1, but specifically severe because it affects the one role explicitly meant to be read-only everywhere | **High** | Confirmed | Direct-REST write attempt as viewer, asserting denial |
| SR-3 | `markRequestReviewedAction` has no `hasCapability` check at all — any signed-in org member, including subcontractor/viewer, can mark a request "reviewing" via the trusted server action itself (not just via a DB bypass) | Unclear — this may be intentional (marking something reviewed is low-stakes), a genuine Kevin policy decision, not an implementation bug | Code inspection, `apps/web/app/(app)/requests/actions.ts:287-319` | all roles | Low — only affects `status`/`reviewed_at`, no generated-relationship or triage forgery | Low | Confirmed (as a fact); severity assessment pending Kevin's policy call (§12) | Existing-behavior regression test (assert current behavior is preserved or changed per Kevin's decision) |
| SR-4 | `customer_insert_own_portal_service_requests` is a live, correctly-narrow RLS policy with no corresponding application code — a portal customer's own session could INSERT directly, bypassing `createServiceRequest()`'s dedup/resolution logic | Either the policy should be removed (if the portal-submission feature is not planned) or the application should route through it deliberately (if it is planned) | Exhaustive search of `apps/web/app/portal/**` (§4, §6) | customer (portal) | Low — narrow blast radius (only creates a `new`-status request tied to the customer's own account, cannot forge triage/relationship fields since `status`/`reviewed_at`/`source` are constrained by the `WITH CHECK`) | Low | Confirmed | Direct-REST INSERT as a real portal customer, asserting current (permitted) behavior, to be revisited only if Kevin decides to actually build this feature |
| SR-5 | No FK or trigger verifies that `customer_id`/`property_id`/`estimate_id`/`job_id` belong to the same `org_id` as the request itself | Cross-table relationships within one request should be tenant-consistent | Constraint inspection (§2) | all roles with any write access (today, all of them) | Medium — data-integrity/audit-trail corruption, not a cross-org *read* bypass (RLS on the referenced tables still applies) | Medium | Confirmed | Attempt to set `customer_id`/`property_id` to a cross-org value after hardening, asserting denial or at minimum that the trusted path validates org match (already true for `createServiceRequest()`'s org-scoped lookups — the gap is only the direct-write bypass) |
| SR-6 | DELETE is fully permitted for any org member at the database layer; no product code path exposes deletion, and no soft-delete/archive status exists in the schema | Requests should be cancelled (via `status='cancelled'`), not deleted — or, if deletion is ever a real feature, it should be a deliberate, gated action | Schema inspection (§2, §3) | all roles | Medium-High — irreversible data loss if ever triggered, whether by accident (a raw script) or by a compromised/malicious session | Medium | Confirmed (capability exists; not exploited, not exercised) | Direct-REST DELETE attempt for every role, asserting denial after hardening |

**No speculative findings are included above** — every row is backed by direct schema/policy inspection or exhaustive code search, not inference from migration files alone.

---

## 8. Test plan (to be created during implementation, not now)

Proposed file: `tests/e2e/authorization-service-requests-bot.spec.ts`

| # | Test | Expected current result | Expected hardened result | Fixture | Cleanup | Parallel-safe | Persistent user needed | Interaction risk with existing suites |
|---|---|---|---|---|---|---|---|---|
| 1 | Owner direct REST INSERT into own org | succeeds | denied | temp org + temp owner user | delete temp org/user in `afterAll` | yes (isolated org) | no (create per-test) | none — new isolated org |
| 2 | Admin direct REST INSERT into own org | succeeds | denied | same | same | yes | no | none |
| 3 | Employee direct REST INSERT into own org | succeeds | denied | same | same | yes | no | none |
| 4 | Subcontractor direct REST INSERT into own org | succeeds | denied | same | same | yes | no | none |
| 5 | Viewer direct REST INSERT into own org | succeeds | denied | same | same | yes | no | none |
| 6 | Cross-org INSERT attempt | already denied today (implicit WITH CHECK) | still denied | temp org A + user, temp org B target | same | yes | no | none |
| 7 | UPDATE harmless intake text (`service_description`) as any staff role | succeeds today | **still succeeds** — this is legitimate and must remain unchanged | temp request fixture | same | yes | no | must assert this positively, not just denial, to prove no regression |
| 8 | UPDATE `org_id` to a different org | denied today (implicit check) | still denied | same | same | yes | no | none |
| 9 | UPDATE `customer_id`/`property_id` to a cross-org value | succeeds today | denied (or routed through validated path) | temp request + cross-org customer fixture | same | yes | no | none |
| 10 | UPDATE `triage_decision`/`triaged_by`/`triaged_at` directly | succeeds today | denied | temp request fixture | same | yes | no | must not collide with `request-site-visit-workflow-bot`'s real triage RPC tests — use a distinct temp org |
| 11 | UPDATE `status` directly (e.g. to `completed`) | succeeds today | denied for direct writes; still settable via the legitimate action paths | temp request fixture | same | yes | no | none |
| 12 | UPDATE `job_id`/`estimate_id` directly (set) | succeeds today | denied | temp request fixture | same | yes | no | none |
| 13 | UPDATE `job_id`/`estimate_id` directly (clear, set to NULL) | succeeds today | denied | temp request fixture with real linkage | same | yes | no | none |
| 14 | Mark `converted_at`/`reviewed_at` directly without any real workflow action | succeeds today | denied | temp request fixture | same | yes | no | none |
| 15 | DELETE a request directly | succeeds today | denied | temp request fixture | assert row still exists afterward | yes | no | none |
| 16 | UPDATE another organization's request (full cross-org tamper attempt) | denied today (implicit check on org_id itself, but note: if the *target row's* org_id is unchanged and only e.g. `status` is being updated cross-org, the USING clause still blocks it since the actor isn't in that org) | still denied | temp org A user, temp org B target request | same | yes | no | none |
| 17 | Attempt to set `customer_id`/`property_id`/`estimate_id`/`job_id` to a nonexistent (orphaned) UUID | denied today only by FK constraint (23503), not by authorization | still denied (same FK reason) | temp request fixture | same | yes | no | this test proves the FK layer already partially protects against orphaning, independent of the authorization fix |
| 18 | Confirm no `activity_log` row or downstream side effect from any denied attempt above | N/A (attempts fail, so no rows expected either way today via error paths, but a *successful* unauthorized write today creates zero activity_log entries either, since only the RPCs/actions call `logActivity`) | zero side effects, before and after hardening | reuse fixtures above | same | yes | no | none |

**Legitimate-path regression tests** (existing suites, to be re-run, not created new):
- Public intake: `request-conversion-bot.spec.ts`, existing public-route tests.
- Staff-created request: same suite.
- Triage → remote estimate / site visit / direct work order: `request-site-visit-workflow-bot.spec.ts` (extensive, already covers all three paths + the capability-parity test).
- Request assignment: not applicable — no assignment concept exists in the schema (§3).
- Request cancellation: covered implicitly wherever `status='cancelled'` is exercised in existing suites, if any — to be confirmed during implementation, not a new test category.
- Accepted quote/job conversion relationship: `integrated-lifecycle-bot.spec.ts` (already exhaustively covers this, unaffected by a `service_requests`-scoped hardening).
- Full existing `request-site-visit-workflow-bot.spec.ts` and `request-conversion-bot.spec.ts` suites must be re-run and remain 100% green — they are the direct regression signal that legitimate behavior is unaffected.

---

## 9. Adjacent table review

Scoped narrowly to tables directly coupled to request mutation, per instruction — not a repository-wide audit.

| Table | Coupling to `service_requests` | Current authorization state | Classification |
|---|---|---|---|
| `estimates` | `service_requests.estimate_id` FK target; a request's triage outcome | `internal_org_estimates`: `FOR ALL`, org-only, **identical pattern to the `service_requests` finding** | **Required in the same batch** — hardening `service_requests` alone while `estimates` remains fully writable by any org member would leave an equally severe, directly-adjacent bypass (a member could still directly fabricate/tamper with an estimate's `pricing_reviewed_at`/`pricing_reviewed_by`/line items via raw table access, sidestepping the pricing-review handoff entirely — a distinct but structurally identical risk to SR-1) |
| `site_visits` | `service_requests` triage outcome (`site_visit_required` path); `site_visits.service_request_id` FK | `internal_org_site_visits`: `FOR ALL`, org-only, **identical pattern** | **Required in the same batch** — same reasoning; a member could directly set `site_visits.status='completed'` or tamper with `inspection_responses` without ever going through the guarded lifecycle actions |
| `activity_log` | Audit trail for triage/conversion events | Already confirmed safe in the Batch A audit — no `authenticated` INSERT/UPDATE/DELETE grant at all | **Already secure** — no action needed |
| `jobs`, `quotes` | Downstream of triage/conversion | Already hardened in Batch A (`20260803070000_harden_jobs_and_quote_creation_boundary.sql`) | **Already secure** — confirmed unaffected by this audit, not re-touched |
| `customers`, `properties` | `service_requests.customer_id`/`property_id` FK targets | Also share the identical `FOR ALL`, org-only pattern (checked for context on SR-5, §3) | **Separate follow-up** — genuinely out of this narrow adjacency scope per instruction (not named in the request/estimate/site-visit coupling list) and represents a substantially larger surface (customer/property records, not request-workflow state) that deserves its own dedicated audit rather than being folded in here |
| Request assignment / comment / attachment / status-history tables | — | **Not applicable — these tables do not exist in the schema.** No `assigned_to` column, no comment table, no attachment table, no status-history table for requests were found (confirmed via direct schema query, §3, §9) | **Not applicable** |

**Conclusion**: hardening `service_requests` in isolation would leave two directly-coupled, structurally identical bypasses on `estimates` and `site_visits` immediately adjacent to it — closing only `service_requests` would be an incomplete fix for the actual risk this audit was asked to assess (a member forging a request's triage state is only half the story if they can also directly forge the resulting estimate or site visit). This audit recommends including `estimates` and `site_visits` in the proposed implementation batch (§10), not as a separate future batch.

---

## 10. Hardening-option comparison

| | Security strength | Compatibility risk | Migration scope | App-code scope | Testing burden | Public-site impact | Portal impact | Rollback complexity | Long-term maintainability | Matches jobs/quotes model |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** — Revoke all authenticated writes, route everything through service-role/RPC | Highest | Low (confirmed zero legitimate authenticated-write dependency in §4) | One migration per table (3: `service_requests`, `estimates`, `site_visits`) | None required — every legitimate write is already service-role or RPC | Low — direct-REST denial tests only | None | None (the one unused portal-insert policy would also need explicit handling — see below) | Simple (revert = re-grant + restore FOR ALL policy) | High — single, consistent pattern across the whole schema | **Yes — exact match** |
| **B** — Narrow authenticated INSERT for intake, revoke UPDATE/DELETE | Medium-High | Low | Similar scope | None required | Similar | None | Would need to also decide the fate of the unused portal-insert policy | Simple | Medium — introduces a table-specific exception | Partial match |
| **C** — Command-specific RLS with role/capability checks duplicated into SQL | Medium-High | Medium — requires keeping a second copy of the capability matrix in sync (the exact anti-pattern the codebase's own capability-parity test was built to prevent) | Larger (new SQL functions or complex policy expressions) | Moderate | High — needs parity testing like the existing `role_has_capability()` mechanism | None | None | Complex (multiple interacting policies) | Lower — competes with the existing "capability lives in one place" design principle already established for jobs/quotes | No — different pattern than jobs/quotes |
| **D** — Purpose-specific RPCs for every sensitive transition, preserve limited direct edits for harmless fields | Highest for sensitive fields, but requires a genuine column-level split | Low | Larger (new RPCs for "mark reviewed," possibly others) | Moderate (new RPC call sites) | Medium | None | None | Complex to roll back partially | High long-term, but larger short-term lift than needed to close this specific gap | Closer to jobs/quotes in spirit, more granular in practice |
| **E** — Split public intake into a separate RPC/intake table | Addresses a different concern (public-intake isolation) than the one this audit found | N/A | N/A | N/A | N/A | Would require public-site changes | N/A | N/A | N/A | N/A |

**Recommendation: Option A**, applied to `service_requests`, `estimates`, and `site_visits` together in one migration (or three clearly-related migrations applied together). This is the smallest option that:
- Closes every confirmed finding (SR-1 through SR-6) and the two adjacent findings (§9) in one pass.
- Requires **zero application code changes** — every legitimate write path is already service-role (`createServiceClient()`) or a `SECURITY DEFINER` RPC, neither of which is affected by revoking `authenticated`'s base-table grants (confirmed exhaustively in §4).
- Matches the exact, already-reviewed, already-production-proven pattern from `20260803070000_harden_jobs_and_quote_creation_boundary.sql` — no new architecture, no new competing pattern.
- Is enforceable at the database boundary (grant + policy, defense-in-depth as established in Batch A) and is trivially testable with the same `SET LOCAL role` / real-account technique already used for Batch A's production verification.
- Option E is not applicable — this audit did not find a public-intake-specific problem (the intake route is already correctly service-role-only and never touches the `authenticated` grant).
- Options B/C/D were considered and rejected as either not fully closing the finding (B leaves UPDATE-based triage/relationship forgery open if scoped narrowly, though a full B could match A) or introducing more implementation/testing surface than the confirmed risk justifies (C, D) for what is, per §4, a case where literally zero legitimate authenticated-write dependency exists.

The one item Option A does not automatically resolve is **SR-4** (the unused portal-insert policy) — since that policy has a real, narrow `WITH CHECK` and isn't part of the `internal_org_service_requests` bypass, it survives an Option-A-style revoke of blanket `authenticated` privileges only if the revoke is scoped correctly (see §12 — whether to also revoke the portal customer's narrow INSERT ability, or leave it as-is pending a product decision on whether portal-submitted requests are a real future feature).

---

## 11. Recommended implementation batch (proposed scope only — not implemented)

- **Branch**: `fix/service-requests-authorization-hardening`
- **Migration filename**: `supabase/migrations/<next-timestamp>_harden_service_requests_estimates_sitevisits_boundary.sql`
- **Policy/grant changes**:
  - `REVOKE INSERT, UPDATE, DELETE ON public.service_requests FROM authenticated` (decide during implementation whether to also revoke the customer-portal INSERT path per Kevin's §12 decision, or leave `customer_insert_own_portal_service_requests` as the sole surviving narrow INSERT policy)
  - `REVOKE INSERT, UPDATE, DELETE ON public.estimates FROM authenticated`
  - `REVOKE INSERT, UPDATE, DELETE ON public.site_visits FROM authenticated`
  - Replace each `internal_org_*` `FOR ALL` policy with a `FOR SELECT`-only org-scoped policy, matching the exact `jobs_select_org_members`/`quotes_select_org_members` pattern from Batch A
  - Preserve `customer_select_own_service_requests` and (pending §12) `customer_insert_own_portal_service_requests` unchanged
- **RPC changes**: none required — `record_request_triage()`/`correct_request_triage()` are already `SECURITY DEFINER` and unaffected by the grant/policy change
- **Server-action changes**: none required for the DB-boundary fix itself. Optionally, if Kevin approves it in §12: add a capability gate to `markRequestReviewedAction` (a small, independent TS-layer change, not required for the security fix)
- **Public-site changes**: none — the public intake route already never used the `authenticated` grant
- **Test files**: `tests/e2e/authorization-service-requests-bot.spec.ts` (new, per §8's 18-test plan), plus equivalent additions for `estimates`/`site_visits` direct-write denial (extend the same spec or add sibling specs, to be decided during implementation)
- **Documentation updates**: update `docs/releases/forge-v1-readiness-audit.md`'s open-finding list to mark the `service_requests` item as closed once implemented and verified (do not edit the existing dated addendum in place — add a new dated addendum, matching the pattern already established for the Batch A production-verification section); do not touch `forge-v1.0.0` or its release record
- **Deployment order**: implement → run new tests + full affected regression suite on `premier-crm-e2e` → apply migration to `premier-crm-e2e` first → re-verify → apply to `premier-crm-prod` only after explicit approval, following the exact Batch A production-verification method (`SET LOCAL role` simulation with real accounts, zero mutating writes, wrapped in rolled-back transactions)
- **Rollback plan**: identical in shape to Batch A's — a straightforward corrective migration re-adding the grants/policy if ever needed; no data migration risk since this is a pure authorization-boundary change

**Estimated implementation risk**: Low. No application code is required to change; the fix is additive at the database layer only, using an already-proven pattern, with zero confirmed legitimate-workflow dependency on the grants being removed.

**Production migration required**: Yes, eventually (after `premier-crm-e2e` verification and explicit approval) — but not as part of this read-only audit phase.

---

## 12. Explicit exclusions

Not included in this audit's proposed scope:
- Any change to `jobs`/`quotes` (already hardened and verified in Batch A — not re-touched)
- Base44 work (unstarted, unaffected)
- Broader/unrelated RLS hardening beyond `service_requests`, `estimates`, and `site_visits` (in particular, `customers`/`properties` share the same pattern but are explicitly deferred to a separate future audit, §9)
- Foundry public marketing (unrelated)
- Repository or infrastructure renames (unrelated)
- PPM data changes (none made; PPM remains blank throughout this audit)
- The `forge-v1.0.0` tag or its release record (untouched)
- F2 (`createEstimateFromRequestAction`'s missing capability check), F4 (duplicate legacy/canonical UI), F6 (`customer_archetype_defaults` RLS), F7 (e2e-bot accounts on PPM) — none of these are directly required to close the findings in this document, and are not addressed here

---

## 13. Kevin decisions

Only genuine product-policy questions — not implementation details that follow directly from the established security model:

1. **Should `service_requests`/`estimates`/`site_visits` follow Option A (full revoke, matching jobs/quotes exactly), or is there a reason to preserve any narrow direct-write capability for staff** (e.g. if a future feature genuinely needs a browser-client write to one of these tables)? Recommendation: Option A, since §4 confirms zero current legitimate dependency — but this is worth a quick explicit confirmation since it forecloses a browser-direct-write pattern for these three tables going forward.
2. **Should the currently-unused `customer_insert_own_portal_service_requests` policy be revoked (since nothing uses it and it's dead weight with residual exposure), or preserved because portal-submitted requests are a genuinely planned future feature?** If preserved, it should at minimum be documented as an intentional, narrow exception to the otherwise-full revoke.
3. **Should `markRequestReviewedAction` (SR-3) gain a capability check, and if so, which capability/roles?** This is independent of the database-layer security fix and can ship separately or together, at Kevin's discretion — is "mark reviewed" meant to be a low-stakes action any staff member can perform, or should it require a specific capability (e.g. a new `canReviewRequests`, or reuse `canTriageRequests`)?
4. **Should requests ever be genuinely deletable (hard DELETE), or should deletion always mean `status='cancelled'`/archived?** The schema currently has no soft-delete state and no product code exposes deletion — this audit recommends fully revoking DELETE (matching jobs/quotes, where DELETE was also revoked in Batch A) unless Kevin specifically wants a future staff-facing delete feature, in which case it should be a deliberately gated action, not a raw grant.
5. **Does this ship as Forge V1.0.1, or bundled into a later V1.1?** This audit recommends V1.0.1 (a focused security patch, consistent with Batch A's own classification) given the confirmed-but-contained nature of the findings, but the exact release-numbering decision is Kevin's.
6. **Should `customers`/`properties` (found to share the identical broad-write pattern while checking SR-5, but out of this narrow audit's named scope) be queued as the next security-audit target after this batch ships?** Not required for this batch's scope, but flagged so it isn't lost.

---

## Stopping point

Per instruction, this audit stops here. No migration was created, no grants or RLS policies were modified, no test files were added, no application code was changed, the public PPM site was not touched, nothing was deployed, no production data was modified, Base44 was not started, F2/F4/F6/F7 were not addressed, and the `forge-v1.0.0` tag was not moved.

Waiting for explicit approval before implementing `service_requests`/`estimates`/`site_visits` authorization hardening.
