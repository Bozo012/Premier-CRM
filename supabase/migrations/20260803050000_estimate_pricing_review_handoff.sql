-- Explicit employee -> owner/admin pricing-review handoff, found missing
-- during Kevin's Demo UI observation: employees had no way to signal an
-- estimate was ready for owner review, and the estimate page rendered an
-- inert-but-visible "Approve pricing" button + raw RPC error to them.
--
-- State model (single source of truth, no duplicated "approved" flag):
-- pricing_reviewed_at/by (already existed) remain the sole authority for
-- "approved" — this migration adds ONLY the pre-approval sub-states via
-- one nullable column:
--
--   pricing_review_status IS NULL                    -> draft / never submitted
--   pricing_review_status = 'pending_review'          -> submitted, awaiting owner/admin
--   pricing_review_status = 'changes_requested'        -> owner/admin sent it back
--   pricing_reviewed_at IS NOT NULL                    -> approved (pricing_review_status
--                                                          is cleared to NULL at that point)
--
-- The effective UI state is derived, never stored redundantly:
--   pricing_reviewed_at IS NOT NULL                     -> "approved"
--   else pricing_review_status = 'pending_review'       -> "pending_review"
--   else pricing_review_status = 'changes_requested'    -> "changes_requested"
--   else                                                 -> "draft"

ALTER TABLE public.estimates
  ADD COLUMN pricing_review_status TEXT CHECK (pricing_review_status IN ('pending_review', 'changes_requested')),
  ADD COLUMN pricing_review_requested_at TIMESTAMPTZ,
  ADD COLUMN pricing_review_requested_by UUID REFERENCES auth.users(id),
  ADD COLUMN pricing_review_changes_requested_note TEXT;

-- ============================================================================
-- request_estimate_pricing_review — employee (or anyone with canEditEstimate,
-- which already includes subcontractor per the existing capability matrix —
-- consistent with subcontractors already being allowed to edit estimate
-- content) signals an estimate is ready for owner/admin pricing review.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_estimate_pricing_review(p_estimate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate RECORD;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_estimate FROM public.estimates WHERE id = p_estimate_id;
  IF v_estimate IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  IF v_role IS NULL OR NOT public.role_has_capability(v_role, 'canEditEstimate') THEN
    RAISE EXCEPTION 'Role does not have canEditEstimate';
  END IF;

  IF v_estimate.pricing_reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This estimate''s pricing is already approved.';
  END IF;
  IF v_estimate.pricing_review_status = 'pending_review' THEN
    RAISE EXCEPTION 'This estimate is already pending pricing review.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estimate_line_items WHERE estimate_id = p_estimate_id) THEN
    RAISE EXCEPTION 'Cannot submit for pricing review with zero line items.';
  END IF;

  UPDATE public.estimates
  SET pricing_review_status = 'pending_review',
      pricing_review_requested_at = now(),
      pricing_review_requested_by = auth.uid(),
      pricing_review_changes_requested_note = NULL
  WHERE id = p_estimate_id;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  VALUES (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_review_requested', 'Estimate submitted for pricing review.', auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
END;
$$;

-- ============================================================================
-- return_estimate_pricing_for_changes — owner/admin sends a pending-review
-- estimate back to the employee with a required note.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.return_estimate_pricing_for_changes(p_estimate_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate RECORD;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_estimate FROM public.estimates WHERE id = p_estimate_id;
  IF v_estimate IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  IF v_role IS NULL OR NOT public.role_has_capability(v_role, 'canApproveEstimatePricing') THEN
    RAISE EXCEPTION 'Role does not have canApproveEstimatePricing';
  END IF;

  IF v_estimate.pricing_review_status IS DISTINCT FROM 'pending_review' THEN
    RAISE EXCEPTION 'This estimate is not currently pending pricing review.';
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'A note explaining the requested changes is required.';
  END IF;

  UPDATE public.estimates
  SET pricing_review_status = 'changes_requested',
      pricing_review_changes_requested_note = p_note
  WHERE id = p_estimate_id;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  VALUES (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_changes_requested', p_note, auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
END;
$$;

-- ============================================================================
-- approve_estimate_pricing / reopen_estimate_for_edit — extended (not
-- replaced) to also clear pricing_review_status, so the derived UI state
-- never shows a stale "pending_review"/"changes_requested" alongside an
-- approved or reopened estimate. All existing checks are preserved verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_estimate_pricing(p_estimate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate RECORD;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_estimate FROM public.estimates WHERE id = p_estimate_id;
  IF v_estimate IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  IF v_role IS NULL OR NOT public.role_has_capability(v_role, 'canApproveEstimatePricing') THEN
    RAISE EXCEPTION 'Role does not have canApproveEstimatePricing';
  END IF;
  IF v_estimate.pricing_reviewed_at IS NOT NULL THEN
    RETURN; -- idempotent no-op
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estimate_line_items WHERE estimate_id = p_estimate_id) THEN
    RAISE EXCEPTION 'Cannot approve pricing with zero line items';
  END IF;

  UPDATE public.estimates
  SET pricing_reviewed_at = now(),
      pricing_reviewed_by = auth.uid(),
      pricing_review_status = NULL
  WHERE id = p_estimate_id;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  VALUES (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_approved', 'Estimate pricing approved.', auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_estimate_for_edit(p_estimate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate RECORD;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_estimate FROM public.estimates WHERE id = p_estimate_id;
  IF v_estimate IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  v_role := public.get_actor_org_role(v_estimate.org_id);
  IF v_role IS NULL OR NOT public.role_has_capability(v_role, 'canApproveEstimatePricing') THEN
    RAISE EXCEPTION 'Role does not have canApproveEstimatePricing';
  END IF;
  IF v_estimate.pricing_reviewed_at IS NULL THEN
    RETURN; -- idempotent no-op
  END IF;
  IF EXISTS (SELECT 1 FROM public.quotes WHERE estimate_id = p_estimate_id AND status != 'declined') THEN
    RAISE EXCEPTION 'Cannot reopen: an active quote already exists for this estimate';
  END IF;

  UPDATE public.estimates
  SET pricing_reviewed_at = NULL,
      pricing_reviewed_by = NULL,
      pricing_review_status = NULL
  WHERE id = p_estimate_id;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  VALUES (v_estimate.org_id, 'estimate', p_estimate_id, 'estimate_pricing_reopened', 'Estimate pricing approval reopened for edit.', auth.uid(),
          jsonb_build_object('service_request_id', v_estimate.service_request_id, 'site_visit_id', v_estimate.source_site_visit_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_estimate_pricing_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_estimate_pricing_review(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.return_estimate_pricing_for_changes(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_estimate_pricing_for_changes(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Edit lock — extended to also lock estimate content/line items while a
-- review is pending, not just after approval. Employees/subcontractors
-- cannot silently edit out from under an owner mid-review; owner/admin can
-- still return it for changes (which clears pending_review) or approve it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_estimate_pricing_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate RECORD;
BEGIN
  IF TG_TABLE_NAME = 'estimate_line_items' THEN
    SELECT * INTO v_estimate FROM public.estimates WHERE id = COALESCE(NEW.estimate_id, OLD.estimate_id);
    IF v_estimate.pricing_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Estimate pricing is approved — call reopen_estimate_for_edit() before editing line items';
    END IF;
    IF v_estimate.pricing_review_status = 'pending_review' THEN
      RAISE EXCEPTION 'Estimate is pending pricing review — line items are locked until it is approved or returned for changes';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'estimates' AND TG_OP = 'UPDATE' THEN
    IF OLD.pricing_reviewed_at IS NOT NULL
      AND NEW.pricing_reviewed_at IS NOT DISTINCT FROM OLD.pricing_reviewed_at
      AND NEW.description IS DISTINCT FROM OLD.description THEN
      RAISE EXCEPTION 'Estimate pricing is approved — call reopen_estimate_for_edit() before editing the description';
    END IF;
    IF OLD.pricing_review_status = 'pending_review'
      AND NEW.pricing_review_status IS NOT DISTINCT FROM OLD.pricing_review_status
      AND NEW.description IS DISTINCT FROM OLD.description THEN
      RAISE EXCEPTION 'Estimate is pending pricing review — return it for changes before editing the description';
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
