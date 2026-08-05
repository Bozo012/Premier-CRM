# Customer Portal & Integration Plan

## Purpose

Define how the public website's customer-facing portal (sign-in, dashboard, request service, billing) gets its data, who owns the schema and auth, and how it relates to the unauthenticated invoice/quote share-token links already specified in the CRM invoice plan. This is the data/auth boundary decision needed before either the CRM invoicing work or the website portal goes further, so the two repos aren't built against incompatible assumptions about who's logged in and what they can see.

This is not a UI spec — portal layout is already mocked in the website repo. This covers only the data and auth contract underneath it.

**Update:** the production handoff keeps the marketing site as the public
doorway at `https://www.ppmnky.com/customer-portal`. Forge still owns Supabase
Auth, session cookies, customer-account resolution, password recovery, and the
authenticated customer dashboard at `/portal/dashboard`. The previous Forge
`/portal` and `/portal/login` marketing-style pages are redirect-only now, so
there is no competing customer sign-in landing inside Forge.

## What becomes portal-controlled (authenticated, customer-scoped)

- Customer sign-in / account, via Supabase Auth
- Dashboard: active requests, completed services, properties, outstanding balance
- Service request submission — writes to `service_requests`, the same table the CRM's Request inbox already reads
- Service history: past requests, estimates, quotes, jobs, invoices tied to that customer
- Billing & payments view — read-only invoice/payment history; no online payment processing in this slice (matches the CRM invoice plan's Phase 1 deferral of Stripe)
- Property management view — properties tied to that customer

## Portal vs. token-link decision

**Recommendation: both, with a defined relationship — one doesn't replace the other.**

- Token links (`/i/[token]`, and the equivalent for quotes) remain the mechanism for a specific transactional email: "here's your quote, accept it," "here's your invoice, view/pay it." No login, no account required. This serves one-time customers and repeat customers who don't want an account.
- Portal accounts are for customers who want an ongoing relationship: full history, all properties, one login instead of hunting through old emails for token links.
- A token link works regardless of portal-auth status — it grants access to that one record on its own, independent of whether the customer is signed in.
- Creating a portal account is a separate, explicit action (the mockup already shows this: "Request Access"). Do not auto-create or silently link a portal account from a token-link visit — that would turn a deliberately low-commitment, unauthenticated channel into an unrequested account-creation flow.

**Decided: self-serve signup on the website**, not staff-invited. Since signup is open, it needs one extra piece staff-invited wouldn't: on signup, check whether the email/phone matches an existing `customers` row (someone staff already added from a phone-in request or estimate before this customer ever created a portal account). If it matches, link the new auth user to that existing customer record instead of creating a duplicate. If no match, create a new `customers` row and link to that. This linking logic is required, not optional — without it, every returning customer who calls in first and signs up for the portal later ends up as two disconnected customer records.

## What stays token-based (unauthenticated, single-record access)

- `/i/[token]` public invoice view, exactly as already specified in the CRM invoice plan
- The equivalent public quote token page / accept flow, already implicit in the CRM spec's Quotes section

## Data ownership

The CRM repository owns the schema, migrations, RLS policies, and query layer for every table the portal touches — `customers`, `properties`, `service_requests`, `estimates`, `quotes`, `quote_line_items`, `jobs`, `invoices`, `invoice_line_items`, `payments`. The website repo never holds its own copy of this data and never gets write access beyond what specific portal actions require (submitting a request, accepting a quote).

Same split as the existing website-settings plan — CRM owns schema and access model, website only consumes it — but through an **authenticated** boundary instead of an anon-key public-read boundary, because this data is customer-private, not public marketing copy.

## Auth model

- Supabase Auth handles portal sign-in inside Forge. The marketing form posts
  credentials over HTTPS to Forge route handlers; credentials are never placed
  in query strings and the marketing repo no longer creates Supabase sessions.
  Each portal user is a Supabase Auth user linked to exactly one `customers.id`
  through `customer_accounts` (`auth_user_id`, `customer_id`, `org_id`, `email`,
  `status`, `invited_at`, `accepted_at`, upserted on `auth_user_id` conflict).
- This is a separate auth namespace from staff/org-member auth already used by the CRM app. A portal user is never a staff org member and must never pass the CRM's existing staff-authorization checks. The existing implementation already enforces this (customers are explicitly never added to `org_members`).
- Provisioning: self-serve signup, matched or linked to an existing `customers` row by email at signup time — **already implemented** in `Premier-CRM`'s `ensureCustomerAccount` (in `apps/web/app/portal/actions.ts`): looks up an existing `customers` row by `org_id` + `email`, creates one only if no match is found, then upserts the `customer_accounts` link. Port this exact logic into the website's signup flow rather than reimplementing it — it already handles the match-or-create requirement described above correctly.
- **Before porting:** verify RLS is actually enforcing the `customer_id` boundary at the database level for `service_requests` and `customer_properties`, not just the application-level `.eq('customer_id', ...)` filter visible in the existing dashboard query. If RLS is missing or incomplete, add it before the website version goes live — the existing CRM `/portal` may be relying on the app-level filter alone, which isn't safe on its own.

## RLS boundary

- Customer-facing tables get an additional RLS policy for the `authenticated` role, scoped by the signed-in user's linked `customer_id` — select-only to start.
- Additive to, not a replacement for, existing staff/org RLS policies on these tables. A row must remain reachable by staff regardless of portal policies.
- No portal write policies in the first slice except the two actions that need one: creating a `service_requests` row (submit a request) and accepting a quote (a status transition, not free-form edits). Everything else portal-facing is read-only.
- Token routes (`/i/[token]`, `/q/[token]`) keep using the unguessable-token + server-side lookup pattern already specified for invoices — **not** RLS via the `anon` role. Do not expose invoices or quotes to `anon` through RLS; token routes look records up through a server-side function/service-role call keyed on the token, as already specified in the CRM invoice plan.

## Fallback strategy

Unlike the website-settings slice, the portal has no meaningful static fallback — a dashboard with no real data isn't useful the way marketing copy with stale defaults is. If Supabase is unreachable, the portal should show a clear error/retry state, not fabricated numbers.

This matters immediately: the current portal mockup's "3 Active Requests / 12 Completed / 5 Properties / $0 Outstanding" is hardcoded placeholder content. It must not ship as-is and must not be mistaken for a working degraded state — it needs a real query or an honest empty/loading/error state, never fake numbers standing in for real ones.

## Rollout sequence

1. ~~Confirm current state~~ — **Confirmed via audit (`docs/SUPABASE-INTEGRATION-STATUS.md` in the website repo):** zero Supabase footprint on the website side. No client, no package, no env vars, no table references. Portal sign-in form has no handler; the request form only sets local state; all dashboard stats and the recent-requests list are hardcoded literals.
2. ~~Auth wiring~~ — Forge-owned handoff endpoints receive the marketing form
   POSTs:
   - `POST /portal/handoff/sign-in`
   - `POST /portal/handoff/request-access`
   Successful authentication redirects to `/portal/dashboard`; failures redirect
   back to the marketing doorway with safe status codes only.
3. **RLS verification/completion** — confirm the customer-scoped RLS policies described above actually exist and are correct on `service_requests` and `customer_properties` (and any other table the ported dashboard reads); add what's missing (CRM repo).
4. **Read integration** — port the dashboard's real queries (already working in the CRM's version) into the website's existing design, replacing the hardcoded mockup numbers.
5. **Write actions** — port the request-submission logic so "Request Service" on the website actually creates a `service_requests` row; wire quote acceptance if a portal-based accept flow is wanted alongside the token link.
6. **Token routes** — confirm/implement `/i/[token]` and the quote equivalent per the CRM invoice spec, independent of portal auth.
7. **Staff login entry point** — add a simple link/button on the website (nav or footer) pointing to the CRM app's own `/login` URL (not `/portal` — that's the customer route). No new auth surface needed on the website side.
8. ~~Retire the CRM's duplicate public doorway~~ — `/portal` and `/portal/login`
   are redirect-only. Authenticated customers entering `/portal` are sent to
   `/portal/dashboard`; unauthenticated visitors return to
   `NEXT_PUBLIC_MARKETING_SITE_URL/customer-portal`.

## Deployment and rollback

Deploy Forge first so the handoff endpoints exist, then deploy the marketing
site so the public form points at them. Rollback is the reverse: restore the
previous marketing deployment first if Forge handoff is unavailable, then roll
Forge back if needed. No schema migration is required for this handoff.

## Explicitly deferred

- Direct messaging between customer and staff
- Online payment processing through the portal
- CRM-side staff role differentiation (owner vs. employee vs. subcontractor permissions) — a real future need, but out of scope until there's an actual second staff user
- Any portal write access beyond request submission and quote acceptance

## Staff access entry point ("owner" access, resolved)

Confirmed: this isn't a new role or a new data boundary. It's a navigation entry point — a "Staff Login" link/button on the public website that takes you to the existing CRM app (its own domain, its own already-specified staff/org-member auth). The website doesn't need any awareness of staff permissions; it just needs a link out.

Currently there's exactly one staff user (Kevin, as owner). The stated future intent — employees or subcontractors eventually logging in to see CRM data relevant to their own work — is **role differentiation within the CRM's existing staff auth** (owner/admin vs. employee vs. subcontractor permissions), not a website concern and not part of this integration slice. Worth noting as a real future requirement for the CRM's own RBAC design, but out of scope here — flag separately when there's an actual second staff user to build for, rather than designing permission tiers for a single-user system now.
