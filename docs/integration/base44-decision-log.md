# Base44 Integration — Decision Log

Binding decisions made from repository evidence. Each entry: decision,
evidence, why it's reversible/safe, date.

## 2026-08-05 — Requests/Site Visits worker reassigned to audit-only

**Decision:** `agent/base44-requests-visits` does not implement product
changes. It audits and adds tests against the manager's Batch 8 branch.

**Evidence:** Batch 8 (manager-owned) and this worker's originally prepared
scope both target `requests/**`, `site-visits/**`,
`requests/_components/triage-panel.tsx`, and
`site-visits/_components/inspection-form.tsx`. Two independent implementers
editing the same files concurrently would produce unmergeable or silently
conflicting changes to triage/inspection business-critical flows.

**Reversible:** Yes — purely an assignment/process decision, no code impact.

## 2026-08-05 — Coordination baseline is documentation-only

**Decision:** `integration/base44-completion-manager` contains only
`docs/integration/**`, no application code changes, so it can be branched
from freely by all workers without inheriting in-progress behavior changes.

**Evidence:** Diff of this branch vs `origin/main` is additive docs only.

**Reversible:** Yes.

## (carried forward from approved Batch 8 plan — binding for that batch)

1. **Triage consolidation** — the RPC-backed `TriagePanel`
   (`record_request_triage`/`correct_request_triage`) is the authoritative
   Request triage workflow. Legacy direct actions
   (`createEstimateFromRequestAction`, `createJobFromRequestAction`,
   `markRequestReviewedAction`) are audited action-by-action, not
   blanket-preserved or blanket-removed. See Batch 8 plan for the full
   procedure and the audit findings once complete (recorded here as they land).

2. **Component consistency — no migration.** `requests/page.tsx` and
   `site-visits/page.tsx` have byte-identical import patterns from
   `components/forge/presentation.tsx`, used by 18 files app-wide.
   `components/ui/{page-header,empty-state,error-state}.tsx` is used only by
   `/today`. Decision: keep `forge/presentation.tsx` for Requests and Site
   Visits; do not migrate onto `/today`'s component set; no app-wide
   presentation-system standardization decision is made here.

3. **Hazards out of scope.** `docs/ux/hazards-section-proposal.md` is blocked
   on product/taxonomy decisions outside this program; only the existing
   generic field rendering is preserved.

4. **Historical `service_requests.job_id` NULL rows** (SR-000013, SR-000010)
   are not backfilled, not used as fixtures, and not treated as evidence that
   new routing is broken. See `base44-deferred-data-integrity.md`.
