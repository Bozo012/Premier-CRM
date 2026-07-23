# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential reading

Before starting any non-trivial task, read:
- `CONVENTIONS.md` — locked tech choices, naming rules, routing decisions, DB conventions (treat as law)
- `ARCHITECTURE.md` — layer diagram, where things live, data flow examples

## Commands

```bash
# Development
pnpm dev                  # start Next.js dev server (apps/web)
pnpm build                # build all packages
pnpm lint                 # ESLint 9 flat config across all packages
pnpm typecheck            # tsc --noEmit across all packages

# Database
pnpm db:types             # regenerate packages/db/types.ts from Supabase — run after every migration

# Jobber import
pnpm jobber:preview       # preview Jobber CSV import
pnpm jobber:import        # run Jobber CSV import

# Package-scoped commands
pnpm --filter web dev     # run dev server for apps/web only
pnpm --filter @premier/db build
```

## Monorepo structure

```
apps/web/          Next.js 15 App Router (the CRM + customer portal)
packages/db/       Supabase typed queries — one file per entity in queries/
packages/shared/   Result<T> type, ErrorCode enum, Zod schemas
packages/ai/       Claude tool definitions and dispatch
packages/automation/ Rule engine (trigger → conditions → actions)
supabase/
  migrations/      Immutable SQL migrations (sequential NNNN_name.sql)
  functions/       Edge functions for async work (transcription, briefing, etc.)
```

## Route layout (apps/web/app/)

| Path | Purpose |
|------|---------|
| `(app)/` | Authenticated CRM routes (today, customers, jobs, quotes, invoices, vault, chat, settings) |
| `(public)/q/[token]/` | Customer-facing magic-link quote view |
| `api/webhooks/[service]/` | Stripe, Twilio, Resend inbound webhooks |
| `api/assistant/tools/` | Single AI tool dispatch endpoint |
| `api/v1/` | Mobile API (server actions re-exported as route handlers) |
| `login/`, `portal/` | Auth pages |

## Key patterns

**Result<T> — never throw from server actions:**
```ts
// packages/shared/result.ts
type Result<T> = { success: true; data: T } | { success: false; error: string; code: ErrorCode }

// server action usage
return ok(data)   // { success: true, data }
return err("Not found", ErrorCode.NOT_FOUND)  // { success: false, ... }
```

**Where to put new code:**
- Form submission → server action in `app/[route]/actions.ts`
- DB query → `packages/db/queries/[entity].ts`
- Shared type or schema → `packages/shared/`
- Background/async work → Supabase Edge Function in `supabase/functions/`
- Webhook → `app/api/webhooks/[service]/route.ts`
- New AI tool → `packages/ai/tools/`, register in `packages/ai/dispatch.ts`

**DB types:** `packages/db/types.ts` is generated — run `pnpm db:types` after schema changes, never edit by hand.

**Migrations:** Add new `.sql` files in `supabase/migrations/` using sequential `NNNN_description.sql` naming. Never edit existing migrations.

**`"use client"` directive:** Always include a one-line comment explaining why interactivity requires a client component.

## AI model routing

| Task | Model |
|------|-------|
| Classification, entity extraction | Claude Haiku 4.5 |
| Chat, summaries, drafting | Claude Sonnet 4.6 |
| Briefing generation, complex synthesis | Claude Opus 4.7 |
| Embeddings | OpenAI text-embedding-3-large |
| Transcription | Deepgram (cloud) / Whisper via LM Studio (local) |

## Environment variables

See `.env.example` for the full list. Required for local dev: Supabase URL + keys, Anthropic key, Resend key. Optional: Deepgram, Twilio, Stripe, Google Maps, OpenAI.

## When in doubt

1. Check existing patterns in the codebase
2. Check `ARCHITECTURE.md` and `DECISIONS.md`
3. Document any new pattern choice in `DECISIONS.md`
