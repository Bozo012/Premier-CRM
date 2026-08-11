# Customer-Safe Photo Visibility — Security-Model Design Audit

Status: **architecture/security review only. No code, migration, or storage-policy change was made to produce this document.**

Scope: design the smallest safe model for staff to deliberately expose selected job/property/service media to the authenticated customer portal, without leaking internal-only media. Current V1 posture at the time of this audit: P0 1 (Google Maps live credential verification), P1 11, P2 22, P3 14 — see `docs/implementation/v1-known-gaps-audit.md`.

---

## 1. Current media architecture

All photo/document media in the product flows through one table, `vault_items` (`supabase/migrations/0003_vault_and_comms.sql`), extended over time by four later migrations:

- `0003_vault_and_comms.sql` — base table. `type` enum includes `'photo'` among 14 kinds (recording, transcript, note, document, receipt, etc.). Entity links: `customer_id`, `property_id`, `job_id`, `phase_id`, `communication_id` — all nullable, all independent FKs, no constraint enforcing exactly one is set.
- `20260802010700_vault_items_and_activity_log.sql` — adds `site_visit_id`, `estimate_id`, and `storage_object_key` (unique, supports idempotent finalize-retry).
- `20260731160000_scheduling_and_portal_boundary.sql` — adds `change_order_revision_id`.
- `20260805075928_forge_expenses_foundation.sql` — adds a **separate, expense-scoped** visibility precedent (see §9).

**Only one real upload pipeline exists today** (site-visit/estimate/job photos), built in the Request→Site-Visit→Estimate workflow slice and reused unchanged by Jobs:

1. `requestPendingUpload()` (`packages/db/queries/vault-items.ts`) — runs with the **user's own session client**, so RLS enforces org membership. Validates MIME/size, verifies the target job/site_visit/estimate belongs to the caller's org, enforces a 20-photo-per-entity cap, inserts a `pending_uploads` row, and returns a **signed upload URL** into `{org_id}/pending/{upload_id}`.
2. Client uploads directly to Storage using that signed URL (`_components/photo-upload.tsx`, `add-job-photo-form.tsx`).
3. `finalizeSiteVisitUpload()` (`apps/web/lib/site-visit-attachments.ts`) — **service-role only**, the sole path that ever writes to the permanent object location. Downloads the pending object, decodes it with `sharp` (never trusts declared MIME/extension), strips all EXIF/GPS, re-encodes as JPEG, writes to the deterministic permanent path `{org_id}/{entity_type}/{entity_id}/{uploadId}.jpg`, inserts the permanent `vault_items` row, marks the pending row finalized, deletes the pending object.

Entry points into this pipeline today, by parent type:

| UI surface | Entity type passed | Parent FK set on vault_items |
|---|---|---|
| Job detail → "Add photo" (`add-job-photo-form.tsx`, `jobs/actions.ts`) | `job` | `job_id` |
| Site visit photo upload (`site-visits/_components/photo-upload.tsx`) | `site_visit` | `site_visit_id` |
| Inspection `photo_list` field (`inspection-field-editor.tsx`) | `site_visit` (same pipeline; the vault_item id is stored inside the inspection response JSONB as `{vaultItemId, caption}`, not via a distinct FK) | `site_visit_id` |
| Estimate photos (`new-estimate-form.tsx`) | `estimate` | `estimate_id` |

**Not found anywhere in the repo**: property photos (no upload path), service-request attachments (service_requests has no photo/attachment path — only requests, not attachments, exist), quote/invoice media, or any customer-facing upload path. `change_order_revision_id` exists as a column but **no application code reads or writes it** — it is schema-only, dormant. `properties.location GEOGRAPHY(POINT,4326)` is similarly unused by any current code.

**Current read paths** (both staff-only, both server components using the service-role client scoped manually by `org_id` + parent id, generating signed URLs at render time via `getSignedReadUrl()`, 300s default expiry):
- `apps/web/app/(app)/(legacy)/site-photos/page.tsx` — flat org-wide photo grid.
- `apps/web/app/(app)/(forge)/jobs/[jobId]/page.tsx` — per-job photo section.

**Customer portal**: a repo-wide search of `apps/web/app/portal` for `vault_item`/`VaultItem` returns **zero matches**. There is no customer photo read path anywhere today — confirms the stated gap exactly.

## 2. Storage bucket / security model

One bucket exists in production (verified directly, read-only, against `apnbpcauqrjvkoleisde`):

```
id: site-visit-attachments, public: false, file_size_limit: 15728640 (15MB),
allowed_mime_types: [image/jpeg, image/png]
```

Policies on `storage.objects` (`20260802010800_site_visit_attachment_storage.sql`):
- `site_visit_attachments_select_own_org` — SELECT gated by `user_is_in_org(org_id_from_path)`. **Staff only, no customer grant.**
- `site_visit_attachments_insert_pending_own_org` — INSERT restricted to the caller's own org's `pending/` prefix only.
- **No INSERT policy exists for the permanent path at all** — only the service-role finalize step (which bypasses RLS) can write there.
- No client DELETE policy on storage at all.

This is already the preferred model the brief asks for: **private bucket + short-lived signed URLs generated only after server-side authorization.** No public bucket, no public URL, no guessable-path exposure — the bucket is private and object paths are UUIDs, not decodable to a public route. Signed URLs are 300s by default (`getSignedReadUrl`), generated at render time from server components that have already applied their own org-scoping — i.e. authorization happens before URL generation, matching the required order.

**One caveat to document, not fix here** (per the brief's instruction to document rather than treat as blocking): a signed URL, once issued, is a bearer credential — anyone holding the URL string can fetch the image until it expires, independent of further authorization checks. This is standard Supabase Storage behavior and is already true for the existing staff-only flow; extending it to the portal does not change this property, it only extends who can be issued a URL and under what condition. §8 below carries this forward explicitly for the customer path.

## 3. `vault_items` parent-link model — trustworthiness for customer scoping

| Parent type | FK on `vault_items` | Customer ownership trace | Existing customer RLS on the parent table? |
|---|---|---|---|
| `job` | `job_id` | `jobs.customer_id` (direct) | Yes — `customer_select_own_jobs` (`20260731160000_scheduling_and_portal_boundary.sql`) |
| `estimate` | `estimate_id` | `estimates.customer_id` (direct) | **No** — no customer SELECT policy exists on `estimates` today |
| `site_visit` | `site_visit_id` | `site_visits.service_request_id` → `service_requests.customer_id` (one join away — `site_visits` itself carries **no** `customer_id`) | **No** direct policy on `site_visits`; `service_requests` does have `customer_select_own_service_requests` |
| `customer_id` / `property_id` (set directly on the vault_item) | — | direct / via `customer_properties` | N/A — never actually set by the one real upload pipeline today (always NULL in practice) |
| `change_order_revision_id` | — | dormant, unused by any code | N/A |

Two real ambiguities exist and must be resolved explicitly rather than assumed:

1. **No CHECK constraint enforces "exactly one parent FK set."** In practice `insertFinalizedVaultItem()` only ever sets one of `job_id` / `site_visit_id` / `estimate_id`, and never sets `customer_id`/`property_id` — but that is a convention of one code path, not a database guarantee. A future or malformed row could carry more than one parent FK. The customer-safe query function must pick **one deterministic, explicit precedence** (proposed: `job_id` → `estimate_id` → `site_visit_id`, i.e. never trust `customer_id`/`property_id` directly on the item since no current writer sets them safely) and must not OR across multiple parent checks.
2. **`site_visit` is two joins from customer ownership**, not one, and neither intermediate table (`site_visits`) has its own customer RLS policy — the trace has to be done inside the centralized function's `EXISTS` clause explicitly, not inferred from an existing policy.

Both are solvable inside a single centralized SQL function (§6) — neither rises to "generic `related_ids` ambiguity" (there is no generic `related_ids` column on `vault_items` at all; every link is a real FK) and neither requires broad customer SELECT on `vault_items`.

## 4. Current staff permissions

Job photo upload is already capability-gated: `requestJobPhotoUploadAction` requires `hasCapability(role, 'canScheduleJobs')` (`owner`, `admin`, `employee`, `subcontractor`). The finalize step re-verifies the pending upload belongs to the caller's org before invoking the service-role finalize function. Site-visit/estimate photo upload uses the same underlying `requestPendingUpload`/`finalizeSiteVisitUpload` pair without an additional capability gate visible in this pass (worth confirming at implementation time, out of scope here).

The repo has an established, dual-enforced capability pattern (`packages/shared/permissions.ts` `CAPABILITIES` map + `role_has_capability()` SQL function in `20260802020000_capability_matrix.sql`, kept in sync by an automated parity test) used by every sensitive-mutation RPC (`book_scheduling_slot`, site-visit lifecycle RPCs, triage RPCs). Sensitive/customer-facing actions consistently land at `owner`/`admin` only: `canApproveEstimatePricing`, `canIssueRefunds`, `canApproveExpenses`, `canManageDeposits`, `canManageInspectionTemplates`.

**Decision (approved 2026-08-11, PR #141)**: `canPublishCustomerMedia` is scoped to `['owner', 'admin']` only — matching the existing pattern for actions that change what a customer is shown/charged (not `canScheduleJobs`'s broader `employee`/`subcontractor` set). Employees and subcontractors keep whatever upload/media capabilities they already have (`canScheduleJobs` governs adding job photos, unchanged by this design) but gain no authority to publish or unpublish media to the customer portal. Reason, as stated in the approval: customer publication is a distinct outward-facing authorization decision, not merely an operational media action — it is not a broader "media" capability, it is its own narrow one. This must be added to **both** `packages/shared/permissions.ts` and `role_has_capability()` in a new migration, per the existing parity discipline — a mismatch between the two would itself be a security defect. Expanding this scope later (e.g. to `employee`) requires its own explicit product decision, not an incidental change.

## 5. Current portal exposure

None. No RLS policy grants `authenticated` (customer) SELECT on `vault_items`; the only existing policy is `org_isolation_vault_items` (`user_is_in_org(org_id)`), which a customer-only auth user (no `org_members` row) fails by construction. `vault_items` is currently unreachable from the portal in every respect — RLS, storage, and application code all agree on this.

## 6. Recommended visibility model

**A single additive boolean is sufficient.** The media types actually in play (job/site-visit/estimate photos) are homogeneous enough — a photo is either fit for the customer to see or it isn't; there is no third state (e.g. "visible to some customers but not others," "visible after a delay") anywhere in the current product model. This mirrors, and is directly precedented by, an existing (currently unwired) field: `expenses.receipt_visibility` (`expense_receipt_visibility` enum, `'internal' | 'customer_visible'`, `NOT NULL DEFAULT 'internal'`, added in `20260805075928_forge_expenses_foundation.sql`, with staff-facing UI already built in `expenses/new/page.tsx`). That field was added in anticipation of exactly this need but was never wired to a customer read path (expenses has no customer RLS policy at all) — this design is the first slice that actually closes that loop, for photos specifically.

Proposed column:

```sql
alter table public.vault_items
  add column customer_visible boolean not null default false;
```

- **Additive.** No existing column changed or dropped.
- **False by default.** Every existing row (3 rows in production today) and every future row defaults internal-only. No retroactive exposure.
- **No inference from ownership.** `customer_visible` is orthogonal to `job_id`/`estimate_id`/`site_visit_id`/`customer_id`/`property_id` — a photo can belong to the customer's own job and still default to `false`.
- Type classification per the brief's A/B/C/D scheme, applied to what's actually in the repo today (no damage-documentation/technician-notes/receipt distinction exists in the data model — every `type='photo'` row today is a generic field photo with a free-text caption, so classification below is about *usage pattern*, not a data-level type the schema already distinguishes):
  - **B (potentially customer-safe after explicit publish)**: job photos, site-visit photos, estimate photos, inspection `photo_list` photos — all reachable today, none is currently distinguishable as "damage doc" vs. "presentable" except by the caption text and staff judgment. This is exactly why publish must be a deliberate per-photo staff action, not a type-based default.
  - **A (clearly internal, no publish UI needed for V1)**: none of the current `type='photo'` rows are structurally distinct from B — there is no separate "internal evidence" photo type in the schema today. If/when a distinct internal-only photo category is introduced (e.g. a dedicated inspection-finding type), it should default `customer_visible = false` and simply never be offered a publish control, which the boolean model already supports without changes.
  - **C (customer-originated)**: none exist — there is no customer upload path anywhere (§7).
  - **D (ambiguous)**: the dormant `change_order_revision_id`-linked and bare `customer_id`/`property_id`-linked rows — no current writer produces these, so no publish UI is needed for them in this slice; the column still defaults safely to `false` if any ever appear.

No public bucket, no globally-readable URL, no broad `vault_items` SELECT grant to `authenticated` customers is proposed or required.

## 7. Customer-uploaded photos

Confirmed: **no customer upload path exists anywhere in the repo today** — the one upload pipeline (`requestPendingUpload`/finalize) is only ever called from staff-side server actions (`jobs/actions.ts`, `site-visits/actions.ts`), never from anything under `apps/web/app/portal`. Per the brief's instruction, this slice does not add one. If a customer-upload path is built later, it is a separate design decision or open question, not a default answer produced by this one — one reasonable default worth recording for that future design is: staff should decide the default (a customer's own uploaded photo showing to themselves is trivially safe; whether it should also be visible in the *staff* internal view by default, and whether staff can later hide it from the portal, are both fair follow-up questions, not answered here.

## 8. Storage security — signed URL strategy

Preferred model (already the pattern for staff): **private storage, short-lived signed URLs, generated only after authorization succeeds.**

For the customer path specifically:
1. Portal page loads → calls the centralized customer-safe query (below) → gets back a list of `vault_items` rows the customer is authorized to see (already `customer_visible = true` AND parent-owned).
2. **Only then** does the server generate signed URLs for that exact, already-filtered set — the same `getSignedReadUrl()` helper, same bucket, same short expiry (300s, matching the existing staff default; no reason to diverge). No signed URL is ever generated for a row that hasn't already passed both checks.
3. As documented in §2, a signed URL remains valid for its full TTL once issued, independent of subsequent state changes (e.g. an unpublish that happens 30 seconds after a signed URL was handed to the browser). This is acceptable and should be explicitly accepted, not solved — 300s is short enough that this is a non-issue in practice, and solving it fully would require either public per-request proxying (added latency, added server surface) or extremely short TTLs (worse UX) for a risk that doesn't materially exceed "staff photo visible in an already-open browser tab" today.

No storage policy needs to grant customers direct Storage SELECT — the server always mediates by generating the signed URL server-side after its own authorization check, exactly like the existing staff pages. This avoids ever needing a `storage.objects` SELECT policy conditioned on `customer_accounts`, which would be considerably harder to get right (storage policies only see the object path, not `vault_items.customer_visible`).

## 9. Migration proposal (not applied)

```sql
-- Additive, default-false, no data migration, no backfill.
alter table public.vault_items
  add column customer_visible boolean not null default false;
```

- **Row count**: 3 rows in production today (verified read-only). Zero lock risk at any realistic near-term scale — `NOT NULL DEFAULT false` on a table this size is instantaneous even without considering Postgres 11+'s fast-default optimization for non-volatile defaults, which applies here regardless.
- **Generated types**: requires the standard `pnpm db:types` regeneration after the migration, per repo convention — not run in this audit.
- **Index**: **not proposed** — the brief requires proving need before adding one, and none exists yet. The customer-safe query is always scoped first by a specific parent id (job/estimate/site_visit), which is already indexed (`vault_items (job_id, occurred_at DESC) WHERE job_id IS NOT NULL`, similarly for `property_id`/`customer_id`); adding `customer_visible` as a secondary filter on an already-narrow row set needs no new index. If a future "all customer-visible photos across the org" admin view is built, that would be the point to measure and decide, not now.
- **RLS implications**: none required on `vault_items` itself for this design — see §6/§8 (mediation happens through a SECURITY DEFINER function, not a customer-facing SELECT policy on the table). This is a deliberate choice: a `vault_items` SELECT policy conditioned on `customer_visible = true AND <parent ownership>` would need to re-derive the same job/estimate/site_visit ownership branching *inside RLS*, which is harder to review, harder to test in isolation, and diverges from the "prefer RPC/server-action" pattern the brief itself asks to preserve when it already exists (§10 next).
- **New capability migration**: a second small migration adding `canPublishCustomerMedia` to `role_has_capability()`, paired with the `packages/shared/permissions.ts` change (§4).

## 10. Publish/unpublish authority — server-authoritative path

Per the brief and per the existing pattern (`book_scheduling_slot`, site-visit lifecycle RPCs, triage RPCs), **no client-side mutation directly against `vault_items`** for this field. A new pair of `SECURITY DEFINER` RPCs, following the established idiom exactly:

```sql
create or replace function public.publish_customer_visible_photo(p_vault_item_id uuid)
returns public.vault_items
language plpgsql security definer set search_path = public as $$
declare
  v_item public.vault_items;
  v_role public.user_role;
begin
  select * into v_item from public.vault_items where id = p_vault_item_id for update;
  if v_item.id is null then raise exception 'Photo not found.'; end if;

  v_role := public.get_actor_org_role(v_item.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canPublishCustomerMedia') then
    raise exception 'Role does not have canPublishCustomerMedia';
  end if;

  update public.vault_items set customer_visible = true where id = p_vault_item_id
  returning * into v_item;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  values (v_item.org_id, 'vault_item', v_item.id, 'photo_published_to_customer',
    'Photo made visible to customer.', auth.uid());

  return v_item;
end;
$$;
-- unpublish_customer_visible_photo is the mirror image: same guard, sets
-- customer_visible = false, logs 'photo_unpublished_from_customer'.
```

`REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated;` on both, matching every other RPC in the codebase. Neither RPC accepts `org_id` or `customer_id` as a parameter from the client — both are derived server-side from the row and `auth.uid()`, exactly like every existing RPC audited in §4.

## 11. Customer read authorization path — centralized function

Per the brief's explicit requirement, a single centralized function (not ad hoc per-page queries) proves both conditions before returning anything:

```sql
create or replace function public.list_customer_visible_photos(p_job_id uuid default null, p_estimate_id uuid default null)
returns setof public.vault_items
language sql security definer set search_path = public stable as $$
  select v.* from public.vault_items v
  where v.customer_visible = true
    and v.type = 'photo'
    and (
      (p_job_id is not null and v.job_id = p_job_id
        and exists (select 1 from public.jobs j join public.customer_accounts ca on ca.customer_id = j.customer_id
                    where j.id = p_job_id and ca.auth_user_id = auth.uid() and ca.status = 'active'))
      or
      (p_estimate_id is not null and v.estimate_id = p_estimate_id
        and exists (select 1 from public.estimates e join public.customer_accounts ca on ca.customer_id = e.customer_id
                    where e.id = p_estimate_id and ca.auth_user_id = auth.uid() and ca.status = 'active'))
      -- site_visit parent intentionally omitted from V1 scope — see note below
    );
$$;
grant execute on function public.list_customer_visible_photos(uuid, uuid) to authenticated;
```

Notes:
- This is a `SECURITY DEFINER` **function**, not a `vault_items` RLS policy — consistent with §9's reasoning. It takes an explicit parent id as a parameter (never a bare `vault_item_id` list, never `customer_id` from the browser) so there is no vault-item-id-enumeration surface: a customer can only ever ask "show me photos for *this job I already have a session-authorized reason to be looking at*," never "show me vault_item `<guess>`."
- `customer_can_read_photo = <owns parent record> AND vault_item.customer_visible = true`, exactly as specified — both conditions are in the same `EXISTS`/`WHERE`, not two separate checks a caller could satisfy independently.
- **Site-visit-linked photos are deliberately left out of the V1 function signature.** `site_visits` has no direct `customer_id` and no existing customer RLS policy; wiring it in requires one more join (`site_visits.service_request_id → service_requests.customer_id`) that is mechanically easy but was not exercised by any existing customer-facing code path in this repo, so it needs its own explicit verification pass rather than being folded in unreviewed. This is a scoping recommendation for the implementation slice, not a blocker for this design.
- Cross-org and cross-customer isolation both fall out of the same `EXISTS` clause automatically: a job/estimate belonging to a different org or a different customer's `customer_accounts` row simply never matches, with no separate cross-org check needed.

## 12. Deletion / unpublish semantics

- **Publish → Unpublish**: `unpublish_customer_visible_photo` flips `customer_visible` back to `false`. Because `list_customer_visible_photos` filters on `customer_visible = true` live, on every call, the photo is excluded from **the very next** portal query — no caching layer sits in front of this function today, so "immediately remove from future portal queries" is satisfied by construction, not by an extra invalidation step.
- **Existing signed URLs may remain valid until their 300s expiry** even after unpublish — documented and accepted in §8, not solved.
- **Deletion**: this design does not change any existing deletion/archival behavior for `vault_items` (there is no delete path in the current codebase for finalized items — only pending-upload rejection/expiry). If a delete feature is added later, it should naturally remove customer visibility as a side effect of removing the row entirely; no special-casing is needed for `customer_visible` specifically.
- **Publication state is never encoded in the filename or storage path** — `customer_visible` lives only in the `vault_items` row; storage paths remain `{org_id}/{entity_type}/{entity_id}/{uploadId}.jpg` unchanged.
- **Activity log**: yes, recommended and shown in §10 (`photo_published_to_customer` / `photo_unpublished_from_customer`, `entity_type = 'vault_item'`) — this matches the existing `activity_log` pattern exactly (plain-text `entity_type`/`event_type`, no schema change needed, already used by every other RPC in the codebase for auditability of exactly this class of state change).

## 13. Staff UI proposal (not implemented)

On Job Detail → Photos (and equivalently on any future estimate/site-visit photo view):
- Each existing photo thumbnail gains an explicit, always-visible state indicator — text label, not icon-color-only: **"Internal"** or **"Visible to customer."**
- A control on each photo (button or toggle, gated client-side by `hasCapability(role, 'canPublishCustomerMedia')` matching every other capability-gated control in the codebase, and re-checked server-side by the RPC regardless): **"Publish to customer"** / **"Remove from customer portal."**
- No bulk-publish control proposed for V1 — matches "explicit, deliberate, per-photo" from the brief; a bulk action would dilute the deliberateness the security principle asks for.

## 14. Portal UI proposal (not implemented)

- The Photos section on a portal job/estimate view renders **only if `list_customer_visible_photos` returns at least one row** — no empty-state photos section, no "0 photos" placeholder that implies more exist.
- **No internal-photo count anywhere.** No "3 more internal photos," no total-photo-count that would differ from the visible count. The customer's view has no signal that hidden media exists at all — matching the security principle's framing that customer ownership and publication visibility are separate, and the customer should never be able to infer the existence of what they can't see.

## 15. E2E test plan (for premier-crm-e2e, not written in this pass)

All against the RPCs/function above, with direct RPC/API calls in addition to UI assertions, per the brief:

1. A newly finalized photo has `customer_visible = false` by default (direct row check after `finalizeSiteVisitUpload`, no publish call made).
2. An `owner`/`admin` session can call `publish_customer_visible_photo` successfully; row flips to `true`.
3. An `employee`/`subcontractor`/`viewer` session calling `publish_customer_visible_photo` is rejected (`role_has_capability` false) — direct RPC call, not just UI-hidden-button.
4. After publish, the owning customer's session (`loginAsPortalCustomer`, matching the pattern in `portal-request-creation-bot.spec.ts`) sees the photo via `list_customer_visible_photos(jobId, null)`.
5. An unpublished photo on the same job does not appear in that same call.
6. A **different** customer, with their own active `customer_accounts` row but no relationship to this job, calling `list_customer_visible_photos` with this job's id gets zero rows back.
7. A user authenticated against a **different org entirely** gets zero rows back for the same job id (org isolation).
8. A customer session directly attempting `update vault_items set customer_visible = true ...` (bypassing the RPC) fails — no direct customer UPDATE grant/policy exists on `vault_items` in this design; this is the direct-write regression proof, mirroring test 6 in `portal-request-creation-bot.spec.ts` for `service_requests`.
9. A customer session calling `list_customer_visible_photos` with an arbitrary/guessed job id they don't own returns zero rows — proves no enumeration path.
10. Unpublish (`unpublish_customer_visible_photo`) immediately removes the photo from a subsequent `list_customer_visible_photos` call within the same test (no caching).
11. Existing staff-side photo views (`site-photos`, job detail) still show **both** internal and published photos, unfiltered by `customer_visible` — proves this slice doesn't regress staff visibility.
12. A signed URL for a customer-visible photo is only ever generated in test code **after** `list_customer_visible_photos` has already returned the row — structurally enforced by the design (§8), verified by asserting the portal page's server code calls `list_customer_visible_photos` before `getSignedReadUrl`.
13. After delete/unpublish, refreshing the portal page does not show a stale/cached photo (server component re-fetches on every request, no client cache to bust).
14. Full fixture teardown, zero residue — matching every existing E2E fixture pattern in this repo (`portal-request-creation-bot.spec.ts`'s `teardownFixture`).

## 16. Regression surface

- `jobs-base44-shell-bot.spec.ts` — job detail photo section must keep showing all photos (internal + published) to staff.
- `site-visits-base44-shell-bot.spec.ts` — site-visit photo upload/inspection `photo_list` flow must be unaffected by the new column (default `false` doesn't change existing upload behavior).
- `portal-auth-bot.spec.ts` — no expected impact, but should be re-run since it establishes the `customer_accounts` session pattern every new portal RPC depends on.
- `portal-completion-base44-shell-bot.spec.ts` — closest existing analog to the new portal photo section; confirm it isn't broken by any shared portal-shell change.
- `properties-base44-shell-bot.spec.ts` — no property-photo path exists, so no direct impact expected; included because properties share the org/customer ownership primitives being reused here.
- Inspections: covered via `site-visits-base44-shell-bot.spec.ts` / `site-visits-inspection-redesign-bot.spec.ts` (photo_list field uses the same underlying vault_items rows).
- No existing change-order or dedicated vault/media E2E file exists today — a gap independent of this design, not introduced by it (flagging for completeness, matching the brief's "any vault/media E2E" instruction — there currently is none to regress).

## 17. Stop conditions — none encountered

Checked against every listed stop condition:
- Bucket is **private** already — no forced change. ✅ clear
- **One boolean is sufficient** — no multi-class visibility semantics found in the current data. ✅ clear
- `vault_items` **can** reliably identify a customer-owned parent for the two in-scope parent types (`job`, `estimate`) via direct `customer_id` FKs on the parent tables; `site_visit` requires one extra join and is scoped out of V1 rather than forced in unverified (§11). ✅ clear, with an explicit scope narrowing recorded, not a block
- No generic `related_ids` column exists on `vault_items` — every link is a real FK. ✅ clear
- Implementation requires **no broad customer SELECT on `vault_items`** — the SECURITY DEFINER function pattern avoids it entirely. ✅ clear
- Signed URL generation already happens only after authorization, in the existing staff pattern this design reuses unchanged. ✅ clear
- Migration is additive/default-false — **no existing photo is exposed by the migration itself**. ✅ clear
- Staff roles **do** provide a clear publish authority once the new `canPublishCustomerMedia` capability is added, following the exact existing dual-enforcement pattern (`permissions.ts` + `role_has_capability()`). ✅ clear

## 18. Exact risks

1. **Site-visit photos are out of scope for the first implementation slice** (§11) — if a business need for customer-visible site-visit/inspection photos exists at V1, this narrows the initial deliverable; the fix (one more join, one more `EXISTS` branch) is small but should be its own reviewed addition, not assumed working from this doc alone.
2. **Bearer-token property of signed URLs** (§8) — accepted, not solved; matches existing staff-side behavior, does not regress anything, but is worth the user knowing explicitly rather than discovering later.
3. **No CHECK constraint enforces single-parent-FK on `vault_items`** (§3) — the centralized function's explicit precedence avoids this being exploitable today, but any *future* code path that sets multiple parent FKs on one row without understanding this precedence could create a photo that's reachable through an unintended parent. Worth a code comment at minimum when implemented.
4. **`canPublishCustomerMedia` at owner/admin-only is a judgment call**, not a repo-derived fact — the closest existing precedents (`canApproveEstimatePricing`, `canIssueRefunds`) are owner/admin-only, but `canScheduleJobs` (broader) is also plausible for "field employee photographs and immediately shares with the customer." This is a product decision the user should confirm, not one this audit can settle from evidence alone.

## 19. Verdict

**IMPLEMENT** — with the scope narrowed to job- and estimate-linked photos for the first slice (site-visit/inspection photos as an explicit fast-follow, not silently included). No stop condition was triggered; the existing codebase already contains every primitive this design needs (capability matrix + SQL parity function, SECURITY DEFINER RPC idiom, customer_accounts ownership-check idiom, private-bucket + signed-URL pattern, and even a naming precedent in `expenses.receipt_visibility`) — this is a genuinely additive, low-risk slice, not a new architecture.

**Role scope — resolved 2026-08-11**: `canPublishCustomerMedia` is `owner`/`admin` only. `employee`/`subcontractor` are explicitly denied publish/unpublish authority; they retain their existing (unchanged) media-upload capabilities. No open product decision remains.

### `canPublishCustomerMedia` — final matrix

| Role | Publish / unpublish to customer portal |
|---|---|
| owner | yes |
| admin | yes |
| employee | no |
| subcontractor | no |
| customer (portal) | no (read-only via the centralized query, never a mutation path) |

### Fast-follow: site-visit / inspection photo ownership chain

Not implemented in the first slice (§11, §18.1). The exact chain to verify before extending `list_customer_visible_photos` (or an equivalent) to site-visit-linked photos:

```
vault_items.site_visit_id
  → site_visits.service_request_id  (site_visits has no direct customer_id)
    → service_requests.customer_id  (service_requests already has a working
                                      customer RLS policy, customer_select_own_service_requests,
                                      to model the EXISTS clause on)
```

Inspection `photo_list` photos reuse this exact chain unchanged — an inspection response is stored as JSONB on the site visit record and references `vault_items` by id (`{vaultItemId, caption}`), but the underlying `vault_items` row still carries `site_visit_id`, so no separate inspection-specific ownership path is needed; the fast-follow is a single new `EXISTS` branch in the centralized function (mirroring the `job_id`/`estimate_id` branches already implemented), not a new architecture. Before implementing it: confirm no inspection response contains customer-inappropriate fields expected to leak alongside the photo (e.g. an internal finding note stored in the same JSONB blob as the photo reference) — this was not audited in this pass since site-visit photos are out of scope.
