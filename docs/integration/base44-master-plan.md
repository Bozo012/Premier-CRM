# Base44 → Forge Integration: Master Plan

## Purpose

This is the authoritative coordination document for reconciling the remaining
Base44 UX reference (`Forge-Base44-UX`) with the production Forge application
(`Premier-CRM`). It is maintained by the manager session and updated as work
proceeds. Workers report status via `worker-handoffs/<worker>.md`; the manager
integrates accepted work and records decisions in `base44-decision-log.md`.

## Repositories

| Repo | Role | Authoritative for |
|---|---|---|
| `Bozo012/Premier-CRM` | Forge application | backend, schema, RLS, auth, domain models, queries, actions, permissions, prod workflows, tests |
| `Bozo012/Forge-Base44-UX` | presentation/interaction reference | visual/interaction patterns only — never backend behavior |
| `Bozo012/premier-property-maintenance` (remote slug `PPMSITE`, same repo) | public marketing site + portal doorway | public-to-Forge handoff only; otherwise read-only for this program |

## Verified checkpoint (this session)

- Premier-CRM `origin/main`: `76bbad7c09ee0a7d51d703e42d9f878b233f53c4` (Batch 7 merge, PR #119). Local `main` fast-forwarded clean, no divergence.
- Migration state: 78 repository migration files, 78 applied on `premier-crm-prod` (`apnbpcauqrjvkoleisde`), zero pending. (Plan doc's "77" was an approximate figure from an earlier count; verified precise count is 78/78 — no material difference, still zero pending, no restart needed.)
- `supabase/migrations/20260805172955_backfill_request_job_links.sql` confirmed **does not exist**. Deferred — see `base44-deferred-data-integrity.md`.
- `Forge-Base44-UX` `origin/main`: `497d0693cccafd89315ec17c3be9885cfaae5c8`, frozen as the active visual reference for this program. 44 commits of auto-generated (`File changes`) route/fixture scaffolding since the last-known SHA (`adee72e`) — no platform/auth infrastructure changes, all additive routes/fixtures/styles.
- Marketing repo (`PPMSITE` remote): working tree clean on `fix/state-code-validation` (up to date with its origin branch), `main` at `0716bfa`. No dangling mutating-checkout state found. Remains read-only for this program except where the portal-handoff worker's scope requires it.

## Coordination baseline

Branch: `integration/base44-completion-manager`, branched from Premier-CRM `origin/main` @ `76bbad7c`.

Contains this document plus:
- `base44-route-matrix.md` — per-route integration status
- `base44-agent-board.md` — worker assignments and current status
- `base44-decision-log.md` — binding decisions with rationale
- `base44-deferred-data-integrity.md` — explicitly out-of-scope defects tracked for future work
- `worker-handoffs/` — one file per worker, written by that worker

## Manager authority order

1. current Premier-CRM implementation
2. current schema and RLS
3. existing server actions, RPCs, and queries
4. existing tests
5. current repository documentation
6. previously integrated Base44 batches
7. the pinned Base44 presentation reference (`497d0693`)
8. documented Forge business workflows

Newer Base44 code is not automatically better than integrated Forge code.

## What the manager owns directly

Batch 8 (Requests + Site Visits + Inspection) is implemented directly by the
manager session on `agent/forge-ux-batch-8-requests-site-visits-inspection`,
per the pre-approved plan. All other batches are worker-owned per the agent
board. Shared/global files (navigation, providers, shared route maps,
migrations, package manifests) are manager-owned regardless of batch.

## Non-negotiables for this entire program

- No merges to `main` without human review.
- No production migrations, deploys, or data mutation.
- No Base44 SDK, auth, platform infra, or mocked persistence in Forge code.
- No schema/RLS changes bundled into UX-integration PRs.
- The `service_requests.job_id` NULL-backfill defect stays fully separate (see deferred doc).

## Status

Coordination baseline created and pushed. Batch 8 implementation follows on
its own branch. Worker sessions may begin once the baseline commit SHA below
is reported.
