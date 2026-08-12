-- Customer / Staff Threaded Messaging V1 permission correction (PR #144).
--
-- 20260812010000_customer_staff_threaded_messaging.sql shipped
-- send_staff_reply() gated on "any active org member except viewer",
-- which lets subcontractors send customer-facing staff replies purely by
-- virtue of active org membership. A staff reply is an outward-facing
-- communication made as Premier Property Maintenance — narrower than
-- routine operational/scheduling work — so this tightens it to a named
-- capability, mirroring canPublishCustomerMedia's precedent
-- (20260811030000_customer_safe_photo_visibility.sql).
--
-- Role matrix: owner, admin, employee allowed; subcontractor, viewer
-- rejected. Must stay in exact sync with packages/shared/permissions.ts's
-- CAPABILITIES map (parity test enforces this on the app side).

-- ============================================================================
-- role_has_capability — CREATE OR REPLACE of the full function body, every
-- prior capability case preserved verbatim, only 'canReplyToCustomers' added.
-- ============================================================================

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
    when 'canCreateExpenses' then p_role in ('owner','admin','employee','subcontractor')
    when 'canApproveExpenses' then p_role in ('owner','admin')
    when 'canPublishCustomerMedia' then p_role in ('owner','admin')
    when 'canReplyToCustomers' then p_role in ('owner','admin','employee')
    else false
  end;
$$;

-- ============================================================================
-- send_staff_reply — CREATE OR REPLACE, identical to the original except the
-- authorization check now uses role_has_capability('canReplyToCustomers')
-- instead of "any role except viewer".
-- ============================================================================

create or replace function public.send_staff_reply(p_thread_id uuid, p_body text)
returns public.communication_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.communication_threads;
  v_role public.user_role;
  v_body text := trim(coalesce(p_body, ''));
  v_message public.communication_messages;
begin
  select t.* into v_thread from public.communication_threads t where t.id = p_thread_id;
  if v_thread.id is null then
    raise exception 'Conversation not found.';
  end if;

  v_role := public.get_actor_org_role(v_thread.org_id);
  if v_role is null or not public.role_has_capability(v_role, 'canReplyToCustomers') then
    raise exception 'Your role does not permit replying to customers.';
  end if;

  if v_body = '' then
    raise exception 'A message is required.';
  end if;
  if length(v_body) > 5000 then
    raise exception 'Message must be 5000 characters or fewer.';
  end if;

  insert into public.communication_messages (thread_id, org_id, sender_type, sender_user_id, body)
  values (p_thread_id, v_thread.org_id, 'staff', auth.uid(), v_body)
  returning * into v_message;

  update public.communication_threads
  set last_staff_read_at = now()
  where id = p_thread_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_thread.org_id, 'communication_thread', v_thread.id, 'staff_reply_sent',
    'Staff replied to customer.', auth.uid(),
    jsonb_build_object('customer_id', v_thread.customer_id));

  return v_message;
end;
$$;

grant execute on function public.send_staff_reply(uuid, text) to authenticated, service_role;
