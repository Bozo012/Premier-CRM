-- Fix respond_to_change_order_revision: p_response is TEXT (validated by an
-- explicit IN-list check earlier in the function body), but the UPDATE
-- assigned it directly to the enum-typed status column without a cast —
-- Postgres does not implicitly cast text to a custom enum type in an
-- assignment, so every real response (approve/decline/revision_requested)
-- failed with "column status is of type change_order_status but expression
-- is of type text" (42804). Found by integrated-lifecycle-bot's happy-path
-- test. CREATE OR REPLACE — immutable-migrations discipline preserved by
-- adding this as a new file rather than editing 20260731150000.

CREATE OR REPLACE FUNCTION public.respond_to_change_order_revision(
  p_revision_id UUID,
  p_actor_customer_id UUID,
  p_response TEXT,
  p_decision_note TEXT,
  p_acknowledgment_version TEXT
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
  SET status = p_response::public.change_order_status,
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
