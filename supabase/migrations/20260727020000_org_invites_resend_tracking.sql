-- PR C0, Phase 5: tracks when a pending invite was last (re)sent, so
-- resendInviteAction (apps/web/app/(app)/team/actions.ts) can enforce a
-- cooldown between resends without a separate rate-limit table. NULL means
-- "never resent" — cooldown falls back to org_invites.created_at in that
-- case (see packages/db/queries/org-invites.ts's resendOrgInvite()).
ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS last_resent_at TIMESTAMPTZ;
