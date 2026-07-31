-- Fix create_change_order_draft: the "new revision under an existing
-- thread" branch used a single SELECT mixing an aggregate (MAX(version))
-- with a non-aggregated column (id) — invalid SQL (42803, "column must
-- appear in the GROUP BY clause"). Never exercised by the happy-path test
-- (which only ever creates a first revision, p_change_order_id IS NULL);
-- found by integrated-lifecycle-bot's immutability test, which creates a
-- v2 revision after a decline. Split into two separate queries.

CREATE OR REPLACE FUNCTION public.create_change_order_draft(
  p_org_id UUID,
  p_job_id UUID,
  p_change_order_id UUID,
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
  p_line_items JSONB
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

    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
      FROM public.change_order_revisions
      WHERE change_order_id = v_change_order_id;

    SELECT id INTO v_previous_revision_id
      FROM public.change_order_revisions
      WHERE change_order_id = v_change_order_id
      ORDER BY version DESC
      LIMIT 1;
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
