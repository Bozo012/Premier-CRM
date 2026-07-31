-- Fix enforce_change_order_line_item_immutability: when a job (and its
-- change_orders -> change_order_revisions -> change_order_line_items) is
-- cascade-deleted, Postgres can delete a line item's parent revision row
-- in the same statement/transaction, so the trigger's own lookup of the
-- parent's status returns NULL. NULL IS DISTINCT FROM 'draft' is true, so
-- the old version blocked EVERY cascading delete, not just targeted edits
-- to a live revision. Found via test cleanup after
-- integrated-lifecycle-bot's happy-path run (deleting a job failed with
-- "Cannot modify line items once the revision has left draft status
-- (status=<NULL>)").
--
-- Fix: only enforce the rule when the parent revision still exists and is
-- genuinely not-draft — a NULL parent means this is a lifecycle removal of
-- the whole thread, not an edit, and must not be blocked.

CREATE OR REPLACE FUNCTION public.enforce_change_order_line_item_immutability()
RETURNS TRIGGER AS $$
DECLARE
  revision_status public.change_order_status;
BEGIN
  SELECT status INTO revision_status FROM public.change_order_revisions
    WHERE id = COALESCE(NEW.revision_id, OLD.revision_id);

  IF revision_status IS NOT NULL AND revision_status != 'draft' THEN
    RAISE EXCEPTION 'Cannot modify line items once the revision has left draft status (status=%).', revision_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql
   SET search_path = public;
