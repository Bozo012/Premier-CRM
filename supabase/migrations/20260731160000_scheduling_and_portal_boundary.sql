-- Scheduling (curated slots + separate booking records, per corrected
-- design — a slot's capacity and its bookings cannot live in the same row),
-- the portal-visible RLS surface (jobs, deposits already done, change
-- orders already done), a working-invoice visibility restriction, and the
-- vault_items attachment link to a specific change-order revision.

-- ============================================================================
-- SCHEDULING_SLOTS / SCHEDULING_SLOT_BOOKINGS
-- ============================================================================

CREATE TABLE public.scheduling_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX scheduling_slots_org_starts_idx ON public.scheduling_slots (org_id, starts_at);

CREATE TABLE public.scheduling_slot_bookings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slot_id                UUID NOT NULL REFERENCES public.scheduling_slots(id) ON DELETE CASCADE,
  job_id                 UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  booked_by_user_id      UUID REFERENCES auth.users(id),
  booked_by_customer_id  UUID REFERENCES public.customers(id),
  cancelled_at           TIMESTAMPTZ,
  cancelled_by_user_id   UUID REFERENCES auth.users(id),
  cancelled_by_customer_id UUID REFERENCES public.customers(id),
  cancellation_reason    TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A job can have at most one ACTIVE booking, enforced below (partial
  -- index, since a cancelled+rebooked job legitimately has >1 booking row
  -- over time — history is preserved, never deleted).
  CONSTRAINT scheduling_slot_bookings_slot_job_unique UNIQUE (slot_id, job_id)
);

CREATE UNIQUE INDEX scheduling_slot_bookings_one_active_per_job
  ON public.scheduling_slot_bookings (job_id) WHERE cancelled_at IS NULL;

CREATE INDEX scheduling_slot_bookings_slot_idx ON public.scheduling_slot_bookings (slot_id) WHERE cancelled_at IS NULL;

-- ============================================================================
-- apply_job_scheduling — the ONE place both staff-direct and customer
-- slot-booking scheduling paths transition a job to 'scheduled'. Also
-- activates (creates if missing) the job's working invoice, matching the
-- requirement that scheduling and working-invoice activation happen
-- together.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_job_scheduling(
  p_job_id UUID,
  p_org_id UUID,
  p_scheduled_start TIMESTAMPTZ,
  p_scheduled_end TIMESTAMPTZ,
  p_actor_user_id UUID,
  p_actor_customer_id UUID
) RETURNS public.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.jobs;
  v_linked_request_id UUID;
  v_working_invoice_id UUID;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id AND org_id = p_org_id FOR UPDATE;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found in this organization.';
  END IF;
  IF v_job.status != 'approved' THEN
    RAISE EXCEPTION 'Only an approved (unscheduled) job can be scheduled (current status=%).', v_job.status;
  END IF;
  IF p_scheduled_end IS NOT NULL AND p_scheduled_end < p_scheduled_start THEN
    RAISE EXCEPTION 'Scheduled end must be after scheduled start.';
  END IF;

  UPDATE public.jobs
  SET scheduled_start = p_scheduled_start,
      scheduled_end = p_scheduled_end,
      status = 'scheduled'
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  SELECT id INTO v_linked_request_id FROM public.service_requests
  WHERE job_id = p_job_id AND org_id = p_org_id;

  IF v_linked_request_id IS NOT NULL THEN
    UPDATE public.service_requests SET status = 'scheduled' WHERE id = v_linked_request_id;
  END IF;

  SELECT id INTO v_working_invoice_id FROM public.invoices
  WHERE job_id = p_job_id AND kind = 'working' AND status != 'void'
  LIMIT 1;

  IF v_working_invoice_id IS NULL THEN
    INSERT INTO public.invoices (org_id, job_id, kind, status, title)
    VALUES (p_org_id, p_job_id, 'working', 'draft', 'Working invoice');
  END IF;

  INSERT INTO public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id)
  VALUES (p_org_id, 'job', p_job_id, 'job_scheduled',
    format('Job scheduled for %s.', p_scheduled_start),
    p_actor_user_id);

  RETURN v_job;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_job_scheduling(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID)
  TO authenticated, service_role;

-- ============================================================================
-- book_scheduling_slot — row-locked capacity check (no unlocked COUNT(*)
-- race), then delegates the actual job transition to apply_job_scheduling.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.book_scheduling_slot(
  p_slot_id UUID,
  p_job_id UUID,
  p_actor_customer_id UUID
) RETURNS public.scheduling_slot_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slot public.scheduling_slots;
  v_job public.jobs;
  v_active_bookings INTEGER;
  v_booking public.scheduling_slot_bookings;
BEGIN
  SELECT * INTO v_slot FROM public.scheduling_slots WHERE id = p_slot_id FOR UPDATE;
  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Scheduling slot not found.';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL OR v_job.org_id != v_slot.org_id THEN
    RAISE EXCEPTION 'Job does not belong to the same organization as this slot.';
  END IF;
  IF v_job.customer_id != p_actor_customer_id THEN
    RAISE EXCEPTION 'This job does not belong to the acting customer.';
  END IF;
  IF v_job.status != 'approved' THEN
    RAISE EXCEPTION 'Only an approved (unscheduled) job can be booked (current status=%).', v_job.status;
  END IF;

  SELECT count(*) INTO v_active_bookings
  FROM public.scheduling_slot_bookings
  WHERE slot_id = p_slot_id AND cancelled_at IS NULL;

  IF v_active_bookings >= v_slot.capacity THEN
    RAISE EXCEPTION 'This slot is fully booked.';
  END IF;

  INSERT INTO public.scheduling_slot_bookings (org_id, slot_id, job_id, booked_by_customer_id)
  VALUES (v_slot.org_id, p_slot_id, p_job_id, p_actor_customer_id)
  RETURNING * INTO v_booking;

  PERFORM public.apply_job_scheduling(p_job_id, v_slot.org_id, v_slot.starts_at, v_slot.ends_at, NULL, p_actor_customer_id);

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_scheduling_slot(UUID, UUID, UUID) TO authenticated, service_role;

-- ============================================================================
-- cancel_scheduling_slot_booking — history preserved, never deleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_scheduling_slot_booking(
  p_booking_id UUID,
  p_actor_user_id UUID,
  p_actor_customer_id UUID,
  p_reason TEXT
) RETURNS public.scheduling_slot_bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking public.scheduling_slot_bookings;
BEGIN
  SELECT * INTO v_booking FROM public.scheduling_slot_bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF v_booking.cancelled_at IS NOT NULL THEN
    RETURN v_booking; -- idempotent
  END IF;

  UPDATE public.scheduling_slot_bookings
  SET cancelled_at = now(),
      cancelled_by_user_id = p_actor_user_id,
      cancelled_by_customer_id = p_actor_customer_id,
      cancellation_reason = p_reason
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_scheduling_slot_booking(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.scheduling_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_slot_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_all_scheduling_slots" ON public.scheduling_slots
  FOR ALL USING (public.user_is_in_org(org_id));

-- Customers may see open slots for any org they have an active job with
-- (needed to pick a slot before a booking row exists).
CREATE POLICY "customer_select_scheduling_slots" ON public.scheduling_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.org_id = scheduling_slots.org_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

CREATE POLICY "org_select_scheduling_slot_bookings" ON public.scheduling_slot_bookings
  FOR SELECT USING (public.user_is_in_org(org_id));

CREATE POLICY "customer_select_own_scheduling_slot_bookings" ON public.scheduling_slot_bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.id = scheduling_slot_bookings.job_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

-- No direct authenticated INSERT/UPDATE/DELETE grant on bookings — booking/
-- cancellation happen exclusively through the RPCs above.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_slots TO authenticated;
GRANT SELECT ON public.scheduling_slot_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_slots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduling_slot_bookings TO service_role;

-- ============================================================================
-- jobs: portal read access (needed for scheduling picker, job status, etc.)
-- ============================================================================

CREATE POLICY "customer_select_own_jobs" ON public.jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.customer_id = jobs.customer_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

-- ============================================================================
-- Working-invoice visibility: intentional, not an accidental consequence of
-- the existing broad kind-agnostic customer invoice policy. Customers never
-- see the working invoice row directly (it carries internal notes/source
-- attribution); a dedicated narrow read serves the portal's "working
-- invoice visibility" requirement instead (see lib/working-invoice.ts).
-- ============================================================================

DROP POLICY IF EXISTS "customer_select_own_invoices" ON public.invoices;

CREATE POLICY "customer_select_own_invoices" ON public.invoices
  FOR SELECT USING (
    kind != 'working'
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.customer_accounts ca ON ca.customer_id = j.customer_id
      WHERE j.id = invoices.job_id
        AND ca.auth_user_id = auth.uid()
        AND ca.status = 'active'
    )
  );

-- ============================================================================
-- vault_items: attachments belong to a specific change-order revision (the
-- exact approved evidence), not just the thread.
-- ============================================================================

ALTER TABLE public.vault_items
  ADD COLUMN change_order_revision_id UUID REFERENCES public.change_order_revisions(id);
