# Resume Prompt

Copy-paste this entire block into a fresh Claude Code session after an abrupt shutdown (power/internet loss) to resume Premier CRM work accurately.

---

```
Open C:\dev\Premier-CRM and resume the Premier CRM session.

Before doing anything else, in this order:

1. Read CLAUDE.md.
2. Read docs/SESSION_STATE.md — this is the current execution status: what's
   done, what's next, known issues, environment state, approval gates.
3. Read docs/CLAUDE_CONTEXT.md — durable architecture and rules.
4. Read docs/BASELINE_V1.md.
5. Read docs/ARCHITECTURE_AND_DEVELOPMENT_GUIDE.md.
6. Read docs/PREMIER_PLATFORM_VISION.md if it exists (it may not yet —
   SESSION_STATE.md will say).

Then inspect actual repository state and compare it to SESSION_STATE.md
before changing anything:

- git branch --show-current
- git log -1 --format="%H %ci %s"
- git status --short
- git log --oneline -10
- git log --oneline origin/main..HEAD and git log --oneline HEAD..origin/main
  (to see if the local branch is ahead/behind what SESSION_STATE.md recorded)

If actual state differs from what SESSION_STATE.md describes (different
branch, different HEAD, uncommitted changes it didn't mention, a merged PR
it listed as pending, etc.), stop and report the discrepancy before doing
anything else — do not assume the document is still accurate, and do not
silently proceed on either the document's version or the repo's version
without flagging the mismatch.

Before any database work: verify which Supabase project the CLI is
currently linked to (cat supabase/.temp/project-ref) and confirm it
matches what you intend to touch. Never assume — SESSION_STATE.md records
what it was linked to at checkpoint time, but that can change.

Before any Playwright/e2e work: verify the live application target
(dev server env, or which deployment is being tested) actually points at
premier-crm-e2e, not premier-crm-prod. Preserve both production-safety
guards (apps/web/app/api/e2e-health/route.ts's 404-on-production behavior,
and playwright.config.ts + tests/e2e/global-setup.ts's refusal to run
against the prod project ref) — never remove or weaken either.

Resume from SESSION_STATE.md's "Next Exact Step" section. Do not
re-architect anything, do not repeat work already marked complete and
verified in "Completed This Session," and do not treat this as a fresh
planning exercise — it's a continuation.

Stop and ask before proceeding past anything listed under
SESSION_STATE.md's "Approval Gates" section — those are unresolved
decisions that require Kevin's explicit sign-off, not something to infer
or proceed past based on context alone.
```

---

## Notes for whoever pastes this

- If `docs/SESSION_STATE.md` itself looks stale (old timestamp, describes a branch that no longer exists, etc.), that's a signal a session ended without updating it — treat its contents as a *starting hypothesis* to verify against the real repo state, not as ground truth.
- This file and the prompt above should stay in sync with whatever `docs/SESSION_STATE.md` currently requires readers to do first — if the recovery-checkpoint routine changes, update both together.
