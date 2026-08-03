# Hazards Section — Proposal (Design Only, Not Implemented)

Status: **proposal for Kevin's review.** No schema, template, or component changes have been made as part of this document. Part of the Pre-Base44 Workflow Refinement phase.

## Current implementation

The `hazards` field lives inside the published v1 `General Property Maintenance` inspection template (`supabase/migrations/20260802010400_inspection_templates.sql`):

```json
{
  "key": "hazards",
  "type": "multiselect",
  "label": "Hazards",
  "required": false,
  "displayOrder": 7,
  "options": ["electrical", "roof-height", "asbestos-suspected", "structural", "other"],
  "visibility": "staff_only",
  "estimateMappingHint": "none"
}
```

Rendered today by the generic `multiselect` case in `apps/web/app/(app)/site-visits/_components/inspection-form.tsx` — a flat row of checkboxes, no grouping, no severity, no free-text companion for "other," no "none observed" affordance. `required: false` means an inspector can leave it entirely blank with no visual distinction between "checked — no hazards present" and "not looked at yet."

Separately, `properties.hazards TEXT[]` (`supabase/migrations/0002_crm_core.sql`) is a freeform property-level array, displayed read-only on the property detail page (`property.hazards?.join(', ')`), with no UI to edit it anywhere in the app — it's populated only outside the application (e.g. import). This is a distinct, longer-lived "known hazards at this address" record, not the per-visit inspection field. This proposal is scoped to the per-visit inspection field only; the property-level field is out of scope but noted because a future version could plausibly read from it to pre-populate or cross-reference the visit-level checklist.

## Problems this proposal addresses

1. **No "none observed" signal.** An inspector who checked the property and found nothing hazardous leaves the field empty — indistinguishable from an inspector who forgot to look at it at all. There is no positive "checked, clear" state.
2. **"Other" has no accompanying detail.** Checking "other" records nothing about what the hazard actually is.
3. **No severity or action-needed signal.** "Structural" could mean "note it and move on" or "stop work, this needs a specialist" — today both look identical to whoever reviews the visit later.
4. **Flat category list may not match how the business actually encounters hazards.** Only Kevin can confirm whether `electrical / roof-height / asbestos-suspected / structural / other` is the right taxonomy for Premier's actual jobs, or whether some categories are irrelevant and others are missing (e.g. utility lines, unstable footing, animals, chemical/mold, confined space).
5. **Completion readiness is silent on hazards.** `required: false` means a visit can be marked complete with hazards never addressed either way — there's no policy decision recorded here, just an absence.
6. **Mobile usability of a flat checkbox row is cramped** at the current input density, same class of issue as the measurement/quantity/material list fields already fixed this pass.

## Proposed direction (for discussion, not final)

**A. Explicit tri-state entry, not a bare checkbox list.**
Replace "leave blank = nothing" with a required first choice: **"No hazards observed"** vs. **"Hazards present"**. Only when "Hazards present" is selected does the category multiselect expand. This makes "checked, nothing found" a real, distinguishable, positive state — and can be made `required: true` without forcing inspectors to tag categories they didn't observe.

**B. Keep multi-select for categories, but revisit the taxonomy with Kevin.** Candidate list to review (not proposed as final): `electrical`, `roof-height / fall-risk`, `asbestos-suspected`, `structural`, `unstable-ground`, `animal`, `chemical-mold`, `utility-line`, `other`. Whether to keep exactly the current five or expand is a business-knowledge question, not a UX one — flagged for Kevin's decision, not decided here.

**C. "Other" gets a required companion free-text note**, shown only when "other" is checked (same conditional-reveal pattern as A). Avoids adding an always-visible text field that's irrelevant 95% of the time.

**D. Optional per-hazard severity / action-needed tag**, e.g. `note-only` vs. `stop-work / needs specialist`. This is the piece most likely to need Kevin's judgment on whether it's worth the added form complexity — proposed as optional-if-approved, not required for the rest of the proposal to land.

**E. A short, single "Employee safety notes" free-text field**, separate from the hazard category tags — for things like "wear respirator near attic insulation" that aren't a property hazard exactly but matter for whoever does the work. Distinct from `accessIssues` (already exists, about reaching the property) and `laborAssumptions` (about job scope/time), so this would be a new field, not a repurposing of an existing one.

**F. Completion-readiness policy — explicitly Kevin's call.** Two options, not a recommendation either way:
   - Keep hazards non-blocking for completion (current behavior, just made visually explicit instead of silently absent).
   - Require *some* hazards answer (even if it's "none observed") before a visit can be marked complete, mirroring how `customerConcerns`/`observedConditions`/`proposedScope` are already `required: true`.

**G. Staff-only stays staff-only.** No part of this proposal suggests exposing hazard detail to the customer portal — `visibility: "staff_only"` is correct today and nothing here argues for changing it. If a customer-facing "we noted the following access/safety items" summary is ever wanted, that would be a deliberately separate, reviewed decision — not a byproduct of this change.

**H. Mobile usability** — apply the same treatment already shipped this pass for measurement/quantity/material rows: visible labels, adequate tap targets (`h-10`+ checkboxes/pills instead of native tiny checkboxes), and the categories laid out as a wrapped grid of tap-friendly toggle pills rather than a dense inline checkbox row.

## What is explicitly NOT proposed here

- No change to `properties.hazards` (the separate property-level field) in this pass.
- No customer-facing exposure of hazard data.
- No schema or template-version change has been made — the current published v1 template stays exactly as-is until Kevin approves a direction, at which point the correct mechanism is a **new template version** (per the existing publish-immutability model — the current published version can never be edited in place), not a mutation of the live one.
- No decision made on final taxonomy, severity, or the completion-readiness policy question — all three are called out above as needing Kevin's input.

## Questions for Kevin

1. Is the candidate five/nine-item taxonomy in §B close, or does the real hazard list look different for Premier's actual jobs?
2. Is per-hazard severity/action-needed worth the added form complexity (§D), or is a flat "flagged, someone will look at it" sufficient for now?
3. Should hazards become a required field (even just to force a "none observed" answer) before a visit can be completed, or stay optional?
4. Any interest in the property-level `hazards` array eventually feeding into or cross-checking the per-visit field, or should those stay fully independent for now?
