-- Generic, org-scoped activity/event log — first consumer is the quote
-- accept/decline repair (2026-07-31 audit): respondToQuoteAction previously
-- had no downstream effect at all beyond flipping quotes.status, so staff
-- had no way to discover a customer's response short of manually checking
-- the quote list. This table backs both a durable audit trail and the
-- dashboard's dynamic "needs attention" list (apps/web/app/(app)/today/page.tsx).
--
-- Deliberately minimal — a small, reusable event table, not a speculative
-- general-purpose event-sourcing platform. entity_type/entity_id are plain
-- text/uuid rather than FKs to any specific table, since this is meant to
-- log events across many entity kinds over time (jobs, invoices, etc. can
-- reuse it later) without a migration per entity type.

CREATE TABLE public.activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  event_type    TEXT NOT NULL,
  message       TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON public.activity_log (org_id, created_at DESC);
CREATE INDEX ON public.activity_log (org_id, entity_type, entity_id);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Active org members can read their org's activity. No INSERT/UPDATE/DELETE
-- policy is defined for authenticated users at all — every write goes
-- through a server action using the service-role client (which bypasses
-- RLS), matching the same defense-in-depth reasoning as the invoices/
-- payments migration earlier in this audit: a public client (e.g. the
-- respondToQuoteAction share-token page, which is unauthenticated) must
-- never be able to write this table directly.
CREATE POLICY "activity_log_select_org_members" ON public.activity_log
  FOR SELECT USING (user_is_in_org(org_id));
