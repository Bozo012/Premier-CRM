# Production Cleanup — 2026-08-01/02

**Timestamp:** 2026-08-02 (executed after the 2026-08-01/02 request-flow walkthrough and Milestone A live verification)
**Branch:** `fix/auth-confirm-route`
**HEAD SHA at execution time:** `113fc793246b1e61f734e05a7a4a53ab363ca4dc`
**Deployed production commit SHA:** `81dd9da879169df4d8ccca7fa9e02ccb72e92db9` (merged via PR #79, `fix(auth): add the missing /auth/confirm route handler`)
**Production project ref:** `apnbpcauqrjvkoleisde` (`premier-crm-prod`)
**Purpose:** Production Stabilization Cleanup

## Scope

Two explicit approvals were required and both were granted before any deletion ran:

- **Approval A** (granted first): delete all Group 3 smoke-test/dev artifacts — 6 non-Jobber customers, 4 test properties, 5 service requests, 8 estimates, 4 quotes, 2 jobs, 1 non-paid test invoice, 2 change orders and their revisions/line items/comments, 1 job deposit, 1 scheduling slot + booking, 2 customer_accounts, all associated `activity_log` rows.
- **Approval B** (granted mid-execution, as an explicit change of decision after a real FK blocker was found and execution paused to ask): delete the $2.00 **paid** smoke-test invoice (`INV-000014`) and its entire dependent audit/provenance chain — the payment, the change order (`f6836d35…`, status `incorporated`) whose revision (`f17c5627…`) the invoice's line item referenced via `source_change_order_revision_id`, that revision's line items/comments, and all related `activity_log` rows. This chain was explicitly approved for deletion **because it was confirmed smoke-test data (trivial $2.00 amount, created on the smoke-test day, tied to the `PROD_SMOKE_20260731` test customer/job), not legitimate business history** — normally financial records are never deleted (see `docs/CLAUDE_CONTEXT.md`'s production-safety rules), and this was a one-time, explicitly and separately approved exception, not a precedent for future cleanups.

## Why deletion was necessary rather than nulling/detaching

The user's explicit instruction was: "Do not null references or detach history. Delete the whole smoke-test chain cleanly in FK-safe order." No partial/soft approach (e.g. voiding the invoice, orphaning the change order) was used.

## Entity types removed (explicit ID lists, no broad `WHERE` clauses used)

| Entity | Count removed | Notes |
|---|---|---|
| `customers` | 6 | Zero overlap with the 38 `jobber_import` customers — cross-checked before and after |
| `properties` | 4 | 3 fully test-owned properties + 1 property link from a legitimate Jobber customer (`c723b299…`) to a test property; the Jobber **customer** record itself was untouched |
| `customer_properties` | 4 | Links for the above |
| `service_requests` | 5 | All non-Jobber-lineage |
| `estimates` | 8 | All non-Jobber-lineage |
| `quotes` | 4 | Zero Jobber lineage |
| `quote_line_items` | 1 explicit + cascaded | 1 row explicitly deleted (referenced by `job_id`, blocking job deletion); remainder cascaded with their parent quotes |
| `jobs` | 2 | "Test job" and "Gutter cleaning" |
| `invoices` | 2 | The non-paid test invoice (Approval A) + the $2.00 paid invoice (Approval B) |
| `invoice_line_items` | 1 | The $2.00 invoice's single line item |
| `payments` | 1 | The $2.00 cash payment |
| `change_orders` | 2 | Draft (`61bd3616…`) + incorporated (`f6836d35…`, Approval B) |
| `change_order_revisions` | 2 | Cascaded `change_order_line_items` with them |
| `change_order_comments` | 1 | |
| `job_deposits` | 1 | Waived deposit on "Gutter cleaning" |
| `scheduling_slots` | 1 | |
| `scheduling_slot_bookings` | 1 | Already cancelled from a prior session's cleanup |
| `customer_accounts` (portal) | 2 | Both remaining test portal logins |
| `activity_log` | 12 | All current rows — every one traced to a job/quote/change_order/estimate already in this table |
| `auth.users` | 1 | `kevinsommers+prodverify@ppmnky.com`, deleted via Supabase Admin API (`auth.admin.deleteUser`) in a temporary, immediately-deleted script — never the real staff login `kevinsommers@ppmnky.com`, which was preserved |

## Before / after counts

| Table | Before | After |
|---|---|---|
| `customers` | 44 | 38 |
| `properties` | 47 | 43 |
| `jobs` | 2 | 0 |
| `invoices` | 2 | 0 |
| `payments` | 1 | 0 |
| `service_requests` | 5 | 0 |
| `estimates` | 8 | 0 |
| `quotes` | 4 | 0 |
| `customer_accounts` | 2 | 0 |
| `change_orders` | 2 | 0 |
| `change_order_revisions` | 2 | 0 |
| `job_deposits` | 1 | 0 |
| `scheduling_slots` | 1 | 0 |
| `scheduling_slot_bookings` | 1 | 0 |
| `activity_log` | 12 | 0 |
| `quote_line_items` | (n/a, not separately tracked before) | 0 |
| `invoice_line_items` | 1 | 0 |
| `organizations` | 1 | 1 (untouched) |
| `org_members` | 4 | 4 (untouched) |

All after-counts match the exact targets the cleanup was required to hit.

## Execution notes (FK ordering, corrected live during execution)

The first two execution attempts failed on real FK constraints and were rolled back cleanly (verified via count re-queries showing zero partial deletion each time) before a third, corrected attempt succeeded:

1. `invoice_line_items_source_change_order_revision_id_fkey` — the $2 invoice's line item had to be deleted before its referenced change-order revision.
2. `jobs_origin_quote_id_fkey` / `quotes_has_job_or_estimate` check constraint — `jobs.origin_quote_id` and `quotes.job_id` form a circular reference; `jobs.origin_quote_id` had to be explicitly nulled before quotes could be deleted (deleting the job first would have triggered an `ON DELETE SET NULL` on `quotes.job_id` that violated the `quotes_has_job_or_estimate` check constraint, since these test quotes had no `estimate_id`).
3. `quote_line_items_job_id_fkey` — one quote-line-item row was explicitly deleted before job deletion because it referenced `job_id` directly (not only `quote_id`, which would have cascaded).

Final order used: null `change_orders.current_revision_id` → null `jobs.origin_quote_id` → `activity_log` → `invoice_line_items`/`payments`/`job_deposits`/`scheduling_slot_bookings`/`scheduling_slots` → `invoices` → `change_order_comments`/`change_order_revisions`/`change_orders` → explicit `quote_line_items` row → `quotes` → `jobs` → `estimates` → `service_requests` → `customer_properties` → `customer_accounts` → `customers` → `properties`.

## Confirmations

- Only the approved, explicitly-ID-listed rows were removed — no broad `WHERE` clause was used anywhere in the deletion transaction.
- Zero overlap: all 38 `jobber_import` customers and all 43 Jobber-linked properties (including the 41 that remain unlinked from the original import gap — that gap is pre-existing and unrelated to this cleanup) were confirmed present, unmodified, before and after.
- No Jobber customer or property record was modified, renamed, archived, or reconciled.
- The $2.00 invoice/payment/change-order chain was explicitly approved for deletion (Approval B) because it was confirmed smoke-test data, not legitimate business history — see Scope above.
- Post-cleanup FK integrity verified directly: zero orphaned `customer_properties`, `quote_line_items`, `invoice_line_items`, or `change_order_line_items` rows.
- `organizations` (1) and `org_members` (4) were untouched throughout.
- Core dashboard aggregate query (`customers`/`properties`/`jobs` counts) confirmed returning clean values post-cleanup: 38 / 43 / 0.

## Not part of this cleanup

- The raw-`datetime-local`-in-description small bug in the public request-intake API remains open, queued separately (see the roadmap plan file's "Small bugs queued for the next focused implementation pass" section) — unrelated to this cleanup.
- The site-visit/inspection workflow gap (Phase 3.5) remains a scheduled core-lifecycle phase, not touched by this cleanup.

---

# Addendum — Full Jobber-import purge (2026-08-02, second scope change)

**Change of decision, explicit and in full**: the 38 `jobber_import` customers and 43 Jobber-linked properties described above as "legitimate business history" and "preserve, untouched" were **reclassified by the user as legacy Jobber-import/test data, not trusted production history, and explicitly approved for full deletion.** This addendum documents that second, later, and broader purge — it does not retroactively change the record of what the first cleanup pass (above) did or why; it records a genuinely new decision.

## Pre-deletion inventory (refreshed 2026-08-02, after the first cleanup pass)

All business-lifecycle tables were already at 0 from the first cleanup pass (`jobs`, `invoices`, `payments`, `service_requests`, `estimates`, `quotes`, `quote_line_items`, `customer_accounts`, `change_orders`, `change_order_revisions`, `change_order_comments`, `job_deposits`, `scheduling_slots`, `scheduling_slot_bookings`, `activity_log`, `communications`, `tasks`, `vault_items`, `user_prompts`, `customer_location_prefs` — all confirmed 0 immediately before this purge). The only remaining rows anywhere in the customer/property dependency graph were:

- **`customers`**: 38 rows, all `source = 'jobber_import'`, `jobber_id` null on every row (natural-key-fallback import, as previously documented). Full ID list captured in the execution transaction below.
- **`properties`**: 43 rows. Full ID list captured in the execution transaction below.
- **`customer_properties`**: 2 rows, both linking customer `d274193f-cdc2-4d48-acae-a64c39bbf257` ("Kevin Sommers", `jobber_import`) to properties `93cf0188-5fe2-46d2-b742-da4f4f8957c2` and `cf370d3c-91be-473c-92b4-37ff3235abfc`. (The other 41 properties were already unlinked — a pre-existing Jobber-import data-quality gap, not something this purge caused.)
- `customers.referred_by_id` (self-referencing FK): confirmed 0 rows with a non-null value — no internal customer→customer references to break first.

## Dependency scan (every FK referencing `customers` or `properties`, queried directly from `information_schema`)

Confirmed via direct catalog query, not assumption:

| Referencing table | Column | Rows found |
|---|---|---|
| `change_order_comments`, `change_order_revisions`, `change_orders`, `communications`, `estimates`, `jobs`, `scheduling_slot_bookings`, `service_requests`, `tasks`, `user_prompts`, `vault_items`, `quote_line_items` | various customer_id/property_id columns | **0 in every table** — all already emptied by the first cleanup pass |
| `customer_accounts` | `customer_id` | 0 |
| `customer_location_prefs` | `customer_id` | 0 |
| `customer_properties` | `customer_id`, `property_id` | 2 (enumerated above) |
| `geofences` | `property_id` | 4 rows exist, but **all 4 have `property_id = null`** — they are org-level supplier waypoints (Home Depot, Lowe's, Menards — Florence; Lowe's — Walton), infrastructure config unrelated to any customer/property record. **Excluded from this purge, preserved.** |

No orphaned import-metadata, notes, contacts, or attachment tables exist in this schema beyond what's listed above — the full `information_schema` table list was reviewed (`docs/production/cleanup/` addendum authoring session, 2026-08-02) and no additional customer/property-shaped tables were found.

## Confirmed exclusions (verified directly, not assumed)

- Kevin's real staff auth user (`234ecd59-0003-4e68-bc21-df8a3535d7bb`) and the 4 legitimate `org_members` rows (`aaf3f37b…` owner, `4b730124…` admin, `fc872f36…`/`c515bf40…` employees) — none of their `user_id`s intersect the customers/properties ID space (customers/properties have no FK to `auth.users`; the only such link, `customer_accounts`, was already 0). **Confirmed excluded.**
- `organizations` (1 row, Premier Property Maintenance LLC), `website_settings`/`website_promotions`/`website_service_highlights` (0 rows each — no configured content to lose), `automation_rules` (12 rows, org-level rule definitions, not customer-specific), `org_invites` (7 rows, staff invite history), `user_profiles` (5 rows), schema/migrations/RLS/permissions. **Confirmed excluded, untouched.**

## Approval

The user explicitly stated: *"The 38 Jobber-imported customers and 43 Jobber-imported properties are not being treated as legitimate production history anymore. They are legacy import/test data from an earlier Jobber experiment and are explicitly approved for deletion."* This is recorded here as the explicit, standalone approval for this second, broader purge — a genuine change of decision from the first cleanup pass, not an extension of Approval A/B above.

## Execution (FK-safe order used)

1. `customer_properties` — 2 rows, deleted by explicit `(customer_id, property_id)` pair.
2. `customers` — 38 rows, deleted by explicit ID list.
3. `properties` — 43 rows, deleted by explicit ID list.

No broad `WHERE` clause was used; both ID lists were enumerated and reviewed before the transaction ran.

## Before / after counts (this purge only)

| Table | Before | After |
|---|---|---|
| `customers` | 38 | **0** |
| `properties` | 43 | **0** |
| `customer_properties` | 2 | **0** |
| `customer_accounts` | 0 | 0 |
| `service_requests` / `estimates` / `quotes` / `jobs` / `invoices` / `payments` / `job_deposits` / `scheduling_slots` / `scheduling_slot_bookings` / `change_orders` / `activity_log` | 0 (all already 0 from the first cleanup pass) | 0 |
| `organizations` | 1 | 1 (untouched) |
| `org_members` | 4 | 4 (untouched) |
| `geofences` | 4 | 4 (untouched — org infrastructure, no property linkage) |

## Post-purge verification

- Zero FK orphans: re-ran the same `information_schema`-driven dependency scan post-deletion — no referencing rows remain anywhere.
- `organizations` = 1, `org_members` = 4, both unchanged in content (not just count) from before the purge.
- Kevin's real staff login (`kevinsommers@ppmnky.com`) — auth user untouched, not part of any deleted table.
- Dashboard/core-page aggregate queries return zero business records cleanly (no error, no fabricated stats).
- Production is now a true blank slate for customer/property/workflow data: platform, organization, staff, schema, migrations, RLS, permissions, branding, and infrastructure (including the 4 supplier geofences) are the only things that remain.

## Not part of this purge

- Site-visit workflow (Phase 3.5), Premier CRM Demonstration organization (Phase 3), and Brandon's onboarding remain **not started**, per explicit instruction to stop after this purge is verified and await approval before continuing.
