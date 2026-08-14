# V1 Production Readiness Audit

Status: **audit-only deliverable.** No production migrations were applied, no data was mutated, no deployment was triggered. This document is read-only findings plus a proposed sequence for a separate, explicitly-approved execution step.

Audited at worktree `C:\dev\Premier-CRM-production-readiness`, branch `audit/v1-production-readiness`, base `origin/main` @ `b859217` (PR #147 merged — scheduling-conflict detection + atomic job creation RPC).

## 1. The three authoritative states

| Environment | Identifier | Migration count | Head migration |
|---|---|---|---|
| Repository (`origin/main` @ `b859217`) | — | 89 | `20260814010000_scheduling_conflict_detection` |
| `premier-crm-e2e` (Supabase) | `slbnizoskumwhleeiccv` | 94 | `20260812214951_scheduling_conflict_detection_fix_null_lead` |
| `premier-crm-prod` (Supabase) | `apnbpcauqrjvkoleisde` | 79 | `20260805084201_team_availability_model` (functionally; last-applied `20260810113806_invoice_line_items_source_expense_uniqueness`) |

Two other Supabase projects exist under the same org (`Bozo012's Project` / `khtepbprvzgjgmpvnlwg`, `CRM` / `fhqlwqqqqpahiycrcgwv`) — both `INACTIVE`, predate the current schema, not part of the live topology. Ignored for this audit.

Vercel: production app is `premier-crm-web` (`prj_CJ8oQfHmQUjao4GzCZF3drze0dNm`), serving `app.ppmnky.com`, currently deployed at `dpl_CcspnU2Ft6qQ7xY3kfxCqQmnHL4M` (target: production). A second project, `premier-property-maintenance`, exists but is out of scope (marketing site).

## 2. Migration-history diff

Compared by logical name (stripping the version-prefix, since e2e's naming reflects real apply-timestamps while repo/prod use authored sequential timestamps for the same logical migrations — this is expected, not drift).

**Repo vs production**: production is missing exactly 10 migrations, all present in repo and already proven live on e2e, in the same relative order:

| # | Migration | Classification |
|---|---|---|
| 1 | `20260808000000_job_assignments_model` | Additive (new table + 3 RPCs) |
| 2 | `20260810115335_allow_site_visit_undo_start_transition` | Additive (trigger allow-list fix) |
| 3 | `20260810120000_create_portal_service_request_rpc` | Additive (new RPC only) |
| 4 | `20260811030000_customer_safe_photo_visibility` | Additive (new column + capability + 3 RPCs) |
| 5 | `20260811040000_site_visit_customer_photo_visibility` | Additive (RPC signature extension) |
| 6 | `20260812010000_customer_staff_threaded_messaging` | Additive (2 new tables + 6 RPCs) |
| 7 | `20260812020000_customer_reply_capability` | Security tightening (narrows `send_staff_reply` from any-non-viewer to a named capability) |
| 8 | `20260813010000_customer_archetype_defaults_rls` | **Security fix** — closes a live cross-org write hole (see §5) |
| 9 | `20260813020000_portal_customer_reported_urgency` | Additive (new enum + nullable column + RPC signature extension) |
| 10 | `20260814010000_scheduling_conflict_detection` | Additive (2 new RPCs) |

**Repo vs e2e**: e2e has two extra migrations not in repo — `scheduling_conflict_detection_fix_status_cast` and `scheduling_conflict_detection_fix_null_lead`. These are transient hotfixes applied during live e2e validation of migration #10 and were squashed into the final `20260814010000_scheduling_conflict_detection.sql` before merge (confirmed by reading the file: both fixes — the `job_status` cast and the null-lead handling — are present inline). Not drift; expected squash-before-merge pattern.

**Production vs e2e**: no unexpected production-only migrations, no renamed files, no history mismatches. Production is a clean strict prefix of e2e's applied set (by logical name) plus the two hotfixes discussed above.

**Verdict on §2/§3 of the requested audit**: production is *merely behind*, cleanly — no divergent history, no orphaned production-only DDL, no schema drift despite matching history (not independently checked row-by-row via `pg_catalog` diff, but every one of the 10 pending migrations was read in full and each represents a self-contained, additive or narrowly-corrective change with no conflicting redefinition of prior objects other than deliberate `CREATE OR REPLACE`/`DROP FUNCTION IF EXISTS` idempotent-recreation patterns).

## 3. Per-migration read-only findings

All 10 pending migrations were read in full (not just diffed by name). Summary:

- **No destructive DDL.** Every `DROP` in the set is either `DROP FUNCTION IF EXISTS` (immediately followed by `CREATE FUNCTION` with a different signature — required because Postgres treats a changed parameter list as a new overload, not a replacement) or `DROP POLICY IF EXISTS` (immediately followed by `CREATE POLICY`, standard idempotent-migration idiom). No `DROP TABLE`, no `TRUNCATE`, no unguarded `DELETE`.
- **Column additions**: `vault_items.customer_visible boolean not null default false` and `service_requests.customer_reported_urgency <new enum>` (nullable, no default). Both are constant-default/nullable additions — no full-table rewrite or long lock under Postgres 11+.
- **New tables**: `job_assignments`, `communication_threads`, `communication_messages` — all additive, all RLS-enabled, all with `authenticated` restricted to SELECT (or nothing) and every mutation routed through a `SECURITY DEFINER` RPC that independently re-derives org/role/ownership from `auth.uid()`. None trust a client-supplied `org_id` or `customer_id`.
- **Backfills**: none required — every new column is either defaulted or nullable, every new table starts empty.
- **Indexes**: each new table gets appropriate composite/partial indexes (e.g. `job_assignments_one_lead_per_job` partial unique index, `communication_threads_org_updated_idx`). No `CREATE INDEX CONCURRENTLY` used, but tables are new/empty at migration time so a plain `CREATE INDEX` is instant — not a production-lock concern.
- **RLS/grants**: consistent discipline throughout — direct `authenticated` write grants are never given on sensitive tables; every mutation path is a `SECURITY DEFINER` RPC with `REVOKE ALL FROM PUBLIC` + explicit `GRANT EXECUTE TO authenticated` (and `service_role` where server-side code needs it). This matches the hardened pattern already locked in for jobs/quotes (`20260803070000_harden_jobs_and_quote_creation_boundary.sql`, already live in prod).
- **Proven on e2e**: all 10 (in the same order, plus the two squashed hotfixes) were applied and exercised on `premier-crm-e2e` before merge. Cross-referenced against `docs/implementation/v1-known-gaps-audit.md`, which documents live e2e verification (test counts, e.g. 15/15 for scheduling-reliability, 8/8 for archetype-defaults RLS) for 6 of the 10.
- **`canPublishCustomerMedia` role matrix (exact, verified live against production post-deploy)**: `owner` ✅, `admin` ✅, `employee` ❌, `subcontractor` ❌, `viewer` ❌. This is an owner-**and**-admin capability, not owner-only — `packages/shared/permissions.ts` (`canPublishCustomerMedia: ['owner', 'admin']`) and the production `role_has_capability()` function agree exactly. Recorded here explicitly because an earlier informal status update in this deploy's chat log paraphrased it as "owner-only," which was imprecise; no committed document ever stated that, and no implementation behavior was ever in question.

**No dangerous migration or data issue found** in the pending set.

## 4. Security-sensitive area reconciliation

| Area | Status in production | Notes |
|---|---|---|
| Portal request RPC (`create_portal_service_request`) | **Missing** (pending #3, #9) | Currently production has no portal-submission path at all for `service_requests` post-hardening — this is the *safe* direction to be behind in (no functionality gap that leaks data, just a missing feature). |
| Customer/property hardening | **Live** (`20260804000000/1/2_harden_*`) | Already in production. |
| Customer-safe media | **Missing** (pending #4, #5) | `vault_items.customer_visible` doesn't exist yet in prod — no portal photo surface possible until deployed. Fail-closed today, not a risk. |
| Threaded messaging | **Missing** (pending #6) | Prod still on the old one-shot `portal_contact_requested` flow. |
| Customer reply capability | **Missing** (pending #7, depends on #6) | N/A until #6 ships. |
| Customer archetype RLS | **Missing — live gap today** (pending #8) | **Confirmed via production security advisor**: `customer_archetype_defaults` currently has `RLS Disabled in Public` at **ERROR** level in `premier-crm-prod`'s own advisor output. Any authenticated user in any org can currently overwrite/delete this table's 7 rows directly via PostgREST. This is the highest-priority item in the pending set — see §11. |
| Job assignments | **Missing** (pending #1) | `create_job_with_schedule` (already-merged #147) assigns crew via `job_assignments` — **this RPC will fail at the crew-assignment step in production today** if crew is passed, because the table doesn't exist yet in prod. Not exercised by any *currently* deployed app code path (app code is on `main`, not yet redeployed against prod's older schema — see §6), but flags the deploy-order dependency: migrations must land before/with the app code that calls them. |
| Scheduling RPCs (`get_scheduling_conflicts`, `create_job_with_schedule`) | **Missing** (pending #10) | Same dependency as above. |
| Expense/invoice uniqueness | **Live** (`20260810113806_invoice_line_items_source_expense_uniqueness`) | Already in production. |
| `customer_accounts` isolation | **Live** (`20260804000001_harden_customer_properties_and_accounts`) | Already in production. |

**Wording to preserve, per your instruction**: the scheduling-conflict RPCs re-run their check inside the same transaction immediately before any write, which narrows the race window versus a naive check-then-write, but there is no DB-level uniqueness/exclusion constraint preventing two independent transactions from both passing the check before either commits. This is a deliberate product decision (warning + override, documented in the migration's own header), not an oversight — do not describe it in deploy docs as transactionally conflict-proof or as preventing all double-booking.

## 5. Generated DB types

`packages/db/types.ts` was last regenerated at commit `f014212` (the scheduling-conflict-detection commit, now `HEAD`'s second parent via the merge). It **already includes** `job_assignments`, `communication_threads`, `communication_messages`, `customer_reported_urgency`, `get_scheduling_conflicts`, `create_job_with_schedule` — i.e. it reflects the **post-#147 / e2e-equivalent schema**, not current production schema.

This is correct for app code (which is written against `main` and expects this schema) but means: **the generated types currently do not match production.** If `pnpm db:types` were run against `apnbpcauqrjvkoleisde` right now, it would produce a strictly smaller types file missing all 10 pending migrations' tables/columns/functions. No action needed beyond the deploy itself — once the 10 migrations apply to production, the existing (already-generated) types file becomes accurate again. Do not regenerate types against production mid-way through the deploy sequence.

## 6. Runtime configuration audit (no secrets read or exposed)

- **Supabase**: `.env.example` requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`. The codebase has a deliberate, tested guardrail against pointing test/e2e infrastructure at the production project: `apps/web/app/api/e2e-health/route.ts` + `tests/e2e/global-setup.ts` + `playwright.config.ts` all hardcode the prod project ref (`apnbpcauqrjvkoleisde`) specifically to detect and refuse a misconfigured E2E run against it (added after a near-miss on 2026-07-31, per the route's own comment). No tool available in this session enumerates actual configured Vercel env var names/values (by design — avoids exposing secrets); production's live wiring should be spot-confirmed via the Vercel dashboard before deploy, specifically that `NEXT_PUBLIC_SUPABASE_URL`/keys for the `production` environment target `apnbpcauqrjvkoleisde`, not `slbnizoskumwhleeiccv`.
- **Portal handoff**: `PORTAL_HANDOFF_ALLOWED_ORIGINS` (comma-separated) gates `apps/web/lib/customer-portal-handoff.ts`; `NEXT_PUBLIC_MARKETING_SITE_URL` (default `https://www.ppmnky.com`) is the expected origin. Code present and referenced; actual configured origin list not independently verifiable without dashboard access.
- **Marketing-site origins**: covered by the same `PORTAL_HANDOFF_ALLOWED_ORIGINS`/`NEXT_PUBLIC_MARKETING_SITE_URL` pair above.
- **Storage**: see §7 — structurally identical between e2e and production.
- **Email (Resend)**: `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (must be a verified domain) — required, not independently verifiable without dashboard access.
- **Vercel/deployment config**: production app resolves correctly (`app.ppmnky.com` → `premier-crm-web`, `target: production`, `readyState: READY`). Runtime error scan (7-day window) shows exactly one error group — a benign, low-frequency `AuthApiError: Invalid Refresh Token` on `/site-visits/[siteVisitId]` (2 occurrences, 1 user, stale-session class, not a code or config defect).
- **Google Maps browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) **and server key** (`GOOGLE_MAPS_API_KEY`): **confirmed absent as of the last full gap audit** (`docs/implementation/v1-known-gaps-audit.md`, dated through 2026-08-11) — "No `GOOGLE_MAPS_API_KEY` configured anywhere in this worktree." No tool in this session can independently re-confirm current Vercel env-var presence without a dashboard check; treated as still-P0 per §11 pending that confirmation. Do not fabricate a "resolved" status without direct verification.

## 7. Storage verification

Both `premier-crm-e2e` and `premier-crm-prod` have **exactly one** structurally identical bucket:

| Property | e2e | production |
|---|---|---|
| Bucket id/name | `site-visit-attachments` | `site-visit-attachments` |
| Public | `false` | `false` |
| File size limit | 15 MB | 15 MB |
| Allowed MIME types | `image/jpeg`, `image/png` | `image/jpeg`, `image/png` |

Despite the bucket's name, `packages/db/queries/vault-items.ts` uses it generically for all `vault_items` photo uploads (job, estimate, and site-visit-linked alike) — confirmed via `SITE_VISIT_ATTACHMENTS_BUCKET` constant usage repo-wide. Access pattern is quarantine-then-finalize upload plus `createSignedUrl()` reads (300s default expiry) — no public URLs, no direct bucket exposure. This is fully compatible with the customer-visible photo model added in the pending migrations: `list_customer_visible_photos()` returns `storage_object_key`/`image_url`, and the portal is expected to exchange those for signed URLs through the same `getSignedReadUrl()` path already in use for staff. **No bucket/policy work is required as part of this deploy** — storage is already correctly provisioned identically in both environments.

## 8. Production advisor snapshot (read-only)

`premier-crm-prod` security advisor: 2 `ERROR`-level findings, 105 `WARN`-level.

- `ERROR`: `public.spatial_ref_sys` RLS disabled — PostGIS system table, expected/unactionable, not application-owned.
- `ERROR`: **`public.customer_archetype_defaults` RLS disabled** — this is exactly the live gap that pending migration #8 (`20260813010000_customer_archetype_defaults_rls.sql`) closes. Independent confirmation, from production's own advisor, that this is a real and current issue, not a stale audit claim.
- `WARN` breakdown: 43 "Signed-In Users Can Execute SECURITY DEFINER Function", 39 "Public Can Execute SECURITY DEFINER Function", 17 "Function Search Path Mutable", 5 "Extension in Public", 1 "Leaked Password Protection Disabled". The SECURITY DEFINER warnings are expected noise given the app's deliberate RPC-gated-write architecture (Supabase's advisor flags the pattern generically without parsing the internal `get_actor_org_role`/capability checks). "Function Search Path Mutable" (17 functions lacking `set search_path`) is real, low-severity hygiene debt, pre-existing and unrelated to the pending migrations — worth a dedicated P2 cleanup pass, not a deploy blocker. Not re-verified against e2e (out of scope for this pass — production is the deploy target).

## 9. Proposed production sequence (NOT executed)

1. **Pre-flight**: confirm via Vercel dashboard that production env vars target `apnbpcauqrjvkoleisde` (not e2e), and record current `latestDeployment` id (`dpl_CcspnU2Ft6qQ7xY3kfxCqQmnHL4M`) as the rollback target.
2. **Apply the 10 pending migrations to `apnbpcauqrjvkoleisde`, in this exact order** (matches both repo authoring order and e2e's proven live-apply order):
   1. `20260808000000_job_assignments_model`
   2. `20260810115335_allow_site_visit_undo_start_transition`
   3. `20260810120000_create_portal_service_request_rpc`
   4. `20260811030000_customer_safe_photo_visibility`
   5. `20260811040000_site_visit_customer_photo_visibility`
   6. `20260812010000_customer_staff_threaded_messaging`
   7. `20260812020000_customer_reply_capability`
   8. `20260813010000_customer_archetype_defaults_rls`
   9. `20260813020000_portal_customer_reported_urgency`
   10. `20260814010000_scheduling_conflict_detection`
3. **Structural verification** (read-only, immediately after migrations): re-run `list_migrations` against prod, confirm all 10 present and no error; re-run the security advisor, confirm the `customer_archetype_defaults` `ERROR` is gone.
4. **App deployment**: redeploy `premier-crm-web` from `main` @ `b859217` (already the case for the merge itself — confirm the next production deploy picks up this exact commit) so app code and schema move together. Given `create_job_with_schedule`/`job_assignments` app-code paths already exist on `main`, do not deploy app code referencing these RPCs ahead of the migrations — migrations first, in the same change window.
5. **Production-safe smoke checks** — see §10.

## 10. Smoke-check plan (designed, not executed)

Read-only or fully-reversible-via-UI checks only — no destructive production E2E:

- Confirm `get_project`/`list_migrations` show all 10 new migrations applied, no drift.
- As an existing owner/admin staff account: load a job detail page, confirm crew-assignment UI renders (validates `job_assignments` SELECT + RLS).
- As the same account: open the portal-messages staff inbox view for an existing customer thread (there won't be any yet — that's expected and fine, an empty-state render is sufficient to prove the query path doesn't error).
- As a test/sandbox customer portal account (not a real customer): submit one throwaway service request via the portal, confirm it appears staff-side, then leave it — do not delete via SQL (respect immutability/audit-log expectations); if cleanup is wanted, do it through the product's own staff UI in a follow-up, not this smoke pass.
- Confirm `get_advisors` (security) no longer lists `customer_archetype_defaults` as RLS-disabled.
- Confirm `get_runtime_errors` (production, since deploy time) shows no new error clusters beyond the pre-existing benign refresh-token one.
- Explicitly **do not**: call `create_job_with_schedule` with real crew/customers as a "test," do not publish/unpublish a real customer's photo, do not send a real staff reply to a real customer thread as a smoke test.

## 11. Rollback / recovery notes

- All 10 pending migrations are additive or narrowly corrective — no destructive rollback is anticipated to be *needed*. If a specific migration must be reverted, only #8 (`customer_archetype_defaults_rls`) and #7 (`customer_reply_capability`, which narrows an authorization check) change existing behavior; the other 8 add new tables/columns/functions that simply go unused if the corresponding app code isn't deployed.
- Standard Supabase migration rollback is manual (no automatic down-migrations in this repo's convention) — a revert would mean authoring a new forward migration that undoes the specific change, per this repo's "migrations are immutable, never edit, always add new ones" convention (see `CLAUDE.md`).
- App-side rollback: revert the Vercel production deployment to `dpl_CcspnU2Ft6qQ7xY3kfxCqQmnHL4M` (current, pre-#147) if the new app code misbehaves post-migration — the migrations themselves are backward-compatible with the old app code (purely additive), so this is safe to do independently of a schema rollback.

## 12. Backlog refresh

`docs/implementation/v1-known-gaps-audit.md` (last full pass, sourced through commit `dfde682`, pre-#137) is **stale in three places** it wasn't updated after later same-day fixes landed:

- Line 33 ("Customer-safe site photo visibility not built") — **resolved** by pending migrations #4/#5, not yet marked resolved in the doc.
- Line 30 ("No staff-reply message thread") — **resolved** by pending migration #6/#7, not yet marked resolved.
- Lines 95/105 ("Job logs and job photos are internal-only... no visibility column exists") — **resolved** by the same #4/#5, not yet marked resolved.

Everything else in that document (scheduling conflict, job-crew atomic creation, portal urgency, archetype RLS, CP-4 capability model, F2/F7 findings) is already correctly marked `RESOLVED` and matches what was independently re-verified in this audit.

**Current P0/P1 count, adjusted for the above** (not yet reflected in the source doc — recommend updating it in a follow-up docs-only change):
- **P0: 1** — Google Maps/Routing, unverified live key (§6). Unchanged.
- **P1: ~8** (down from the doc's stated 11, once the 3 stale entries above are marked resolved) — remaining open P1s are: Directions "Calculate route" UI trigger (depends on Maps key), priority-marker visual distinction (depends on Maps key), the four legacy route families, and the recurring mobile-overflow word-break utility gap. Per your explicit instruction, none of the last three were touched or investigated further in this pass.

## 13. Verdict

**GO-WITH-CONDITIONS.**

Repository main (`b859217`, containing PR #147) is clean, well-hardened, and has no unexpected drift against either `premier-crm-e2e` or `premier-crm-prod`. All 10 production-pending migrations are additive/safe, already proven live on e2e in the correct order, and one of them closes a real, currently-live production security gap (`customer_archetype_defaults` RLS, independently confirmed via production's own advisor). Storage is already correctly and identically provisioned. Generated types match the intended post-deploy schema (not current production — expected and non-blocking).

Conditions before executing §9:
1. Confirm production Vercel env vars actually target `apnbpcauqrjvkoleisde` (not independently verifiable via available tools this pass).
2. Explicit go-ahead from you to actually apply the 10 migrations and redeploy — **not done as part of this audit**, per your instruction.
3. Google Maps P0 remains open and unrelated to this deploy — does not block the migration/deploy sequence above, but should not be described as resolved.

---

## 14. Post-deployment addendum (production promotion executed)

Sections 1–13 above are the pre-deployment audit, left as originally written. This addendum records what actually happened when the conditions in §13 were met and the sequence in §9 was executed.

**Result**: all 10 migrations applied to `apnbpcauqrjvkoleisde` individually with a structural checkpoint after each (table/index/RLS/RPC/grant verification, and for the security-relevant ones, exact role-matrix verification). No error, no improvised hotfix. Post-migration: production and repository migration history match **89/89 with zero logical drift**. Security advisor's `customer_archetype_defaults` `ERROR` finding closed immediately. Storage bucket unchanged (still private). All pre-existing row counts unchanged (`vault_items`=3, `service_requests`=6, `jobs`=3, `customer_archetype_defaults`=7). Deployed SHA: `3de84346c8a227f88dde5cff0bde78939a52d929`.

### Release-sequencing hazard discovered during this deployment

Vercel's GitHub integration auto-deploys to production on every push to `main` — confirmed via `list_deployments`: the production deployment built from `3de84346c8a227f88dde5cff0bde78939a52d929` (containing PR #147's scheduling/job-assignment app code) was already `READY` and serving traffic **before** this session applied the corresponding 10 production migrations. There is no CI/CD coupling between "migrations applied to production" and "app code deployed to production" in the current setup — no GitHub Actions workflow exists (`.github/workflows/` is absent) and `apps/web/vercel.json` has no `ignoreCommand` or other deploy gate.

This created a real window — app code live, referencing `job_assignments`, `communication_threads`, `get_scheduling_conflicts()`, etc. before those objects existed in production — where any user exercising those code paths (e.g. assigning crew via `create_job_with_schedule`) would have hit a hard database error (missing table/function), not a graceful degradation. The window closed when migrations completed in this session; no runtime errors were observed during it (confirmed via `get_runtime_errors`), but that is closer to lucky timing than a property of the process.

**This must not become the normal release process.** The root cause is structural: migrations and app deploys are two independently-triggered systems (Supabase MCP/CLI vs. Vercel's Git integration) with no ordering guarantee between them, and the current runbook (used for PR #147) applied migrations *after* the PR merged — exactly backwards, since merging to `main` triggers the deploy immediately.

**Smallest reliable fix, available today with zero infrastructure changes**: invert the runbook order. For any release that includes schema-dependent app code:
1. Merge the release candidate PR to a *staging point* — in practice, since this repo has no separate staging branch, this means: finish code review and get the PR to a mergeable, approved state, but do not click merge yet.
2. Apply and verify the corresponding production migrations first, against the still-unmerged PR's `supabase/migrations/` files (exactly as done in this session, just reordered relative to the merge).
3. Verify schema/security (advisor, structural checks) — as done in this session.
4. Merge the PR. Vercel's auto-deploy fires immediately and is now safe, because the schema it needs already exists.
5. Verify deployment (runtime errors, route health).
6. Smoke test.

This requires no Vercel configuration change and no new tooling — only a discipline change in the order operations happen in, and it directly matches the order you specified as preferred. The cost: migrations must be identified and applied from the PR branch before it's merged, which means a human (or agent) has to look at the diff pre-merge rather than post-merge — a small process overhead, not an infrastructure one.

**Stronger fix, requires your explicit approval before implementing (not done here)**: Vercel supports an "Ignored Build Step" (a custom command evaluated before each deploy; a non-zero exit skips the deploy). A `vercel.json` `ignoreCommand` could hold production deploys on a manual gate (e.g., only deploy when a marker file/commit trailer is present, flipped once migrations are confirmed applied) — turning step 4 above from "trust the order of operations" into "the platform enforces it." This is a real config change to `apps/web/vercel.json` and/or Vercel project settings, and per your instruction it is not applied — flagged here as the natural next step if the manual-ordering discipline above proves insufficient in practice.

No Vercel configuration was changed as part of this session.

### Exact backlog reconciliation (post-deployment)

The prior §12 count ("P1: ~8") was an approximation and is superseded by this exact list. Each item below is classified against actual production usability, not treated as an automatic launch blocker by virtue of being P1-labeled in the source audit.

**LAUNCH BLOCKER (2)**
1. **Google Maps credential status is unconfirmed** (§ below) — if genuinely missing, this is the sole outstanding P0. Route Planning (`/routes`) is built but has never been exercised against a real key; the product's own V1 scope treats live Maps/Geocoding as part of the intended route-planning feature, not an optional extra.
2. **Directions "Calculate route" UI trigger** — the adapter exists but nothing calls it. Classified as launch-related *only* because it's the same Maps/Route-Planning feature as item 1, not an independent gap. Implement only after live Maps/Geocoding are proven, using the existing adapter (no new routing provider).

**PRE-V1 QUALITY / folded into the Maps work, not separate (1)**
3. **Priority-marker visual distinction, live-verified** — this is a verification step inside the Maps live-check, not a standalone feature gap. It either passes as part of item 1's live verification or it doesn't; there is no separate implementation work here.

**POST-V1 (2)** — agreed: these are cleanup/hygiene, not launch blockers, unless a concrete functional break is found.
4. **Four legacy route families** (`activity-logs`, `settings`, `site-photos`, `today` under `(app)/(legacy)/`) — architectural/presentational inconsistency (missing `ForgeShell` chrome), not a reported functional break. No evidence surfaced in this session that these pages are broken; deferred post-launch.
5. **Shared mobile-overflow word-break utility/lint rule** — a process gap (no guard against the *next* instance of a recurring bug class), not an existing unfixed defect. Deferred post-launch; individual overflow defects should be fixed as found, not blocked on building the general tooling first.

**RECLASSIFIED OUT OF THE P1 LIST ENTIRELY (1)**
6. **Customer-visible job logs** (`activity_log` exposed to the portal) — distinct from customer-visible *photos* (`vault_items.customer_visible`, which shipped in this deployment). No portal lifecycle requirement was found in this session that depends on staff-log visibility specifically — customers already have requests, appointments, jobs, quotes, invoices, threaded messaging, and published photos as their portal surface. Reclassified **post-V1**, matching your assessment; nothing in the product's current V1 scope documentation requires it.

**Exact counts after reclassification**:
- **P0 (launch blocker): 1** — Google Maps credentials + live verification (items 1–3 above are one blocker, not three).
- **P1 (should complete before V1, but not a hard blocker): 0** — nothing remaining meets this bar once Maps is resolved one way or the other.
- **P2/P3 (post-V1): 3** — legacy route families, mobile-overflow tooling, customer-visible job logs.

This matches your read: the real remaining launch work is Maps (credential status + live verification, and the Directions trigger as part of that same feature) plus the still-outstanding authenticated smoke pass — not "five P1s."
