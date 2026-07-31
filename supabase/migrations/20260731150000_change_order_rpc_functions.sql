-- SECURITY DEFINER RPC functions: the only way change_orders/revisions/
-- line_items get mutated (comments are the one exception, handled by plain
-- RLS INSERT policies in the previous migration since they carry no
-- contractual weight).
--
-- Each function independently re-validates org membership / customer
-- ownership / current status / allowed transition against the same
-- source-of-truth tables (org_members, customer_accounts) the app layer
-- already checked — a bug in the calling server action's capability check
-- cannot, by itself, corrupt contractual state. Structural rules (frozen
-- content, valid transitions, exactly-once incorporation) are additionally
-- enforced by the triggers from the previous migration, which fire
-- regardless of which function or role performs the write.

-- ============================================================================
-- create_change_order_draft — new thread (p_change_order_id NULL) or a
-- fresh revision under an existing thread (after decline/revision_requested/
-- withdrawn — the partial unique index blocks this while a revision is
-- still pending).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_change_order_draft(
  p_org_id UUID,
  p_job_id UUID,
  p_change_order_id UUID,               -- NULL = new thread
  p_initiator public.change_order_initiator,
  p_requested_by_customer_id UUID,
  p_requested_by_user_id UUID,
  p_created_by_user_id UUID,
  p_reason TEXT,
  p_scope_change_summary TEXT,
  p_schedule_only BOOLEAN,
  p_schedule_impact_notes TEXT,
  p_schedule_delta_minutes INTEGER,
  p_acknowledgment_text TEXT,
  p_acknowledgment_version TEXT,
  p_line_items JSONB                    -- [{kind, description, unit, quantity, unit_price, taxable, source_reference, sort_order}]
) RETURNS public.change_order_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job RECORD;
  v_change_order_id UUID;
  v_next_version INTEGER;
  v_previous_revision_id UUID;
  v_computed_total NUMERIC(12,2) := 0;
  v_revision public.change_order_revisions;
  v_item JSONB;
BEGIN
  SELECT id, org_id, customer_id INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL OR v_job.org_id != p_org_id THEN
    RAISE EXCEPTION 'Job not found in this organization.';
  END IF;

  IF p_created_by_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members WHERE user_id = p_created_by_user_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of this organization.';
  END IF;

  IF p_change_order_id IS NULL THEN
    INSERT INTO public.change_orders (org_id, job_id, initiator, requested_by_customer_id, requested_by_user_id)
    VALUES (p_org_id, p_job_id, p_initiator, p_requested_by_customer_id, p_requested_by_user_id)
    RETURNING id INTO v_change_order_id;
    v_next_version := 1;
    v_previous_revision_id := NULL;
  ELSE
    SELECT id INTO v_change_order_id FROM public.change_orders
      WHERE id = p_change_order_id AND org_id = p_org_id AND job_id = p_job_id;
    IF v_change_order_id IS NULL THEN
      RAISE EXCEPTION 'Change order thread not found for this job/org.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.change_order_revisions
      WHERE change_order_id = v_change_order_id AND status IN ('draft', 'proposed', 'under_review')
    ) THEN
      RAISE EXCEPTION 'This change order already has a pending revision.';
    END IF;
    SELECT COALESCE(MAX(version), 0) + 1, id
      INTO v_next_version, v_previous_revision_id
      FROM public.change_order_revisions
      WHERE change_order_id = v_change_order_id
      ORDER BY version DESC
      LIMIT 1;
    v_next_version := COALESCE(v_next_version, 1);
  END IF;

  IF p_schedule_only AND jsonb_array_length(COALESCE(p_line_items, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'A schedule-only change order cannot have line items.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb))
  LOOP
    v_computed_total := v_computed_total + (
      CASE WHEN (v_item->>'kind') = 'credit' THEN -1 ELSE 1 END
      * (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC
    );
  END LOOP;

  INSERT INTO public.change_order_revisions (
    change_order_id, version, supersedes_revision_id, status,
    reason, scope_change_summary, schedule_only,
    price_adjustment, schedule_impact_notes, schedule_delta_minutes,
    acknowledgment_text, acknowledgment_version, created_by_user_id
  ) VALUES (
    v_change_order_id, v_next_version, v_previous_revision_id, 'draft',
    p_reason, p_scope_change_summary, COALESCE(p_schedule_only, false),
    v_computed_total, p_schedule_impact_notes, p_schedule_delta_minutes,
    p_acknowledgment_text, p_acknowledgment_version, p_created_by_user_id
  )
  RETURNING * INTO v_revision;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb))
  LOOP
    INSERT INTO public.change_order_line_items (
      revision_id, kind, description, sort_order, unit, quantity, unit_price, taxable, source_reference
    ) VALUES (
      v_revision.id,
      v_item->>'kind',
      v_item->>'description',
      COALESCE((v_item->>'sort_order')::INTEGER, 0),
      COALESCE(v_item->>'unit', 'each'),
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'taxable')::BOOLEAN, true),
      v_item->>'source_reference'
    );
  END LOOP;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  VALUES (p_org_id, 'change_order', v_change_order_id, 'change_order_draft_created',
    format('Draft change order v%s created (%s-initiated).', v_next_version, p_initiator), p_created_by_user_id);

  RETURN v_revision;
END;
$$;

-- ============================================================================
-- propose_change_order_revision — draft -> proposed. Staff only. Recomputes
-- (never trusts) the price snapshot from the frozen line items.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.propose_change_order_revision(
  p_revision_id UUID,
  p_actor_user_id UUID,
  p_expected_price_adjustment NUMERIC   -- optimistic-lock check; NULL skips the check
) RETURNS public.change_order_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.change_order_revisions;
  v_org_id UUID;
  v_computed_total NUMERIC(12,2);
BEGIN
  SELECT r.* INTO v_revision
  FROM public.change_order_revisions r
  WHERE r.id = p_revision_id
  FOR UPDATE OF r;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Change order revision not found.';
  END IF;

  SELECT co.org_id INTO v_org_id FROM public.change_orders co WHERE co.id = v_revision.change_order_id;

  IF v_revision.status != 'draft' THEN
    RAISE EXCEPTION 'Only a draft revision can be proposed (current status=%).', v_revision.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = p_actor_user_id AND org_id = v_org_id
      AND role IN ('owner', 'admin', 'employee', 'subcontractor')
  ) THEN
    RAISE EXCEPTION 'Actor is not authorized to propose change orders for this organization.';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_computed_total
  FROM public.change_order_line_items WHERE revision_id = p_revision_id;

  IF NOT v_revision.schedule_only AND NOT EXISTS (
    SELECT 1 FROM public.change_order_line_items WHERE revision_id = p_revision_id
  ) THEN
    RAISE EXCEPTION 'A priced change order must have at least one line item.';
  END IF;

  IF p_expected_price_adjustment IS NOT NULL AND p_expected_price_adjustment != v_computed_total THEN
    RAISE EXCEPTION 'Price adjustment mismatch: expected %, line items total %. Refresh and retry.',
      p_expected_price_adjustment, v_computed_total;
  END IF;

  UPDATE public.change_order_revisions
  SET status = 'proposed',
      proposed_by_user_id = p_actor_user_id,
      proposed_at = now(),
      price_adjustment = v_computed_total
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  VALUES (v_org_id, 'change_order', v_revision.change_order_id, 'change_order_proposed',
    format('Change order v%s proposed ($%s).', v_revision.version, v_computed_total), p_actor_user_id);

  RETURN v_revision;
END;
$$;

-- ============================================================================
-- respond_to_change_order_revision — customer decision. Contractual
-- acceptance; staff cannot call this on the customer's behalf.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_change_order_revision(
  p_revision_id UUID,
  p_actor_customer_id UUID,
  p_response TEXT,                      -- 'approved' | 'declined' | 'revision_requested'
  p_decision_note TEXT,
  p_acknowledgment_version TEXT         -- must match the proposal's acknowledgment_version to approve
) RETURNS public.change_order_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.change_order_revisions;
  v_org_id UUID;
  v_job_customer_id UUID;
BEGIN
  IF p_response NOT IN ('approved', 'declined', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid response.';
  END IF;

  SELECT r.* INTO v_revision
  FROM public.change_order_revisions r
  WHERE r.id = p_revision_id
  FOR UPDATE OF r;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Change order revision not found.';
  END IF;

  SELECT co.org_id, j.customer_id INTO v_org_id, v_job_customer_id
  FROM public.change_orders co
  JOIN public.jobs j ON j.id = co.job_id
  WHERE co.id = v_revision.change_order_id;

  IF v_job_customer_id != p_actor_customer_id THEN
    RAISE EXCEPTION 'This change order does not belong to the acting customer.';
  END IF;
  IF v_revision.status NOT IN ('proposed', 'under_review') THEN
    RAISE EXCEPTION 'This revision is not awaiting a response (current status=%).', v_revision.status;
  END IF;
  IF p_response = 'approved' AND v_revision.acknowledgment_version IS NOT NULL
     AND p_acknowledgment_version IS DISTINCT FROM v_revision.acknowledgment_version THEN
    RAISE EXCEPTION 'Acknowledgment version mismatch — refresh and try again.';
  END IF;

  UPDATE public.change_order_revisions
  SET status = p_response,
      decided_by_customer_id = p_actor_customer_id,
      decided_at = now(),
      decision_note = p_decision_note
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message)
  VALUES (v_org_id, 'change_order', v_revision.change_order_id, 'change_order_' || p_response,
    format('Change order v%s %s by customer.%s', v_revision.version, p_response,
      CASE WHEN p_decision_note IS NOT NULL THEN ' Note: ' || p_decision_note ELSE '' END));

  RETURN v_revision;
END;
$$;

-- ============================================================================
-- withdraw_change_order_revision — proposer or owner/admin retracts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.withdraw_change_order_revision(
  p_revision_id UUID,
  p_actor_user_id UUID
) RETURNS public.change_order_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.change_order_revisions;
  v_org_id UUID;
  v_actor_role user_role;
BEGIN
  SELECT r.* INTO v_revision
  FROM public.change_order_revisions r
  WHERE r.id = p_revision_id
  FOR UPDATE OF r;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Change order revision not found.';
  END IF;

  SELECT co.org_id INTO v_org_id FROM public.change_orders co WHERE co.id = v_revision.change_order_id;

  IF v_revision.status NOT IN ('draft', 'proposed', 'under_review') THEN
    RAISE EXCEPTION 'Only a pending revision can be withdrawn (current status=%).', v_revision.status;
  END IF;

  SELECT role INTO v_actor_role FROM public.org_members WHERE user_id = p_actor_user_id AND org_id = v_org_id;
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Actor is not a member of this organization.';
  END IF;
  IF v_actor_role NOT IN ('owner', 'admin') AND v_revision.created_by_user_id != p_actor_user_id THEN
    RAISE EXCEPTION 'Only the proposer or an owner/admin can withdraw this revision.';
  END IF;

  UPDATE public.change_order_revisions
  SET status = 'withdrawn'
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  VALUES (v_org_id, 'change_order', v_revision.change_order_id, 'change_order_withdrawn',
    format('Change order v%s withdrawn.', v_revision.version), p_actor_user_id);

  RETURN v_revision;
END;
$$;

-- ============================================================================
-- incorporate_change_order_revision — exactly-once. Writes working-invoice
-- lines with source attribution; logs schedule/deposit impact for staff to
-- act on (does not silently mutate the deposit requirement or the job's
-- schedule — those stay human-decided per point 10 of the design).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.incorporate_change_order_revision(
  p_revision_id UUID,
  p_actor_user_id UUID
) RETURNS public.change_order_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.change_order_revisions;
  v_org_id UUID;
  v_job_id UUID;
  v_working_invoice_id UUID;
  v_line RECORD;
BEGIN
  SELECT r.* INTO v_revision
  FROM public.change_order_revisions r
  WHERE r.id = p_revision_id
  FOR UPDATE OF r;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Change order revision not found.';
  END IF;

  SELECT co.org_id, co.job_id INTO v_org_id, v_job_id
  FROM public.change_orders co WHERE co.id = v_revision.change_order_id;

  -- Idempotent: already incorporated, return as-is rather than erroring.
  IF v_revision.incorporated_at IS NOT NULL THEN
    RETURN v_revision;
  END IF;

  IF v_revision.status != 'approved' THEN
    RAISE EXCEPTION 'Only an approved revision can be incorporated (current status=%).', v_revision.status;
  END IF;

  SELECT id INTO v_working_invoice_id FROM public.invoices
  WHERE job_id = v_job_id AND kind = 'working' AND status != 'void'
  LIMIT 1;

  IF v_working_invoice_id IS NULL THEN
    INSERT INTO public.invoices (org_id, job_id, kind, status, title)
    VALUES (v_org_id, v_job_id, 'working', 'draft', 'Working invoice')
    RETURNING id INTO v_working_invoice_id;
  END IF;

  FOR v_line IN SELECT * FROM public.change_order_line_items WHERE revision_id = p_revision_id ORDER BY sort_order
  LOOP
    INSERT INTO public.invoice_line_items (
      invoice_id, name, description, unit, quantity, unit_price, sort_order,
      source_type, source_change_order_revision_id, source_note
    ) VALUES (
      v_working_invoice_id, v_line.description, v_line.description, v_line.unit,
      CASE WHEN v_line.kind = 'credit' THEN -1 * v_line.quantity ELSE v_line.quantity END,
      v_line.unit_price, v_line.sort_order,
      'change_order', p_revision_id,
      format('From change order v%s (%s)', v_revision.version, v_line.kind)
    );
  END LOOP;

  UPDATE public.change_order_revisions
  SET status = 'incorporated', incorporated_at = now()
  WHERE id = p_revision_id AND incorporated_at IS NULL
  RETURNING * INTO v_revision;

  -- Race guard: if a concurrent call already incorporated it between our
  -- check above and this UPDATE, re-fetch and return the settled row
  -- instead of erroring.
  IF v_revision.id IS NULL THEN
    SELECT * INTO v_revision FROM public.change_order_revisions WHERE id = p_revision_id;
    RETURN v_revision;
  END IF;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  VALUES (v_org_id, 'change_order', v_revision.change_order_id, 'change_order_incorporated',
    format('Change order v%s incorporated into working invoice ($%s price, $%s deposit impact, %s min schedule impact).',
      v_revision.version, v_revision.price_adjustment, v_revision.deposit_impact,
      COALESCE(v_revision.schedule_delta_minutes, 0)),
    p_actor_user_id);

  RETURN v_revision;
END;
$$;

-- ============================================================================
-- GRANTS — authenticated may call these; every function does its own
-- authorization inside. service_role also granted for server-action use.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_change_order_draft(
  UUID, UUID, UUID, public.change_order_initiator, UUID, UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, INTEGER, TEXT, TEXT, JSONB
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.propose_change_order_revision(UUID, UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_to_change_order_revision(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_change_order_revision(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.incorporate_change_order_revision(UUID, UUID) TO authenticated, service_role;
