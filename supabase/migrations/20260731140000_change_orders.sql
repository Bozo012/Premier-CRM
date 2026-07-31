-- Change orders: a stable thread (change_orders) with immutable, versioned
-- proposals beneath it (change_order_revisions). Comments attach to the
-- thread with an optional revision reference. Line items attach to a
-- specific revision and are frozen once that revision leaves draft.
--
-- Mutations are NOT granted to `authenticated` on these tables — every
-- write happens through the SECURITY DEFINER RPC functions added in the
-- next migration, which re-validate org/actor/ownership/transition
-- regardless of what the calling server action already checked. Structural
-- immutability (frozen content once proposed, valid transition graph,
-- exactly-once incorporation) is enforced by triggers below, which fire
-- for every role including service_role — a server-action bug cannot
-- silently corrupt contractual state.

CREATE TYPE public.change_order_status AS ENUM (
  'draft', 'proposed', 'under_review', 'approved', 'declined',
  'revision_requested', 'withdrawn', 'expired', 'incorporated', 'completed'
);

CREATE TYPE public.change_order_initiator AS ENUM ('customer', 'contractor');

-- ============================================================================
-- CHANGE_ORDERS — the stable thread
-- ============================================================================

CREATE TABLE public.change_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id                    UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  initiator                 public.change_order_initiator NOT NULL,
  requested_by_customer_id  UUID REFERENCES public.customers(id),
  requested_by_user_id      UUID REFERENCES auth.users(id),
  status                    public.change_order_status NOT NULL DEFAULT 'draft',
  current_revision_id       UUID, -- FK added below, once change_order_revisions exists
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT change_orders_requester_present CHECK (
    (requested_by_customer_id IS NOT NULL) OR (requested_by_user_id IS NOT NULL)
  )
);

CREATE INDEX change_orders_org_job_idx ON public.change_orders (org_id, job_id);
CREATE INDEX change_orders_job_status_idx ON public.change_orders (job_id, status);

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- CHANGE_ORDER_REVISIONS — immutable, versioned proposals
-- ============================================================================

CREATE TABLE public.change_order_revisions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id         UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  version                 INTEGER NOT NULL,
  supersedes_revision_id  UUID REFERENCES public.change_order_revisions(id),
  status                  public.change_order_status NOT NULL DEFAULT 'draft',

  reason                  TEXT,
  scope_change_summary    TEXT,
  schedule_only           BOOLEAN NOT NULL DEFAULT false,

  price_adjustment        NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_impact          NUMERIC(12,2) NOT NULL DEFAULT 0,
  schedule_impact_notes   TEXT,
  schedule_delta_minutes  INTEGER,

  acknowledgment_text     TEXT,
  acknowledgment_version  TEXT,

  proposed_by_user_id     UUID REFERENCES auth.users(id),
  proposed_at             TIMESTAMPTZ,

  decided_by_user_id      UUID REFERENCES auth.users(id),
  decided_by_customer_id  UUID REFERENCES public.customers(id),
  decided_at              TIMESTAMPTZ,
  decision_note           TEXT,

  incorporated_at         TIMESTAMPTZ,

  created_by_user_id      UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT change_order_revisions_version_unique UNIQUE (change_order_id, version),
  CONSTRAINT change_order_revisions_supersedes_unique UNIQUE (supersedes_revision_id),
  CONSTRAINT change_order_revisions_schedule_only_zero_price CHECK (
    NOT schedule_only OR price_adjustment = 0
  )
);

-- At most one "pending" (still-live, not yet decided) revision per thread.
-- revision_requested is deliberately excluded: once the customer asks for a
-- revision, that revision is done, and a fresh draft must be creatable
-- immediately without waiting on anything.
CREATE UNIQUE INDEX change_order_revisions_one_pending
  ON public.change_order_revisions (change_order_id)
  WHERE status IN ('draft', 'proposed', 'under_review');

CREATE INDEX change_order_revisions_change_order_idx
  ON public.change_order_revisions (change_order_id, version DESC);

ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_current_revision_fkey
  FOREIGN KEY (current_revision_id) REFERENCES public.change_order_revisions(id);

CREATE TRIGGER change_order_revisions_updated_at
  BEFORE UPDATE ON public.change_order_revisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Now that change_order_revisions exists, the deferred FK from the working
-- invoice foundations migration can be added.
ALTER TABLE public.invoice_line_items
  ADD COLUMN source_change_order_revision_id UUID REFERENCES public.change_order_revisions(id);

-- ============================================================================
-- Structural enforcement — fires for every role, including service_role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_change_order_revision_rules()
RETURNS TRIGGER AS $$
DECLARE
  content_changed BOOLEAN;
BEGIN
  -- Proposal content freezes the moment a revision leaves draft. Only
  -- transition/decision columns may still change afterward.
  IF OLD.status != 'draft' THEN
    content_changed := (
      NEW.reason IS DISTINCT FROM OLD.reason OR
      NEW.scope_change_summary IS DISTINCT FROM OLD.scope_change_summary OR
      NEW.schedule_only IS DISTINCT FROM OLD.schedule_only OR
      NEW.price_adjustment IS DISTINCT FROM OLD.price_adjustment OR
      NEW.deposit_impact IS DISTINCT FROM OLD.deposit_impact OR
      NEW.schedule_impact_notes IS DISTINCT FROM OLD.schedule_impact_notes OR
      NEW.schedule_delta_minutes IS DISTINCT FROM OLD.schedule_delta_minutes OR
      NEW.acknowledgment_text IS DISTINCT FROM OLD.acknowledgment_text OR
      NEW.acknowledgment_version IS DISTINCT FROM OLD.acknowledgment_version OR
      NEW.version IS DISTINCT FROM OLD.version OR
      NEW.change_order_id IS DISTINCT FROM OLD.change_order_id OR
      NEW.supersedes_revision_id IS DISTINCT FROM OLD.supersedes_revision_id OR
      NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    );
    IF content_changed THEN
      RAISE EXCEPTION 'Proposal content is immutable once a revision leaves draft '
        '(current status=%). Create a new revision instead.', OLD.status;
    END IF;
  END IF;

  -- Exactly-once incorporation.
  IF OLD.incorporated_at IS NOT NULL AND NEW.incorporated_at IS DISTINCT FROM OLD.incorporated_at THEN
    RAISE EXCEPTION 'incorporated_at is already set on this revision and cannot be changed.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('proposed', 'withdrawn')) OR
      (OLD.status IN ('proposed', 'under_review') AND NEW.status IN
        ('under_review', 'approved', 'declined', 'revision_requested', 'withdrawn', 'expired')) OR
      (OLD.status = 'approved' AND NEW.status = 'incorporated') OR
      (OLD.status = 'incorporated' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Invalid change-order revision transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER change_order_revisions_enforce_rules
  BEFORE UPDATE ON public.change_order_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_revision_rules();

-- Keep the thread's rollup status/current_revision_id in sync with whatever
-- revision was just created or transitioned. Safe because at most one
-- revision is ever "pending" at a time (partial unique index above).
CREATE OR REPLACE FUNCTION public.sync_change_order_thread_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.change_orders
  SET status = NEW.status,
      current_revision_id = NEW.id
  WHERE id = NEW.change_order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER change_order_revisions_sync_thread
  AFTER INSERT OR UPDATE OF status ON public.change_order_revisions
  FOR EACH ROW EXECUTE FUNCTION public.sync_change_order_thread_status();

-- ============================================================================
-- CHANGE_ORDER_LINE_ITEMS — attached to a specific revision, frozen with it
-- ============================================================================

CREATE TABLE public.change_order_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id      UUID NOT NULL REFERENCES public.change_order_revisions(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('labor', 'material', 'credit', 'other')),
  description      TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'each',
  quantity         NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxable          BOOLEAN NOT NULL DEFAULT true,
  source_reference TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Magnitudes are always stored positive; sign is derived from kind, so
  -- there's no way to end up with an ambiguous positive-credit or
  -- negative-labor row.
  total NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN kind = 'credit' THEN -1 * quantity * unit_price ELSE quantity * unit_price END
  ) STORED,

  CONSTRAINT change_order_line_items_positive_magnitudes CHECK (quantity > 0 AND unit_price >= 0)
);

CREATE INDEX change_order_line_items_revision_idx ON public.change_order_line_items (revision_id, sort_order);

CREATE OR REPLACE FUNCTION public.enforce_change_order_line_item_immutability()
RETURNS TRIGGER AS $$
DECLARE
  revision_status public.change_order_status;
BEGIN
  SELECT status INTO revision_status FROM public.change_order_revisions
    WHERE id = COALESCE(NEW.revision_id, OLD.revision_id);
  IF revision_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Cannot modify line items once the revision has left draft status (status=%).', revision_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER change_order_line_items_enforce_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_line_item_immutability();

-- ============================================================================
-- CHANGE_ORDER_COMMENTS — attached to the thread, optional revision ref
-- ============================================================================

CREATE TABLE public.change_order_comments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id     UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  revision_id         UUID REFERENCES public.change_order_revisions(id),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id      UUID REFERENCES auth.users(id),
  author_customer_id  UUID REFERENCES public.customers(id),
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT change_order_comments_single_author CHECK (
    ((author_user_id IS NOT NULL)::INT + (author_customer_id IS NOT NULL)::INT) = 1
  )
);

CREATE INDEX change_order_comments_thread_idx ON public.change_order_comments (change_order_id, created_at);

-- ============================================================================
-- RLS — SELECT via org membership / customer_accounts join for all four
-- tables. No direct authenticated INSERT/UPDATE/DELETE grant anywhere here:
-- mutations happen exclusively through the SECURITY DEFINER RPCs in the
-- next migration.
-- ============================================================================

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_change_orders" ON public.change_orders
  FOR SELECT USING (public.user_is_in_org(org_id));

CREATE POLICY "customer_select_own_change_orders" ON public.change_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.id = change_orders.job_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

CREATE POLICY "org_select_change_order_revisions" ON public.change_order_revisions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_revisions.change_order_id
      AND public.user_is_in_org(co.org_id))
  );

CREATE POLICY "customer_select_own_change_order_revisions" ON public.change_order_revisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      JOIN public.jobs j ON j.id = co.job_id
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE co.id = change_order_revisions.change_order_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

CREATE POLICY "org_select_change_order_line_items" ON public.change_order_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.change_order_revisions r
      JOIN public.change_orders co ON co.id = r.change_order_id
      WHERE r.id = change_order_line_items.revision_id AND public.user_is_in_org(co.org_id)
    )
  );

CREATE POLICY "customer_select_own_change_order_line_items" ON public.change_order_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.change_order_revisions r
      JOIN public.change_orders co ON co.id = r.change_order_id
      JOIN public.jobs j ON j.id = co.job_id
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE r.id = change_order_line_items.revision_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

CREATE POLICY "org_select_change_order_comments" ON public.change_order_comments
  FOR SELECT USING (public.user_is_in_org(org_id));

CREATE POLICY "customer_select_own_change_order_comments" ON public.change_order_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      JOIN public.jobs j ON j.id = co.job_id
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE co.id = change_order_comments.change_order_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

-- authenticated: SELECT only (RLS-scoped above). All mutation happens via
-- SECURITY DEFINER functions (granted EXECUTE to authenticated separately)
-- or service_role server actions.
GRANT SELECT ON public.change_orders TO authenticated;
GRANT SELECT ON public.change_order_revisions TO authenticated;
GRANT SELECT ON public.change_order_line_items TO authenticated;
GRANT SELECT ON public.change_order_comments TO authenticated;
-- comments are low-risk and not versioned/contractual — allow authenticated
-- insert directly (still governed by RLS via a WITH CHECK policy) rather
-- than routing through an RPC.
GRANT INSERT ON public.change_order_comments TO authenticated;

CREATE POLICY "org_insert_change_order_comments" ON public.change_order_comments
  FOR INSERT WITH CHECK (
    public.user_is_in_org(org_id) AND author_user_id = auth.uid() AND author_customer_id IS NULL
  );

CREATE POLICY "customer_insert_own_change_order_comments" ON public.change_order_comments
  FOR INSERT WITH CHECK (
    author_customer_id IS NOT NULL
    AND author_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.change_orders co
      JOIN public.jobs j ON j.id = co.job_id
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE co.id = change_order_comments.change_order_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
        AND ca.customer_id = change_order_comments.author_customer_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_order_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_order_line_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_order_comments TO service_role;
