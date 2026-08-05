# Forge Base44 Batch 6 — Team Availability

## Base44 reference

- Visual/reference repo: `Bozo012/Forge-Base44-UX`
- Reference commit: `497d0693cccafd89315ec17c3be9885cfaae5c84`
- Premier base commit: `fafe06341e453f97eeb03ac03b3b96762ab625eb`

## Implemented

- Added the Base44 availability vocabulary as real CRM data:
  - `available`
  - `on_job`
  - `off_shift`
  - `on_leave`
- Added `public.team_member_availability` with RLS and authenticated grants.
- Kept Premier auth, org membership, Supabase RLS, and existing invite flow authoritative.
- Updated `/team` to match the Base44 staff-card layout while using real org members, profiles, auth emails, site-visit assignments, and persisted availability.
- Display rule:
  - `off_shift` and `on_leave` override assignment-derived state.
  - explicit `on_job` displays as `on_job`.
  - otherwise active site-visit assignments display as `on_job`.
  - otherwise the member displays as `available`.
- Removed Website content from `/today`; it now lives only under Settings.
- Prefilled `/settings/website` with the current public marketing-site fallback copy when no CRM-backed settings row exists yet.

## Intentional Base44 simplification

- Availability is a small explicit model instead of spreading state across roles, schedules, and notes.
- The UI presents one operational status per staff member, but the resolver still respects Premier's real assignments.
- Staff can update their own availability through RLS; owners/admins can update any team member in their org.

## Backend notes

- Jobs do not currently have an assigned staff column. `on_job` is derived from `site_visits` and active `site_visit_appointments` only.
- If job crew assignment becomes a first-class feature, add a job assignment table rather than overloading `jobs.created_by`.
- Skills are stored on `team_member_availability.skills` for the team-card presentation, but no skill editor is exposed in this batch.

## Validation

- `pnpm vitest run packages/db/queries/team-availability.test.ts`
- `pnpm --filter @premier/db typecheck`
- `pnpm --filter @premier/web typecheck`
