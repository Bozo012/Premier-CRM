# Kevin Demo UI Observation — Session Log

Purpose: capture real usage friction from Kevin personally working through
the CRM as an ordinary Demo employee, to inform pre-v1.0 cleanup and the
later Base44 UX phase. This is evidence gathering, not a redesign — see
`docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md` and
`docs/implementation/premier-crm-demonstration-organization.md` for the
underlying architecture this UI sits on.

## Test account

- **Account**: `sommerskevin3@gmail.com` (auth user `daaecd54-5c4d-49cb-8d79-96ac3a705504`)
- **Demo membership**: `org_members.id = ec13d3e3-b6a9-494a-a0da-da54f1a6155f`, role `employee`, joined 2026-08-03.
- **Other memberships on this account**: PPM `employee` (pre-existing, real, one of the 4 legitimate PPM members already accounted for throughout this project — unchanged by this phase).
- **No password reset was performed** — the account already has a confirmed email and a working password from prior use.

### Exact steps to sign in and begin

1. Sign in normally at the staff login page with `sommerskevin3@gmail.com` and your existing password.
2. This account now has **two active organization memberships** (PPM and Demo), with no explicit preference set — it will **default to the oldest membership (PPM)** on first login, not Demo.
3. Use the organization switcher (visible on `/today` once you're signed in, since you now have more than one org) to select **Premier CRM Demonstration**.
4. From there, you're operating as an ordinary Demo employee — the same role/capability boundary Brandon would have had.

## Kevin UI Observation Scenario (repeatable training record)

| Field | Value |
|---|---|
| Service request | `cb7e6d82-a61e-474c-b344-51b8382a2155` (`SR-000012`) |
| Site visit | `2422de29-aa04-4386-be5f-03786904d43e` |
| Current state | `awaiting_scheduling` — triaged `site_visit_required`, deliberately left unscheduled |
| Customer/property | Dana Whitfield, 482 Fernwood Lane (Stage 1 permanent customer — this training request is a separate, resettable record, not part of her polished Scenario A/B showcase chain) |

This record is intentionally left exactly where you should pick it up: found via the request queue, awaiting your first action (scheduling). It is safe to reset — re-triage it, or delete and recreate a fresh one — at any point without affecting the permanent showcase records from Phase 4.

**Suggested walkthrough** (not required to follow in order): find the request → schedule the visit → reschedule it once → start the visit → enter findings → confirm autosave persists → upload a photo → complete the visit → generate the estimate → edit the estimate content → notice where owner pricing approval is required (you'll need to switch back to your real owner account for that step) → once approved, return as the employee account to create and send the quote.

## Report format

For each piece of friction, report:

- **Screen/route** (e.g. `/site-visits/[id]`)
- **Task attempted**
- **Expected next action** vs. **actual next action presented**
- **Taps/clicks** if it felt excessive
- **Mobile usability**, if tested on a phone
- Anything unclear: wording, missing context, redundant info, confusing status, permission-related confusion, loading/performance, autosave confidence, error-message quality

I'll classify each one as: blocking defect / functional bug / permission-security defect / major UX friction / minor UX friction / enhancement / training-documentation issue — then recommend: immediate scoped fix, pre-v1.0 cleanup, Base44 redesign item, or no-change/training-clarification-only. I won't fix anything until you've reported it.

## Checkpoint 1 (2026-08-03)

Kevin completed the employee-side walkthrough through estimate generation
and stopped at pricing approval, as intended (owner pricing approval is
correctly out of employee reach). Working correctly: site-visit scheduling,
start, inspection entry, autosave, completion, estimate generation, line-item
display. Employee account correctly lacks `canApproveEstimatePricing`. The
estimate generated during this checkpoint (`estimates.id = 144ffde5-afcf-4a88-b772-e89e98d6597a`,
still `draft`) is a byproduct of Kevin's own walkthrough — treat it as part
of the repeatable training scenario, not the polished Phase 4 showcase.

## Findings log

| # | Screen/route | Task | Expected | Actual | Severity | Recommendation | Status |
|---|---|---|---|---|---|---|---|
| 1 | `/estimates/[estimateId]` | Employee views a draft estimate awaiting pricing approval | No actionable control the employee can't use; a clear way to signal the estimate is ready for owner review | An active "Approve pricing" button was rendered; clicking it surfaced the raw error `Role does not have canApproveEstimatePricing`. No way to submit for review at all. | Functional/UX defect (not a permission-boundary failure — backend correctly denied it) | Immediate scoped fix | **Fixed** — PR #86, commit `96a40e6`, deployed. Added a full submit/approve/return-for-changes/resubmit handoff (`PricingReviewPanel` rewrite + `request_estimate_pricing_review`/`return_estimate_pricing_for_changes` RPCs). Employee/subcontractor now see "Submit for pricing review" and plain-language status text; owner/admin see who submitted and when, plus Approve/Return for changes. 14 new tests. |
| 2 | `/estimates/[estimateId]` | View an estimate generated from a completed site visit | No stale "Schedule site visit" control (visit is already done) | Legacy `AdvanceStatusButton` still rendered "Schedule site visit" for any `draft`-status estimate, regardless of origin | Functional UX defect | Immediate scoped fix | **Fixed** — same PR. Estimates with `source_site_visit_id` set now show "Generated from completed site visit" + a link to the visit instead. Remote/manual-estimate scheduling (no source site visit) unchanged. |
| 3 | Bottom navigation (mobile) | General navigation | Clear, tappable separation between sections | "Customers" and "Requests" visually run together; badge placement adds crowding | Major UX friction | Upcoming UI refinement pass | Documented, not yet addressed |
| 4 | Request list (mobile) | Scanning the request queue | Compact, scannable cards | Cards are tall; repeated phone/email fields on every card slow scanning | Mobile-density friction | Upcoming UI refinement pass | Documented, not yet addressed |
| 5 | Inspection form — measurement fields | Entering a measurement (label / value / unit) | Clear which input is which | Row layout ambiguous — e.g. `10 \| value \| Ft` gives no visual cue which column is label vs. numeric value vs. unit | Major UX friction | Upcoming UI refinement pass (hazards/inspection-form pass specifically) | Documented, not yet addressed |
| 6 | Site-visit inspection form (overall) | Full inspection entry | — | Functionally worked; long-form usability and the hazards section need refinement | Minor UX friction / enhancement | Upcoming UI refinement pass — waiting on Kevin's detailed notes before touching the template/UI | Documented, not yet addressed |

## Next checkpoint

Findings #1 and #2 are live in production — Kevin can resume the training scenario (`estimates.id = 144ffde5-...`) and submit it for pricing review through the real new flow, switch to the owner account to approve (or return for changes) it, then continue through quote creation/sending as originally planned. Findings #3–6 are recorded for the upcoming UI refinement pass and were not touched this round, per scope.
