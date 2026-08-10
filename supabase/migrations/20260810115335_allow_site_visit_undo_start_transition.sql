-- undo_site_visit_start() (migration 20260802020200_site_visit_lifecycle_rpcs.sql)
-- already correctly guards and clears started_at/started_by when reverting
-- an accidental start, but its own UPDATE ... SET status = 'scheduled' has
-- always been rejected by enforce_site_visit_transitions()
-- (20260802010200_site_visit_status_and_table.sql), which never allowed
-- in_progress -> scheduled — the RPC's application-level checks (role,
-- current status, no saved inspection findings) are correct and were never
-- the blocker; the trigger was. This adds exactly that one transition,
-- additive to the existing allow-list, no other transition changed.
create or replace function public.enforce_site_visit_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    if not (
      (old.status = 'awaiting_scheduling' and new.status = 'scheduled') or
      (old.status = 'scheduled' and new.status = 'in_progress') or
      (old.status = 'scheduled' and new.status = 'awaiting_scheduling') or
      (old.status = 'in_progress' and new.status = 'scheduled') or
      (old.status = 'in_progress' and new.status = 'completed') or
      (old.status in ('awaiting_scheduling','scheduled') and new.status = 'cancelled')
    ) then
      raise exception 'Illegal site_visits status transition: % -> %', old.status, new.status;
    end if;
  end if;

  -- Findings are immutable once completed.
  if TG_OP = 'UPDATE' and old.completed_at is not null then
    if new.inspection_responses is distinct from old.inspection_responses
      or new.response_schema_version is distinct from old.response_schema_version then
      raise exception 'inspection_responses is immutable after site visit completion';
    end if;
  end if;

  return new;
end;
$$;
