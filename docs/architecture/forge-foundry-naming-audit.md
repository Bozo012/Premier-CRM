# Forge / Foundry Naming Audit — Read-Only (Phase F1)

Status: **Phase F1 (this document) was read-only, as originally written below — preserved as written.** Kevin approved the audit and the proposed scope; Phase F2 was implemented, merged (PR #89, squash commit `8da54d7`), deployed (Vercel `dpl_CRw8Pbyb7A8pGjEgsgYKZUeE6nAz`, READY, `app.ppmnky.com`), and the Demo-org display-name migration was applied to production. See `docs/architecture/forge-foundry-brand-boundaries.md` for the current, active state of the naming model and `docs/SESSION_STATE.md` for the full deployment record. The rest of this document is the original Phase F1 audit, unedited.

Branch: `chore/forge-brand-separation`, based on `main` at `b253cc1` (Pre-Base44 Workflow Refinement phase, PRs #87–#88, complete and deployed).

---

## 1. Executive recommendation

- **Recommended product name**: **Forge** — the staff CRM, customer portal, and platform software collectively.
- **Recommended umbrella usage**: **Foundry**, used sparingly, confined to architecture/planning documentation only. It should not appear in the live application, customer-facing content, or public marketing in this phase.
- **Preserved business branding**: **Premier Property Maintenance** stays exactly as-is everywhere it is currently used — organization record, public website (`ppmnky.com`), all customer-facing quotes/invoices/portal/email content, logos, domains. Confirmed correct in essentially every customer-facing surface already (see §2, category C rows) — the codebase already keeps this separation cleanly in the one place it matters most: outbound customer email templates.
- **Overall rename risk**: **low for the application-code portion, higher-attention-but-still-low for the one persisted org-name row.** The live application currently displays almost no explicit product-name text at all — no header/nav branding exists (`apps/web/app/(app)/layout.tsx` renders only the bottom nav and page content, no app-name text anywhere in the authenticated shell). The touch points that do exist (browser `<title>`, PWA manifest, one internal-notification email template, two staff/portal page headings) are small, isolated, and untested by any assertion. The one genuinely sensitive item is the **persisted `organizations.name = 'Premier CRM Demonstration'` row** and its one hard test assertion (§5) — flagged as a Kevin decision, not proposed for change now.
- **Database migration needed**: **No, for the Forge rename itself.** A migration would only be needed if Kevin separately approves renaming the Demo organization's persisted `name`/`slug` — that is optional, deferred, and not required for "Forge" to become the product-facing name anywhere else.
- **Repository/infrastructure renames needed for V1**: **No.** Recommendation is to preserve the GitHub repo name (`Premier-CRM`), all Supabase project names/refs, the Vercel project name, and all environment variable names for V1. None of these are ever displayed to an end user, and renaming any of them carries real operational risk (broken remote tracking, CI/CD, Vercel git integration, local clones) for zero user-facing benefit. See §4 and §8 question 6.

---

## 2. Reference inventory table

This is a representative inventory, not an exhaustive line-by-line listing of all ~70 files that matched a naming search — many documentation files (implementation reports, production deployment logs) contain the same handful of reference patterns repeated across dozens of lines; those are grouped by file with a representative note rather than itemized per line. Every **application-code, test, and infrastructure-config** file that matched is listed individually, since those carry real behavior/risk implications.

| File/path | Current reference | Context | Classification | Proposed change | Risk | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `apps/web/app/layout.tsx:10` | `title: 'Premier CRM'` | Root `<Metadata>`, becomes every page's browser tab title (no per-route override exists anywhere) | A — Forge product | `'Forge'` | Low | Change now (after approval) | No test asserts page title (`grep` for `toHaveTitle` found zero matches) — zero test-breakage risk. |
| `apps/web/app/layout.tsx:11` | `description: 'Premier Property Maintenance field operations.'` | Metadata description | C — PPM business | Preserve, or reword to something like `'Forge — service-business operations, currently powering Premier Property Maintenance.'` | Low | Kevin decision (wording only) | Both readings are defensible; flagging rather than assuming. |
| `apps/web/app/layout.tsx:16` | `appleWebApp.title: 'Premier'` | iOS home-screen app title | A — Forge product (ambiguous shorthand) | `'Forge'` | Low | Change now | Currently truncated/ambiguous already — "Premier" alone reads as the business, not the software. |
| `apps/web/public/manifest.json` | `"name": "Premier"`, `"short_name": "Premier"`, `description: "Premier Property Maintenance field operations."` | PWA manifest | A — Forge product | `name`/`short_name` → `"Forge"` | Low | Change now | Installed PWA icon label; same ambiguity as `appleWebApp.title`. |
| `apps/web/app/login/page.tsx:104` | `"Sign in to Premier"` | Staff/contractor login page `<h1>` | A — Forge product (ambiguous shorthand) | `"Sign in to Forge"` | Low | Change now | This is the staff software login, not a business-identity statement — "Premier" here is standing in for the product. |
| `apps/web/app/portal/login/page.tsx:28` | `"Premier customer portal"` | Breadcrumb link back to `/portal` doorway | A — Forge product (ambiguous) | `"Forge customer portal"` or `"Forge Portal"` | Low | Kevin decision | Genuinely ambiguous — could be read as "[business]'s customer portal" or "the [software]'s customer portal." See §3 for the two portal-heading examples together. |
| `apps/web/app/portal/login/page.tsx:32,73` | `"internal Premier roles"`, `"Premier staff"` | Descriptive copy distinguishing staff vs. customer accounts | A — Forge product (ambiguous, means "the software's internal roles") | `"internal Forge roles"`, `"Forge staff"` | Low | Change now (bundled with above) | Same ambiguous-shorthand pattern. |
| `apps/web/app/portal/page.tsx:17` | `"Premier Property Maintenance"` (eyebrow above "Customer portal" heading) | Portal doorway page | C — PPM business | Preserve | Low | Preserve | Correctly the business identity — this is what a customer sees first and it's correct today. Hardcoded rather than tenant-driven (see §7) but not a naming-correctness problem. |
| `apps/web/app/portal/page.tsx:8` | `"the properties Premier has on file"` | Benefit bullet copy | Ambiguous — reads as business ("Premier[PM] has on file"), not software | C — PPM business (leaning) | Preserve, or reword to remove the shorthand entirely (`"the properties on file for your account"`) | Low | Kevin decision | Borderline; likely fine as-is since context (properties, service history) is business-owned data, not a software capability statement. |
| `apps/web/app/portal/page.tsx:24` | `"The portal lives inside Premier CRM at app.ppmnky.com/portal"` | Explaining the technical relationship between the portal and the marketing site | A — Forge product | `"The portal lives inside Forge at app.ppmnky.com/portal"` | Low | Change now | Explicitly describing the software platform by name — the clearest single example of a customer-facing "Premier CRM = the software" reference in the app. |
| `apps/web/app/portal/page.tsx:50` | `"separate from Premier internal staff accounts"` | Distinguishing account types | A — Forge product (ambiguous) | `"separate from Forge internal staff accounts"` | Low | Change now | Same shorthand pattern as the login page. |
| `apps/web/lib/email.ts:837` | `<p>...text-transform:uppercase;">Premier CRM</p>` inside `buildQuoteRespondedEmailHtml()` | Header of the **staff-facing internal notification** email sent when a customer accepts/declines a quote | A — Forge product | `"Forge"` | Low | Change now | Confirmed this is the *only* email template header using "Premier CRM" — every customer-facing template (quote sent, invoice sent, etc.) already correctly says **"Premier Property Maintenance"** (lines 446, 510, 572, 627, 685, 769, 797). This one internal-notification template is the sole outlier, and it's correctly a product reference, not a business one — a staff member reading "a customer responded to a quote" is reading a Forge-generated notification, not a PPM customer document. |
| `apps/web/lib/email.ts:214,289` | `` `Your quote from Premier: ${title}` `` / `` `Your invoice from Premier: ${title}` `` (email subject lines) | Customer-facing quote/invoice email subjects | C — PPM business (leaning) | Preserve as "Premier" (shorthand for the business, matches the body's "Premier Property Maintenance" signature) | Low | Kevin decision | These are customer-facing documents; "Premier" here almost certainly means the business, matching the email body. Flagging only because "Premier" alone (not "Premier Property Maintenance") is the same ambiguous shorthand pattern seen elsewhere — worth Kevin confirming the shorthand is intentional and fine, not confirming a change. |
| `apps/web/app/api/e2e-health/route.ts:9` | comment: `intended premier-crm-e2e overrides` | Code comment referencing the Supabase e2e project by name | E — technical/stable | Preserve | None | Preserve | Refers to the actual Supabase project name (`premier-crm-e2e`), a real infrastructure identifier — not a product-name reference at all. |
| `apps/web/app/(app)/today/actions.ts:19` | comment: `(...Maintenance and Premier CRM Demonstration)` | Code comment about multi-org support | D/F — historical + org-data reference | Preserve, or update only if/when the Demo org itself is renamed | None now | Defer (tied to §5) | Purely descriptive of the current org name; would only need updating if the underlying org row is renamed. |
| `packages/db/queries/org-context.ts:43` | comment: `(Premier CRM Demonstration org support, ...)` | Code comment | D/F — historical + org-data reference | Same as above | None now | Defer (tied to §5) | Same pattern. |
| `package.json:2` | `"name": "premier-crm"` | Root workspace package name, `private: true`, never published | E — technical/stable | Preserve | Low if changed, but no benefit | Preserve for V1 | Purely internal pnpm workspace identifier; not user-visible anywhere. |
| `apps/web/package.json`, `packages/*/package.json` | `"@premier/web"`, `"@premier/db"`, etc. | Internal monorepo package scope | E — technical/stable | Preserve | Medium if changed (touches every import statement repo-wide) | Preserve for V1 | Renaming the `@premier/*` scope would be a large mechanical diff across the whole codebase for zero user-facing benefit — explicitly out of scope for a "naming-only, low-risk" change. |
| `playwright.config.ts:6,30-44,102` | Comments referencing "Premier CRM" and `premier-crm-prod`/`premier-crm-e2e` | QA-suite safety-check comments (the real, hard-won prod/e2e guardrail described elsewhere in this doc's context) | Mixed — `Premier CRM` in prose is A, `premier-crm-prod`/`premier-crm-e2e` are E | Prose → Forge; project-ref strings → preserve exactly | Low | Change now (prose only) | **Do not touch the actual `premier-crm-prod`/`premier-crm-e2e` string literals or comparisons this guardrail relies on** — those are the real Supabase project refs the safety check exists to protect; only the surrounding English sentences describing "Premier CRM" as the software are candidates. |
| `README.md:1,3` | `# Premier CRM` / `"A contractor CRM with a semantic vault... Built first for Premier Property Maintenance LLC."` | Repo root README, product description | A — Forge product, already correctly distinguishing product from business in the same sentence | `# Forge` / same sentence structure, swap only the product name | Low | Change now | This line already models the exact separation Kevin's naming model wants — it just needs "Premier CRM" replaced with "Forge," not a rewrite. |
| `.env.example` | `# Premier CRM — Environment Variables` (comment header only) | File header comment | A — Forge product (trivial) | `# Forge — Environment Variables` | None | Change now | Comment only, no actual variable name affected. |
| `ARCHITECTURE.md`, `CLAUDE.md` intro sections | No direct "Premier CRM" product-name prose found in `CLAUDE.md`; `ARCHITECTURE.md` intro is naming-neutral | Developer-facing architecture docs | A (where present) | Update product-name prose to Forge where found | Low | Change now | `CLAUDE.md` itself contains no product-name prose to change — confirmed by direct search. |
| `docs/SESSION_STATE.md`, `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`, `docs/BASELINE_V1.md`, `docs/CLAUDE_CONTEXT.md`, `docs/RESUME_PROMPT.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/01-PRD.md`, `docs/07-customer-portal-integration-plan.md` | Numerous "Premier CRM" references in prose describing the software | Active/living documentation | A — Forge product | Update forward-looking/prose references to Forge; leave dated historical narration as-is (see §5 historical policy) | Low | Change now for prose, per §5 policy for narration | These are the "living" docs (updated every phase) — safe to update their *current-state* prose. Do not rewrite the parts of these same files that narrate what happened on a specific past date. |
| `docs/implementation/premier-crm-demonstration-organization.md`, `docs/implementation/premier-crm-demo-dataset-manifest.md`, `docs/implementation/request-site-visit-estimate-workflow.md`, `docs/production/cleanup/2026-08-01-production-cleanup.md`, `docs/production/deployments/2026-08-02-site-visit-workflow-deployment.md` | "Premier CRM"/"Premier CRM Demonstration" throughout | Dated implementation/deployment/cleanup reports | D — historical | Preserve as written | None | Preserve | These narrate what was true and named at the time of writing — see §5. |
| `docs/implementation/kevin-demo-ui-observation.md` | "Premier CRM Demonstration" (org name), general prose | Mixed — active observation log referencing the persisted org name | D (org-name mentions) + A (general prose, if any) | Org-name mentions preserved as-is (tied to §5); no general "Premier CRM" prose found beyond org-name references | None | Defer (tied to §5) | — |
| `docs/ux/base44-handoff.md` | "Premier CRM" in a few places (this document, written last phase) | Active reference doc for the Base44 spike | A — Forge product | Update to Forge | Low | Change now | Written this same session; safe and expected to update once Forge is approved — this doc is explicitly meant to stay current. |
| `supabase/migrations/*.sql` (all ~20 files matched) | Comment headers only (e.g. `-- Premier CRM core schema`), never a functional identifier | Migration file headers/comments | D — historical (migrations are immutable once applied) | **Do not touch** | High if touched, zero benefit | Preserve — hard rule | Per `CLAUDE.md`: migrations are immutable after running. Editing an already-applied migration file's comment is technically harmless to the database but violates the project's own immutability discipline and provides zero benefit — excluded outright. |
| `supabase/migrations/20260802030100_bootstrap_demonstration_organization.sql` | `INSERT INTO organizations (name, slug, ...) VALUES ('Premier CRM Demonstration', 'premier-crm-demonstration', ...)` | The actual persisted org name/slug, written by an idempotent bootstrap RPC | F — Kevin decision (persisted tenant data) | See §5 | Medium (real data, one test assertion depends on it) | **Kevin decision, not started** | The one genuinely "requires a decision, not just a docs edit" item in this whole audit. |
| `tests/e2e/demonstration-org-bootstrap-bot.spec.ts:94` | `expect(org.name).toBe('Premier CRM Demonstration')` | Hard assertion on the persisted org name | F — Kevin decision (test tied to persisted data) | Update only if/when §5 is approved and implemented | Medium | Defer (tied to §5) | This is the **one test in the entire repo** that would break from a Demo-org rename — flagged explicitly so it's never missed if that rename is later approved. |
| `tests/e2e/*.ts` (comments only: `deposit-invoice-creation-bot.spec.ts`, `invoice-totals-recalc-bot.spec.ts`, `multi-org-switching-bot.spec.ts`, `quote-totals-recalc-bot.spec.ts`) | "...while populating the Premier CRM Demonstration organization..." | Doc-comment narration of *why* a test/fix exists | D — historical | Preserve as written | None | Preserve | These describe a specific past debugging/population event by its actual name at the time — rewriting them would misrepresent history per §5. |
| `apps/web/app/(app)/jobs/actions.test.ts:4` | Comment: "...populating the Premier CRM Demonstration organization: no application..." | Doc-comment narration | D — historical | Preserve | None | Preserve | Same pattern as above. |
| `apps/web/lib/site-visit-attachments.test.ts:3,24` | `premier-crm-e2e` in comments/describe-block name | Real Supabase project name reference | E — technical/stable | Preserve | None | Preserve | Not a product-name reference. |
| GitHub repository name `Bozo012/Premier-CRM` | Repo name, no description set | Infra identifier | E — technical/stable | Preserve for V1 | High if renamed (breaks remote tracking, Vercel git integration, local clones), zero functional benefit | Preserve — Kevin decision if ever revisited | See §6 detail. |
| Vercel project `premier-crm-web` (`prj_CJ8oQfHmQUjao4GzCZF3drze0dNm`) | Project name | Infra identifier | E — technical/stable | Preserve | High if renamed, zero user-visible benefit (users see `app.ppmnky.com`, never the Vercel project name) | Preserve | Not touched, not proposed. |
| Supabase projects `premier-crm-prod` (`apnbpcauqrjvkoleisde`), `premier-crm-e2e` (`slbnizoskumwhleeiccv`) | Project names/refs | Infra identifiers, load-bearing in `playwright.config.ts`'s prod-safety guardrail | E — technical/stable | Preserve — explicitly prohibited from renaming per original instruction | High if renamed | Preserve — hard rule | These string literals are the actual mechanism preventing e2e tests from running against production; renaming is both prohibited and actively dangerous to that safety check if done carelessly. |
| Second repo (`Modern Service System Website` — public marketing site) | `Premier-CRM` mentioned in 3 files, all internal developer docs (`SUPABASE-INTEGRATION-STATUS.md`, `website-settings-crm-plan.md`, one code comment) pointing back to *this* repo by its GitHub name | Cross-repo developer references | E — technical/stable (repo name), not public-facing | Preserve | None | Preserve — not touched, classification only per instruction | **No public marketing copy in that repository references "Premier CRM," "Forge," or "Foundry" anywhere** — confirmed by search. The public site already correctly only ever talks about Premier Property Maintenance. Nothing there needs to change even after a Forge rename lands here, since these are internal dev-doc pointers to this repo's name, not customer-facing content. |

---

## 3. Exact proposed implementation scope (for Phase F2, after approval — nothing below is implemented)

### Application UI (7 files)
- `apps/web/app/layout.tsx` — `metadata.title`, `metadata.appleWebApp.title`
- `apps/web/public/manifest.json` — `name`, `short_name`
- `apps/web/app/login/page.tsx` — `"Sign in to Premier"` heading
- `apps/web/app/portal/login/page.tsx` — 3 shorthand references
- `apps/web/app/portal/page.tsx` — 1 confirmed change (`"lives inside Premier CRM"`); 2 flagged as Kevin's call, not auto-included
- `apps/web/lib/email.ts` — 1 template (`buildQuoteRespondedEmailHtml`, internal-notification only — **not** any customer-facing template)

### Metadata / browser titles
Covered by the `apps/web/app/layout.tsx` change above. See §7 for the per-route title format proposal (not yet implemented anywhere — today there is exactly one global title, no per-route metadata exists).

### Shared constants (new, proposed — see §8 question 7)
- A new small module (e.g. `packages/shared/brand.ts`) exporting `PRODUCT_NAME = 'Forge'` and `ECOSYSTEM_NAME = 'Foundry'`, consumed by the handful of files above instead of each hardcoding the string separately. This does not exist today — confirmed by search, no central brand constant currently exists anywhere in the codebase.

### Tests (1 file, conditionally)
- `tests/e2e/demonstration-org-bootstrap-bot.spec.ts:94` — only if and when Kevin separately approves the Demo-org rename in §5. Not included in the base Forge-rename scope.

### Active documentation (update prose, preserve narration)
`README.md`, `.env.example` header, `docs/SESSION_STATE.md`, `docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md`, `docs/BASELINE_V1.md`, `docs/CLAUDE_CONTEXT.md`, `docs/RESUME_PROMPT.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/01-PRD.md`, `docs/07-customer-portal-integration-plan.md` — update only the current-state/forward-looking prose describing the software product; leave any dated narration of past events untouched.

### Base44 documents
`docs/ux/base44-handoff.md` — update "Premier CRM" references to Forge (this doc is explicitly meant to stay current, and doing so before the compatibility spike begins is the right sequencing anyway, per the release-gate in §9).

### Second repository
None. Confirmed no public-facing content in `Modern Service System Website` references the software product name at all — nothing to change there, now or after approval.

---

## 4. Explicit exclusions (must not change, under any Phase F2 scope)

- All files under `supabase/migrations/` — immutable per `CLAUDE.md`, including comment-only headers.
- The persisted `organizations.name`/`slug` for both PPM and Demo — **unless** Kevin separately approves the Demo-org change in §5; PPM's org record is never a candidate at all.
- All Supabase project names/refs (`premier-crm-prod` / `apnbpcauqrjvkoleisde`, `premier-crm-e2e` / `slbnizoskumwhleeiccv`), especially the string literals inside `playwright.config.ts`'s production-safety guardrail.
- The Vercel project name/identifier (`premier-crm-web` / `prj_CJ8oQfHmQUjao4GzCZF3drze0dNm`).
- The GitHub repository name (`Bozo012/Premier-CRM`).
- `ppmnky.com` / `app.ppmnky.com` domains, all DNS/URL configuration.
- Every customer-facing PPM email template body (quote-sent, invoice-sent, quote-responded-to-customer, etc.) — all already correctly say "Premier Property Maintenance," confirmed unchanged.
- The public marketing website (`Modern Service System Website` repo) — content, design, domain, SEO, logos — untouched, not even classified for change (only classified for reference, per instruction).
- All `@premier/*` internal package scope names and the root `premier-crm` workspace package name.
- Environment variable *names* (only comment headers are proposed for change, never a variable identifier).
- Historical/dated documentation narration (deployment reports, cleanup reports, incident records, and the "what happened on this date" portions of living docs) — see §5.
- PPM customer/business data of any kind.

---

## 5. Historical-reference policy

Documents that narrate a specific past event — deployment reports (`docs/production/deployments/*.md`), cleanup reports (`docs/production/cleanup/*.md`), the Demo population manifest and organization doc, and the dated narrative sections inside `docs/SESSION_STATE.md` and `docs/implementation/kevin-demo-ui-observation.md` — describe what was actually true and actually named *at the time they were written*. These are preserved verbatim, not rewritten, even after "Forge" becomes the current product name. Rewriting them to say "Forge" retroactively would misrepresent the historical record — at the time of PR #83–#87, the product was genuinely and correctly called "Premier CRM" in the application. Where useful, a living document (like `SESSION_STATE.md`) may add a short forward-pointing note near its top (e.g. "the software product referenced as 'Premier CRM' throughout this file's history is now called Forge — see the naming audit") rather than editing every historical line.

The one specific item this policy protects from an over-eager rename: **the persisted `organizations.name = 'Premier CRM Demonstration'` value and the test asserting it are not touched by the base Forge rename** — they are historical/data facts, not living prose, and changing them is a separate Kevin decision (§5→§7 question 5) with its own migration and test-update implications.

---

## 6. Proposed UI presentation (sample output, not implemented)

**Sign-in page:**
```
Sign in to Forge
Contractor and staff accounts use email and password.
```

**Today page** (no change to on-screen content — confirmed the authenticated app shell currently displays no app-name text at all; only the browser tab and PWA icon would say "Forge"):
```
[browser tab: "Forge"]
[org switcher, unchanged]: Premier Property Maintenance • owner  ▾
```

**Organization selector** (unchanged — already correctly tenant-driven, per `apps/web/app/(app)/today/_components/org-switcher.tsx`):
```
Premier Property Maintenance • owner
Premier CRM Demonstration • owner        ← label stays as the current persisted org name unless §5 is separately approved
```

**Page title** (browser tab — see §7 for the full proposed per-route convention; today there is only one global title, proposed to become route-aware):
```
Forge
Forge — Today
Forge — Customers
```

**Customer portal:**
```
PREMIER PROPERTY MAINTENANCE          ← unchanged, this is correct today
Customer portal
Sign in to view your service requests, properties, and account details.
The portal lives inside Forge at app.ppmnky.com/portal so protected
customer data stays out of the marketing site.
```

**Generated documents (customer-facing quote/invoice emails):** **No change proposed.** Already correctly say "Premier Property Maintenance" throughout, both in the branded header and the closing signature line.

**Staff-facing internal notification email** (quote accepted/declined — the one internal-only template):
```
[header bar]: FORGE                    ← was "PREMIER CRM"
[Dana Whitfield accepted a quote.]
```

---

## 7. Ambiguous decisions requiring Kevin

1. **Whether to rename the persisted Demo organization** (`organizations.name`) from `"Premier CRM Demonstration"` to `"Forge Demonstration"`. Requires a data update (not a schema migration — the column already exists) and updating exactly one test assertion (`tests/e2e/demonstration-org-bootstrap-bot.spec.ts:94`). Recommended default per the original naming-model instruction: **not now** — defer until after the base Forge rename is stable, if ever.
2. **Whether the GitHub repository should ever be renamed** from `Premier-CRM`. Recommended default: **preserve indefinitely** unless a concrete operational reason emerges (e.g. open-sourcing under the Forge name — `README.md` already mentions a planned future AGPL-3.0 release, which is the one scenario where a repo rename might eventually make sense, but not for V1).
3. **Whether the customer portal login page should visibly say "Forge"** at all (`"Premier customer portal"` → `"Forge customer portal"`), versus staying silent on the product name entirely and only showing the business name (as the `/portal` doorway page already does well). Two reasonable answers; not decided here.
4. **Exact browser-title convention** — whether to adopt per-route titles at all (today there are none, just one global "Premier CRM" for every page) and if so, which of the formats in §8 question 2 to use. This is a net-new pattern, not a rename of an existing one, so it's flagged as a design decision rather than a mechanical swap.
5. **Wording of `apps/web/app/layout.tsx`'s metadata `description`** and the two borderline `/portal` doorway copy lines (§2 rows for `portal/page.tsx:8` and `layout.tsx:11`) — minor, but genuinely ambiguous between "Premier" as business-shorthand vs. redundant-with-Forge phrasing.
6. **Whether the customer-facing email subject lines** (`"Your quote from Premier: ..."`) should stay as "Premier" shorthand or be confirmed/adjusted — leaning preserve, but flagged since it's the same ambiguous-shorthand pattern seen elsewhere in this audit.

---

## 8. Specific questions answered

**1. Application name.** Recommend simply **"Forge"** as the product name shown in metadata/branding, with the active organization always shown as a separate, adjacent element (org switcher) — never collapsed into one string like "Forge — Premier Property Maintenance" as the *app name itself*. That combined form is fine for a browser *tab title* (see below) where combining is a space-saving convention, but the product identity and the tenant identity should remain two visually distinct pieces of information, matching how the org switcher already displays them today.

**2. Browser title format.** Recommend a `Forge — [Section]` convention once per-route metadata is introduced (net-new, doesn't exist today):
```
Forge                          (root/marketing-adjacent pages, if any)
Forge — Today
Forge — Customers
Forge — Requests
Forge — Estimates
Forge — Quotes
Forge — Jobs
Forge — Invoices
Forge Portal — Premier Property Maintenance   (customer portal — tenant context is useful here since a customer might have accounts across tenants in theory, and it reassures them they're in the right business's portal)
```

**3. Active organization presentation.** **Confirmed already correct, no change needed.** `OrgSwitcher` (`apps/web/app/(app)/today/_components/org-switcher.tsx`) already renders `{org.orgName} • {org.role}` from live tenant data — product identity and tenant identity are already two separate concepts in the code today, they're just never both displayed together anywhere (since no app-name text currently renders in the authenticated shell at all). Introducing "Forge" as visible app-name text should preserve this separation, not merge it.

**4. Customer-facing documents.** **Already correct — organization branding, not product branding, confirmed throughout.** Every customer-facing email template says "Premier Property Maintenance," never "Premier CRM"/Forge. The one exception found (`buildQuoteRespondedEmailHtml`) is itself correctly a *staff*-facing internal notification, not a customer document — recommend changing it to Forge (§2, §3), not preserving it, since it was actually mislabeled relative to the pattern (it's the odd one out, a product reference sitting among what look like customer templates but isn't one).

**5. Demo organization.** See §7 item 1 — flagged as Kevin's decision, default recommendation is **defer/preserve for now**.

**6. Repository name.** Recommend **preserve** `Premier-CRM` for V1. A future rename would require: updating the local remote URL (`git remote set-url`) on every clone, re-establishing the Vercel↔GitHub git integration (Vercel deployments are wired to the specific repo by ID/URL), updating any bookmarked GitHub links in documentation and this session's own PR/commit history references, and re-cloning or manually renaming the remote in this working directory. All are mechanical and recoverable, but there's no concrete benefit driving them for V1 — the repo name is never shown to an end user. Revisit only if/when the AGPL-3.0 open-source release mentioned in `README.md` becomes concrete.

**7. Product constants.** **No central brand configuration exists today** — confirmed by search; every file hardcodes its own "Premier CRM"/"Premier" string independently. Proposed smallest addition for Phase F2:
```ts
// packages/shared/brand.ts
export const PRODUCT_NAME = 'Forge';
export const ECOSYSTEM_NAME = 'Foundry';
```
Consumed by the ~7 application files in §3 instead of each hardcoding the string. Tenant organization names remain fully data-driven (`organizations.name`, read via `getActiveOrgContext()`/`OrgSwitcher` as today) — never hardcoded as "Premier Property Maintenance" in application code (the two hardcoded portal-page occurrences in §2 are pre-existing, not newly introduced, and are flagged as a separate, minor piece of technical debt worth noting but not required to fix as part of this naming pass).

**8. Release wording.** Recommend **Forge V1** — matches Kevin's stated default preference exactly, and is the shortest, least ambiguous form (avoids "1.0" vs "V1" inconsistency, avoids the redundant "Platform" in "Forge Platform V1" since "Forge" already is the platform name).

**9. Foundry language.** Recommend Foundry appear **only** in: this audit document, a future `docs/architecture/forge-foundry-brand-boundaries.md` (per the original checkpoint instruction, not yet created — proposed for Phase F2), architecture/planning documentation, and the Base44 handoff doc's context section (explaining the ecosystem framing for whoever works on Base44, not as user-facing copy). Foundry should **not** appear anywhere in the live application (no UI string, no metadata, no email template) in this phase — confirmed no such usage exists today, and none is proposed.

---

## 9. Implementation plan (for Phase F2, after approval — not started)

1. Use this same branch, `chore/forge-brand-separation` (already created, currently containing only this audit document).
2. Implement the approved subset of §3's scope — naming-only changes: no lifecycle, permission, accounting, or unrelated UX changes bundled in.
3. Add `packages/shared/brand.ts` (§8 question 7) and wire the ~7 application files through it.
4. Update the conditionally-scoped test (`demonstration-org-bootstrap-bot.spec.ts:94`) only if Kevin separately approves the Demo-org rename (§7 item 1) — otherwise leave it untouched.
5. Run the validation gate: `pnpm test`, `pnpm typecheck`, `pnpm --filter web build`, plus a targeted rerun of any e2e suite touching login/portal/today pages to confirm no unrelated regression.
6. Manual verification: browser tab title, PWA install label, staff login heading, portal login/doorway headings, and the one internal-notification email template (can be checked by triggering `sendQuoteRespondedNotification` in a test/dev context — no real customer email involved).
7. Commit, push, open a PR (naming-only diff, clearly labeled), merge, verify production deployment the same way as PRs #87/#88 (Vercel `list_deployments`/`get_deployment` showing the merge commit `READY` on `target: production` aliased to `app.ppmnky.com`).
8. **Rollback plan**: since this is a pure presentation/string-constant change with zero schema/data impact (assuming §7 item 1 stays deferred), rollback is a standard `git revert` of the merge commit and a normal Vercel redeploy — no migration rollback, no data repair needed.
9. Update `docs/SESSION_STATE.md` to record the rename as complete, verified, and deployed.

---

## Release gate (restated per instruction)

- The Forge rename (Phase F2) must be explicitly approved by Kevin before any implementation begins — this audit is the artifact requiring that approval, not a green light in itself. **Done: approved, implemented, merged, deployed, and verified in production (`8da54d7`, `dpl_CRw8Pbyb7A8pGjEgsgYKZUeE6nAz`).**
- The rename must be merged, deployed, and verified in production before any "Forge V1 readiness" audit begins. **Done — see `docs/SESSION_STATE.md` for the full verification record.**
- The Forge V1 readiness audit is the next checkpoint after a successful rename — **not yet started, requires Kevin's separate explicit authorization.**
- The Base44 compatibility spike remains blocked until both the naming checkpoint and the V1-readiness sequencing are explicitly approved, in that order. Nothing in this document authorizes the spike — **still not started.**

---

## Summary for handoff

| Item | Value |
|---|---|
| Branch | `chore/forge-brand-separation` |
| HEAD | This audit document only, based on `main` at `b253cc1` |
| Audit document | `docs/architecture/forge-foundry-naming-audit.md` (this file) |
| Files with a naming match found | ~70 (search-matched); ~15 carry a real proposed change, ~10 are historical/preserve, remainder are technical identifiers or duplicate patterns in doc files |
| Recommended changes | 7 application-code files + `manifest.json` + `.env.example` header + ~10 active documentation files (prose only) + `docs/ux/base44-handoff.md` |
| Explicit exclusions | All migrations, all Supabase/Vercel/GitHub infra identifiers, both domains, all customer-facing PPM email templates, the public marketing repo, `@premier/*` package scope, env var names, historical documentation narration, PPM org/business data |
| Ambiguous Kevin decisions | 6 (listed in §7) — most consequential: whether to rename the Demo organization's persisted name |
| Migration required | No (for the base Forge rename); optional/deferred if Kevin separately approves the Demo-org rename |
| Estimated implementation risk | Low — no schema change, no test currently asserts any of the proposed-change strings (confirmed by search), the one test that *would* be affected (`demonstration-org-bootstrap-bot.spec.ts:94`) is tied to the explicitly-deferred Demo-org decision, not the base rename |
| Recommended next prompt | "Approve the Forge rename scope in `docs/architecture/forge-foundry-naming-audit.md` §3 [with/without the Demo-org rename in §7 item 1, and with your answers to the 6 ambiguous decisions in §7] — proceed with Phase F2 implementation on the `chore/forge-brand-separation` branch." |
