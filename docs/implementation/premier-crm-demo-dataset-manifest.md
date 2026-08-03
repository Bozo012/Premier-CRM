# Premier CRM Demonstration Organization — Dataset Manifest

Maintenance/reset reference for every record created in the permanent Premier
CRM Demonstration organization (`org_id = a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`,
project `premier-crm-prod` / `apnbpcauqrjvkoleisde`). Not an automatic-cleanup
list — this data is permanent/repeatable Demo content, not a temporary test
fixture. No secrets, passwords, tokens, signed URLs, or service-role
credentials appear below.

Populated via `scripts/demo-population/*.ts`, run against production with
`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` passed as process-level
environment variables only (never written to `apps/web/.env.local`). The
scripts are deleted from the repository once population is complete and
verified — this manifest is the durable record.

## Stage 1 — Customers, properties, portal account

| Record | ID | Category |
|---|---|---|
| Driver auth user (temporary) | `c095f5bd-9bae-4581-a966-7a16f6668e56` | Temporary — deleted in Stage 5 |
| Driver `org_members` row | `af8a7c9e-ca11-492e-8d0f-583a0652c965` | Temporary — deleted in Stage 5 |
| Dana Whitfield (residential customer) | `42e6f048-d9bb-40bb-a439-87c997de3018` | **Permanent showcase** |
| 482 Fernwood Lane, Rivergate, OH (residential property) | `1accdb6e-d821-4d59-b5eb-4802ca7d4ce8` | **Permanent showcase** |
| Bramwell Retail Group (commercial customer) | `9b361c98-7d1d-42e9-ac0d-4feb0d304a38` | **Permanent showcase** |
| 1200 Harbor Commerce Way (commercial property A) | `d4c41209-2d77-4be6-8c0c-89d712112138` | **Permanent showcase** |
| 1204 Harbor Commerce Way Suite B (commercial property B) | `e861a0ee-caca-4e06-a3d0-d862080e3264` | **Permanent showcase** — demonstrates multi-property history for one commercial account |
| Dana Whitfield portal auth user | `03504599-1358-4913-946a-b1e4ada71a1a` | **Permanent** — Demo customer portal demonstration account (email `dana.whitfield@premier-crm-demo.example`) |
| Dana `customer_accounts` link | (see production `customer_accounts` row for `auth_user_id = 03504599-...`) | **Permanent** |

Fictional-data policy: all names, companies, addresses, phone numbers are
invented. All emails use the `.example` TLD (RFC 2606 reserved — guaranteed
non-deliverable, cannot reach a real external recipient). No real PPM
customer/address/phone/financial data was used as a template.

## Stage 2 — Scenario A: remote estimate

| Record | ID | Category |
|---|---|---|
| Service request (`SR-000009`) | `7e64c88f-bd94-42f1-97af-466abd709917` | **Permanent showcase** |
| Estimate | `e3c862bb-afc3-4b31-9eaa-2c5147573740` | **Permanent showcase** |
| Line item — Gutter cleaning ($185) | `2b2fca53-799b-4dd0-bb1d-d83832321e48` | **Permanent showcase** |
| Line item — Downspout service ($45) | `a380289f-4776-46d3-847c-37797503b1ca` | **Permanent showcase** |
| Quote (`QUO-20260803030206760`) | `c23d6550-c4f8-403d-9f6b-b79716d44c80` | **Permanent showcase** |

Triaged `remote_estimate` — deduped onto Dana Whitfield's existing customer/property from Stage 1 (real `createServiceRequest()` dedupe logic, not a fresh customer). Pricing approved by the temporary driver account (owner role). Quote created via the real `create_quote_from_estimate` RPC, correctly totaling **$230.00** (subtotal $230.00, tax $0.00). Status: `sent` (`sent_at` set) — mirrors `sendQuoteAction()`'s exact DB mutation; no email was attempted (`sendQuoteEmail()` is never called by the population script, and Resend is unconfigured in production regardless).

**A real production defect was found and fixed during this stage**: `create_quote_from_estimate()` never recalculated `quotes.total` after copying line items, leaving every RPC-created quote (including this one, initially) at `$0.00`. Fixed by PR #84 (`fix/rpc-quote-total-recalculation`, commit `a0a2af0`) — a SQL trigger (`recalc_quote_totals()` fired on `quote_line_items` insert/update/delete) now keeps totals correct automatically for every write path. The migration's own one-time backfill corrected this exact quote to $230.00 without any manual repair. Full details: this manifest's population log and the PR itself.

## Stage 3 — Scenario B: site-visit lifecycle (the polished, permanent showcase lifecycle)

| Record | ID | Category |
|---|---|---|
| Service request (`SR-000010`) | `3530873a-08c0-4084-8f0b-42ef562aa4ab` | **Permanent showcase** |
| Site visit | `5366cda8-1c06-47d1-b09b-dc3fa0f09289` | **Permanent showcase** |
| Appointment 1 (original, now `cancelled`, superseded) | `62813301-d0f6-4c38-bd26-fe58129f6f06` | **Permanent showcase** — preserved reschedule history |
| Appointment 2 (replacement, `scheduled`) | `b89db76d-eda1-4591-a1a5-4051101a6ca9` | **Permanent showcase** |
| Photo 1 (vault item) | `28ba6436-4ba9-4b75-b314-0d6e054fb961` | **Permanent showcase** |
| Photo 2 (vault item) | `06ef708f-0d56-4796-a286-d5978ac71b8e` | **Permanent showcase** |
| Estimate | `b65fab8f-d07e-4f16-a747-53c724cbfcbf` | **Permanent showcase** |
| Estimate line item — Deck board replacement ($420) | `77e40707-b484-47c5-87d7-3bbafc49dc59` | **Permanent showcase** |
| Estimate line item — Debris haul-away ($35) | `0c8c9c68-cff6-4c23-ac2a-c1eebbbc5626` | **Permanent showcase** |
| Quote | `446d74e6-6b30-4ef5-bbf7-37d7e00755e3` | **Permanent showcase** |
| Job | `3a406c47-70df-4faf-a46a-78581e26de07` | **Permanent showcase** |
| Working invoice | `b78a3e82-9679-407f-9ab9-939e9c522779` | **Permanent showcase** |
| Deposit requirement (`job_deposits`) | `59332e56-d7fb-415a-92f7-645435c80550` | **Permanent showcase** |
| Deposit invoice | `ae52fe45-a70f-4969-b53c-554ac8ac7019` | **Permanent showcase** |
| Change order | (see `change_orders` row for `job_id = 3a406c47-...`) | **Permanent showcase** |
| Change order revision (incorporated) | (see `change_order_revisions` for the above change order) | **Permanent showcase** |
| Final invoice | `31b514fc-7e26-43cb-96c4-d55bf1fc6811` | **Permanent showcase** |
| Deposit payment ($150, check) | `d2a6f564-698d-4d01-ab7e-93df64abcac2` | **Permanent showcase** |
| Final payment ($520, check) | `40dcd23a-8140-436e-a3a7-2ab994114b13` | **Permanent showcase** |

Full chain, using Dana Whitfield (residential, from Stage 1): service request → triaged `site_visit_required` (verified no estimate/job existed at that point) → scheduled → **rescheduled once** (original appointment preserved as `cancelled`/superseded, never overwritten in place) → started → inspection findings saved in two passes (partial autosave, then the full set: observed conditions, measurements, quantities, materials, labor assumptions, hazards, access issues, 2 photos, notes, recommendations, proposed scope, estimated duration, follow-up flag) → completed (further edits confirmed rejected) → estimate generated via `generate_estimate_from_site_visit` (called twice, proven idempotent — same estimate ID both times, linked solely via `estimates.source_site_visit_id`) → 2 line items added → pricing approved → quote created via `create_quote_from_estimate` (**$455.00**, correct) → sent (no email attempted) → accepted (mirrors `respondToQuoteAction`, real `createJobFromAcceptedQuote` shared service — confirmed exactly 1 job) → job scheduled (`apply_job_scheduling` auto-created the working invoice) → deposit requirement set ($150 fixed) → deposit invoice created via the new `createDepositInvoice()` (**$150.00**, correct) → staff added the original quoted scope onto the working invoice as actuals ($420 + $35) → one change order drafted/proposed by staff, **approved by the customer** (mirrors the real portal action's identity-check-then-service-role-RPC pattern, using Dana's real `customer_accounts` link from Stage 1) → incorporated exactly once (+$65, working invoice total → **$520.00**) → final invoice generated (**$520.00**, correct) → both deposit and final invoices sent and paid in full via the demonstration check-payment method (`DEMO-CHECK-1001`, `DEMO-CHECK-1002` — clearly labeled fictional, no real payment provider ever invoked).

**Two more real production defects were found and fixed during this stage, same class as Stage 2's**:
- `create_quote_from_estimate()`'s fix from Stage 2 was verified correct here too (quote totaled $455.00 immediately, no repair needed).
- `generateFinalInvoiceFromWorking()` never recalculated `invoices.total` after copying line items, leaving the final invoice at `$0.00` initially. Fixed by PR #85 (`fix/final-invoice-total-recalculation`, commit `44cd6d5`) — the same trigger-based pattern (`recalc_invoice_totals()` on `invoice_line_items`). The migration's backfill corrected this exact final invoice to $520.00 automatically; the two payment steps were then completed via a small continuation script once the fix was live.
- Also discovered (not a defect, an architecture note): the working invoice is **not** auto-seeded from the accepted quote — `apply_job_scheduling()` creates it empty by design as an actuals/extras ledger. Staff confirm the original quoted scope onto it manually (via the same `LineItemEditor` used for any draft invoice), same as this population did.

## Stage 4 — Scenario C: direct work order

| Record | ID | Category |
|---|---|---|
| Service request (`SR-000011`) | `11b951f6-79f5-488f-af7e-cb21db92eb1c` | **Permanent showcase** |
| Job | `2b794b0a-583c-4583-a7f2-f35bbc6c0ff8` | **Permanent showcase** |
| Working invoice | `5f0e69bf-62a4-4f1c-8c8d-16a28be99813` | **Permanent showcase** |
| Working invoice line — door adjustment labor ($135) | `1d428947-65fe-490b-b944-7d24c354470c` | **Permanent showcase** |
| Working invoice line — replacement door closer ($105) | `253589ec-5f3b-4754-b380-b775fe094a65` | **Permanent showcase** |
| Final invoice | `e101290b-4a45-4cf0-a317-32d11576f837` | **Permanent showcase** |
| Payment ($240, check) | `05a9e776-1764-4023-a54b-d2dd28354914` | **Permanent showcase** |
| Temp employee auth user (deleted in Stage 5) | `a0c38b17-1e7a-46c7-81d8-f95be563bd45` | Temporary — deleted |
| Temp employee `org_members` row (deleted) | `d93be427-117c-478c-98da-0ba600838bde` | Temporary — deleted |
| Temp subcontractor auth user (deleted in Stage 5) | `8d26dcbc-0bda-4270-a88a-40bbe436732f` | Temporary — deleted |
| Temp subcontractor `org_members` row (deleted) | `b685a517-2d37-4507-bda9-260e5d1aeb98` | Temporary — deleted |

Uses Bramwell Retail Group (commercial, from Stage 1) — service request deduped onto the existing customer/property (property A). **Authorization boundary proved at the real callable RPC before the real triage was attempted**: a temporary employee-role Demo-only user and a temporary subcontractor-role Demo-only user (both synthetic `.example` addresses, both belonging only to the Demo org) each attempted `record_request_triage(decision='direct_work_order', ...)` and were both denied (`Role {employee|subcontractor} does not have canCreateDirectWorkOrder`) with zero mutation — the service request's status remained `new` and zero jobs existed for Bramwell afterward. Only then did the driver (owner role) perform the real triage: `direct_work_order`, `authorization_type='standing_agreement'`, `authorization_reference='DEMO-STANDING-MAINTENANCE-AGREEMENT-001'`, `not_to_exceed_amount=$350.00` — creating **exactly one job, no estimate, no site visit**. All authorization fields verified preserved on the job row. No deposit requirement was created (deliberate, per this scenario). Job scheduled (`apply_job_scheduling` auto-created the working invoice); 2 line items added ($135 labor + $105 material = **$240.00**, under the $350 not-to-exceed amount, verified before and after each total check); final invoice generated (**$240.00**) and paid in full via the demonstration check-payment method (`DEMO-CHECK-2001`).

## Stage 5 — Temporary identity cleanup

The org-membership half of cleanup for all three temporary population-driver identities succeeded cleanly: all three `org_members` rows were deleted, leaving the Demo org with exactly one member (Kevin, owner). The temporary employee and subcontractor auth users were fully deleted (`auth.users` row and all) since nothing referenced them — they only ever made denied, no-op RPC calls.

**The temporary driver auth user (`c095f5bd-9bae-4581-a966-7a16f6668e56`) could not be deleted** — it is referenced by foreign keys as the legitimate audit-trail actor on 32 permanent Demo records (2 `estimates.pricing_reviewed_by`, 2 `jobs.created_by`, 2 `quotes.created_by`, 26 `activity_log.actor_user_id` rows across Scenarios A–C). Deleting it would either fail outright (observed) or require rewriting that provenance to attribute the population work to someone else (e.g. Kevin), which would falsify who actually performed each action — explicitly rejected.

**Resolution**: the driver identity is retained but rendered fully inert rather than deleted:
- `org_members`: zero rows in any organization (confirmed: 0 in Demo, 0 in PPM, 0 anywhere) — the account cannot resolve an active organization and has no access to any staff page or guarded RPC that depends on org membership.
- Banned via Supabase Auth's `ban_duration` mechanism, effective immediately, until `2126-07-10` (~100 years) — blocks all future sign-in and token-refresh attempts.
- Email confirmed synthetic: `demo-population-driver-1785725852016@premier-crm-demo.example` (RFC 2606 reserved TLD, non-deliverable, no real person represented).
- No invitation or password-reset path is pending for this account.
- Not a Demo staff persona — do not reuse it for future population/training work, do not give it a new membership.
- **Limitation**: Supabase's admin API does not expose a direct "revoke all issued refresh/access tokens" call independent of the ban mechanism. Any JWT issued during this session's population work is short-lived (~1 hour) and, given the elapsed time since last use, has already expired naturally; the ban prevents any new token from ever being issued. This is a documented limitation, not an unresolved risk — with zero org memberships, even a still-valid token could not resolve any organization or pass any capability check.
- Kevin's identity and every FK reference pointing to him were **not** touched — no provenance was rewritten.

## Reset / rebuild guidance

- Permanent showcase records (Stage 1 customers/properties/portal account,
  and the "polished" completed lifecycle from Scenario B) should not be
  deleted casually — they are the primary demonstration content.
- Repeatable/training records (see Stages 2–4 sections once filled in) are
  safe to reset: delete the request/estimate/site-visit/quote/job chain for
  that scenario and re-run the corresponding population script.
- Numbering: Demo estimate/quote/job/invoice numbers continue the platform's
  **global** numbering sequences (shared with PPM) — this is a known,
  pre-existing platform limitation (not introduced by this population), not
  something this population attempted to work around. See
  `docs/implementation/premier-crm-demonstration-organization.md` for the
  full note and the Platform v1.0 follow-up recommendation.
