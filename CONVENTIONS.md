# Conventions

**Read this on every session.** These rules are non-negotiable. If a request would violate one, push back instead of complying.

## Tech stack — locked

- **Framework:** Next.js 15+ App Router. Never Pages Router.
- **Language:** TypeScript strict mode. No `any` without an explicit comment explaining why.
- **Database:** Supabase (Postgres 15 + pgvector + PostGIS). Always use Supabase typed client, never raw connections.
- **Styling:** Tailwind CSS + shadcn/ui. No CSS modules, no styled-components, no inline styles except for dynamic values.
- **State:** Server components by default. Client components only when interactivity demands it (`"use client"` directive must include a comment explaining why).
- **Forms:** React Hook Form + Zod schemas (shared across client validation and server validation).
- **Validation:** Every server action validates input with Zod. Always.
- **Auth:** Supabase Auth with email + password for contractor/staff flows. Contractor/staff onboarding is invite-only from an owner/admin-managed flow. Customer-facing magic links are allowed only for portal-style access. RLS enforced at database level on every table.
- **Package manager:** `pnpm` only. `npm install` and `yarn add` are forbidden.
- **Testing:** Vitest for unit/integration. Playwright for e2e. Tests live next to code (`foo.ts` + `foo.test.ts`).
- **Mobile:** PWA first. Native React Native (Expo) deferred to Phase 4. See `MOBILE-STRATEGY.md`.

## Code style

- **Naming:**
  - Files: `kebab-case.ts` (e.g., `customer-detail.tsx`)
  - React components: `PascalCase` (e.g., `CustomerDetail`)
  - Functions/variables: `camelCase`
  - Constants: `SCREAMING_SNAKE_CASE`
  - Database tables/columns: `snake_case` (matches Postgres convention)
  - Database enums: `snake_case` values, lowercase
- **Imports:**
  - Use absolute imports from `@/` for app code
  - Use absolute imports from `@premier/shared`, `@premier/db`, `@premier/ai` for packages
  - Group: external → internal packages → relative
- **Components:**
  - Functional components with hooks. No class components.
  - Default export for the component. Named exports for everything else in the file.
  - Props interface named `[ComponentName]Props`, defined directly above the component.
  - Server components have no `"use client"`. They can be `async`.
  - Client components have `"use client"` at the top with a one-line comment justifying the choice.
- **Files:**
  - One main export per file
  - Co-located test files (`foo.test.ts` next to `foo.ts`)
  - Server actions live in `app/[route]/actions.ts`
  - Database queries live in `packages/db/queries/[entity].ts`

## Server actions vs Edge functions vs Edge functions vs Route handlers

**This decision tree exists to prevent inconsistency. Follow it strictly.**

| Use case | Where it lives |
|----------|----------------|
| Form submission from a Next.js page | Server action in `app/[route]/actions.ts` |
| Webhook from external service (Stripe, Twilio) | Route handler in `app/api/webhooks/[service]/route.ts` |
| Cron job (e.g., daily briefing generator) | Supabase Edge Function in `supabase/functions/[name]/` |
| Long-running background work (transcription, embedding) | Supabase Edge Function triggered via pg_net or pg_cron |
| Mobile app calling backend | Server action exposed via API route handler in `app/api/v1/...` |
| AI tool execution from chat | Server action in `app/api/assistant/tools/route.ts` (single endpoint dispatches by tool name) |

## Error handling

- **Never throw raw errors to the user.** Wrap in a typed error class.
- **Server actions return discriminated unions:** `{ success: true, data: T } | { success: false, error: string, code: ErrorCode }`. Never throw from a server action; return the error.
- **Database errors get logged + sanitized.** Never expose raw Postgres errors to the client (security).
- **Use `ErrorCode` enum** in `@premier/shared` for known error types. Add new ones rather than using strings.

## Database conventions

- **Every table has:** `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (with `set_updated_at` trigger).
- **Every multi-tenant table has:** `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` AND a row-level security policy enforcing org isolation.
- **Foreign keys always have `ON DELETE` specified.** No defaults. Decide explicitly between CASCADE, RESTRICT, SET NULL.
- **Soft delete:** Use `is_active BOOLEAN DEFAULT true` rather than DELETE for entities users might want back. Hard delete only for true junk.
- **Migrations are immutable.** Never edit a migration after it's been run. Add a new one.
- **Migration naming:** `NNNN_short_description.sql` where NNNN is zero-padded sequential.

## Type generation

- After every schema migration, run `pnpm db:types` to regenerate `packages/db/types.ts` from Supabase.
- Never edit `packages/db/types.ts` by hand.
- Treat generated types as the source of truth for the database; if a type is wrong, the schema is wrong.

## RLS (Row Level Security)

- **Every table has RLS enabled.** No exceptions.
- **Every table has at least one policy.** A table with RLS enabled and no policy denies everything (which is correct, but write the policy explicitly).
- Use the helper functions from `0001_init.sql`: `user_is_in_org(org_id)`, `auth.uid()`.
- Test RLS by attempting access as a different user. RLS bugs are silent and dangerous.

## React patterns

- **Loading states:** Suspense boundaries with `loading.tsx` files. Don't show a global spinner.
- **Errors:** Error boundaries with `error.tsx` files. Always show what went wrong + a retry path.
- **Empty states:** Every list view has a designed empty state. "No items" with a "Create your first X" call-to-action.
- **Forms:** Always show inline field errors, never just a top-level "fix the errors" message.
- **Optimistic updates:** Use for clear-success operations (toggle, archive). Don't use for operations that often fail (payments, network calls to external services).

## Accessibility (non-optional)

- All interactive elements keyboard-accessible
- Form inputs have associated labels
- Color is never the only way information is conveyed
- Touch targets minimum 44x44px on mobile
- Screen reader tested for primary flows (today screen, quote builder, customer detail)

## Performance budgets

- Initial page load: <2s on 3G mobile
- Time to interactive: <3s on 3G mobile
- API response: <500ms p95
- Database query: <100ms p95
- Embedding search: <300ms p95

## Mobile-first

- All UI designed for 375px width first, scaled up
- Touch-first interactions; hover is decorative not functional
- Phone is the primary device for in-field use

## When in doubt

1. Check existing patterns in the codebase first
2. Check the relevant doc (`ARCHITECTURE.md`, `DECISIONS.md`)
3. Ask Kevin in the chat — don't invent a new pattern silently
4. If you must invent, document the decision in `DECISIONS.md`
