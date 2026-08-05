# Deferred: `service_requests.job_id` NULL backfill

**Not part of the Base44 UX integration program.** Tracked here so it isn't
lost, not so it gets picked up incidentally by a UX batch or worker.

## The defect

`service_requests.job_id` is `NULL` for at least two rows (SR-000013,
SR-000010) that have a complete `request → estimate → quote → job` chain
resolvable through existing FKs. The linkage was never backfilled when those
chains completed historically.

## Verified scope (this session)

- `supabase/migrations/20260805172955_backfill_request_job_links.sql` does
  not exist in the repo.
- Production (`premier-crm-prod`, `apnbpcauqrjvkoleisde`): 78 applied
  migrations, 78 repository migration files, zero pending. This defect has no
  pending/half-applied migration associated with it — it simply has never
  been addressed.
- Confirmed non-blocking for the current UX integration program: affects
  display for a small number of historical rows only, not the query pattern
  or architecture any Base44 batch builds on.

## Required shape of the eventual fix (not being done now)

- Its own future branch, separate from any UX batch.
- Generic, idempotent migration — `WHERE job_id IS NULL` guard, joins off the
  confirmed FK chain (`service_requests → estimates → quotes → jobs`), not
  hardcoded to SR-000013/SR-000010.
- Relationship-integrity verification query/check.
- Regression coverage on whatever currently sets `job_id` (so the backfill
  can't silently diverge from live-path behavior).
- Separate PR, separate production-deployment approval.

## Explicit constraints for all Base44 integration workers and the manager

- Do not create, apply, or deploy this migration as part of any batch in this
  program.
- Do not use SR-000013 or SR-000010 as test fixtures for Requests/Site
  Visits/Estimates/Jobs work — their NULL `job_id` is exactly the known
  anomaly, not representative data.
- Where current authoritative queries can safely derive downstream
  relationships (e.g. via the estimate/quote chain rather than the NULL
  `job_id` column), they may display those relationships. Do not add
  fallback business logic that fabricates or guesses linkage to work around
  the NULL rows.
