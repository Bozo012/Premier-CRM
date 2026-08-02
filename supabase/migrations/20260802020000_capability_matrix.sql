-- Canonical, reviewed capability matrix — the SQL side of the same source of
-- truth as packages/shared/permissions.ts's CAPABILITIES map. A mismatch
-- between the two is treated as a security defect (SQL is the actual
-- enforcement boundary, since every RPC checks it, not the UI) — see the
-- automated parity test in apps/web's test suite, which enumerates every
-- role x capability pair against both implementations.
create or replace function public.role_has_capability(p_role public.user_role, p_capability text)
returns boolean
language sql
immutable
as $$
  select case p_capability
    when 'canCreateEstimates' then p_role in ('owner','admin','employee','subcontractor')
    when 'canSendEstimates' then p_role in ('owner','admin','employee','subcontractor')
    when 'canCreateInvoices' then p_role in ('owner','admin','employee','subcontractor')
    when 'canSendInvoices' then p_role in ('owner','admin','employee','subcontractor')
    when 'canRecordPayments' then p_role in ('owner','admin')
    when 'canVoidInvoices' then p_role in ('owner','admin')
    when 'canDeleteInvoices' then p_role in ('owner','admin')
    when 'canIssueRefunds' then p_role in ('owner','admin')
    when 'canScheduleJobs' then p_role in ('owner','admin','employee','subcontractor')
    when 'canProposeChangeOrders' then p_role in ('owner','admin','employee','subcontractor')
    when 'canManageDeposits' then p_role in ('owner','admin')
    when 'canEditWorkingInvoice' then p_role in ('owner','admin','employee','subcontractor')
    when 'canTriageRequests' then p_role in ('owner','admin','employee','subcontractor')
    when 'canCreateDirectWorkOrder' then p_role in ('owner','admin')
    when 'canManageInspectionTemplates' then p_role in ('owner','admin')
    when 'canEditEstimate' then p_role in ('owner','admin','employee','subcontractor')
    when 'canApproveEstimatePricing' then p_role in ('owner','admin')
    when 'canCreateQuote' then p_role in ('owner','admin','employee')
    when 'canSendQuote' then p_role in ('owner','admin','employee')
    else false
  end;
$$;

-- Small helper reused by every new RPC: the caller's role in a given org, or
-- NULL if not an active member.
create or replace function public.get_actor_org_role(p_org_id uuid)
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.org_members
  where org_id = p_org_id and user_id = auth.uid() and status = 'active'
  limit 1;
$$;
