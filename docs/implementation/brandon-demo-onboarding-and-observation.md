# Brandon Demo Onboarding — Deferred by Kevin Before First-Login Verification

**Status: deferred by Kevin before first-login verification.** Not failed, not complete — paused at Kevin's explicit request in favor of Kevin personally testing the Demo employee experience first (see `docs/implementation/kevin-demo-ui-observation.md`).

## What was completed

- **Identity verified** (2026-08-03): auth user `7eda95cf-74ca-4c26-a15f-2141e3789be5`, email `brandonjfleenor28@gmail.com`, unconfirmed, never signed in, not banned.
- **A real structural conflict was found and reported before any write**: the real accept-invite flow (`apps/web/app/auth/accept-invite/actions.ts`) refuses to activate anything when more than one pending invite exists for an email. Brandon already had exactly one pending PPM invite (`org_invites.id = 5b33004b-...`, expires 2026-08-15). Creating a normal second (Demo) invite would have broken acceptance of **both**.
- **Kevin approved a one-time exception**: add the Demo `org_members` row directly (no `org_invites` row created — no conflict introduced), confirm Brandon's email via the supported Supabase Admin API (`updateUserById(..., {email_confirm: true})`, not raw SQL), then trigger the same `resetPasswordForEmail()` call the app's own `/forgot-password` page uses so Brandon could set his own password.
- **Demo membership created**: `org_members.id = ebdd5826-bacc-48b8-9ec6-bbccfcd2d3ef`, role `employee`, status `active`, org `a0c9b59d-77d9-48ad-9760-8555c9ed8fe5`.
- **Email confirmed**: `email_confirmed_at` set via the Admin API.
- **A password-reset email was triggered** via Supabase Auth (independent of Resend, which remains unconfigured) — this was sent to Brandon's real inbox before the plan changed.

## What was explicitly NOT done, per Kevin's follow-up instruction

- **No further account, membership, invite, password-reset, or login action was taken on Brandon's account after this point.**
- No additional reset email was sent.
- No password or session was ever created, inspected, or handled by this process — Brandon (or now, on hold, nobody) controls that step.
- No Brandon Training Scenario was created.
- **First-login verification was never performed** — login success, org resolution, dashboard counts, PPM-denial checks, and the full employee capability matrix (allowed/denied lists) were **not** proven against a real Brandon session. Do not treat any of these as verified for Brandon specifically — they were separately proven generically (against the `employee` role in general, and via the temporary test accounts used during Phase 4 Scenario C) but not for Brandon's own live session.

## Current state (unchanged, preserved)

| Item | State |
|---|---|
| PPM pending invite | `5b33004b-...`, status `pending`, unchanged, expires 2026-08-15 |
| PPM membership | None |
| Demo membership | `org_members.id = ebdd5826-...`, role `employee`, **exists and is preserved** — not deleted or altered, per Kevin's instruction not to touch it further without a separate request |
| Email confirmation | Confirmed (`email_confirmed_at` set) |
| Password | Unknown/unset by this process — a reset email was sent to Brandon before the plan changed; whether Brandon has acted on it is unknown |

## Resuming later

If Brandon onboarding resumes: Demo membership already exists (idempotent — no need to recreate), email is already confirmed. The only remaining step is Brandon (or Kevin, following the same Admin-API pattern) completing password setup and Brandon's own first sign-in, followed by the full first-login and capability verification this document explicitly did not perform.
