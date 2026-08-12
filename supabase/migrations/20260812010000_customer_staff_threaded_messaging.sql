-- Customer / Staff Threaded Messaging — V1.
--
-- Replaces the one-shot activity_log('portal_contact_requested') submission
-- flow (apps/web/app/portal/actions.ts's submitPortalContactAction, and its
-- read side apps/web/app/portal/_lib/portal-messages.ts) with a real
-- two-way thread. That flow had no thread identity, no staff-reply model,
-- and no staff-facing surface at all — confirmed by repo-wide search
-- returning zero references to 'portal_contact_requested' outside the
-- portal package itself. activity_log remains a high-level event log only
-- (conversation_started / customer_message_received / staff_reply_sent),
-- never the canonical message store — full message bodies live here.
--
-- The pre-existing `communications` table (0003_vault_and_comms.sql) was
-- evaluated and rejected as a reuse target: zero rows, zero application
-- code references anywhere in the repo, no thread identity, no
-- sender_user_id/customer_account_id (only free-text from_address/
-- to_address — too weak a binding for authenticated in-app identity), and
-- its remaining columns (cc_addresses, provider_metadata, sentiment,
-- summary, action_items) are built for an SMS/email/call log, a different
-- documented purpose. Bolting real thread/sender semantics onto it would be
-- a bigger, messier change than two small purpose-built tables.

create table public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  subject text not null,
  -- Mirrors PORTAL_CONTACT_CATEGORIES ids (portal-contact-view-model.ts) —
  -- an app-level constant list, not a DB enum, matching how the rest of the
  -- portal contact flow already treats category/reply-method as free text.
  category text,
  related_request_id uuid references public.service_requests(id) on delete set null,
  related_property_id uuid references public.properties(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_customer_read_at timestamptz,
  last_staff_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_threads_subject_nonempty check (length(trim(subject)) > 0)
);

create index communication_threads_org_updated_idx on public.communication_threads (org_id, updated_at desc);
create index communication_threads_customer_updated_idx on public.communication_threads (customer_id, updated_at desc);

create trigger communication_threads_updated_at
  before update on public.communication_threads
  for each row execute function public.set_updated_at();

create table public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  -- Denormalized org_id, matching vault_items/activity_log convention —
  -- lets RLS/queries scope directly without a join back to the thread.
  org_id uuid not null references public.organizations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'staff')),
  sender_user_id uuid references auth.users(id),
  customer_account_id uuid references public.customer_accounts(id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint communication_messages_body_nonempty check (length(trim(body)) > 0),
  constraint communication_messages_body_maxlen check (length(body) <= 5000),
  constraint communication_messages_sender_identity check (
    (sender_type = 'staff' and sender_user_id is not null and customer_account_id is null)
    or
    (sender_type = 'customer' and customer_account_id is not null and sender_user_id is null)
  )
);

create index communication_messages_thread_created_idx on public.communication_messages (thread_id, created_at);
create index communication_messages_org_idx on public.communication_messages (org_id);

alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;

-- Staff read/write both tables via ordinary org-scoped RLS, exactly like
-- vault_items/activity_log — no RPC needed for staff reads. Staff writes
-- (replies) still go through send_staff_reply() below so sender_user_id is
-- always server-derived from auth.uid(), never client-supplied.
create policy "org_isolation_communication_threads" on public.communication_threads
  for all using (public.user_is_in_org(org_id));

create policy "org_isolation_communication_messages" on public.communication_messages
  for all using (public.user_is_in_org(org_id));

-- No customer-facing RLS policy on either table — mirrors
-- org_isolation_vault_items exactly (customers have no org_members row, so
-- the policy above already excludes them by construction). Every customer
-- access path goes through a SECURITY DEFINER RPC below.

grant select, insert, update, delete on public.communication_threads to authenticated;
grant select, insert, update, delete on public.communication_messages to authenticated;
grant select, insert, update, delete on public.communication_threads to service_role;
grant select, insert, update, delete on public.communication_messages to service_role;

-- ============================================================================
-- start_customer_thread — customer-only, SECURITY DEFINER. Derives
-- customer_id/org_id from the caller's own active customer_accounts row,
-- exactly like create_portal_service_request()
-- (20260810120000_create_portal_service_request_rpc.sql). Validates any
-- related request/property actually belongs to this customer before
-- linking it — never trusts a client-supplied id blindly.
-- ============================================================================

create or replace function public.start_customer_thread(
  p_subject text,
  p_body text,
  p_category text default null,
  p_related_request_id uuid default null,
  p_related_property_id uuid default null
)
returns public.communication_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_org_id uuid;
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_thread public.communication_threads;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select ca.customer_id, ca.org_id
    into v_customer_id, v_org_id
    from public.customer_accounts ca
   where ca.auth_user_id = auth.uid()
     and ca.status = 'active';

  if v_customer_id is null then
    raise exception 'No active customer account linked to this session.';
  end if;

  if v_subject = '' then
    raise exception 'A subject is required.';
  end if;
  if length(v_subject) > 120 then
    raise exception 'Subject must be 120 characters or fewer.';
  end if;
  if v_body = '' then
    raise exception 'A message is required.';
  end if;
  if length(v_body) > 5000 then
    raise exception 'Message must be 5000 characters or fewer.';
  end if;

  if p_related_request_id is not null then
    if not exists (
      select 1 from public.service_requests sr
      where sr.id = p_related_request_id and sr.customer_id = v_customer_id and sr.org_id = v_org_id
    ) then
      raise exception 'The selected request does not belong to your account.';
    end if;
  end if;

  if p_related_property_id is not null then
    if not exists (
      select 1 from public.customer_properties cp
      join public.properties p on p.id = cp.property_id
      where cp.property_id = p_related_property_id and cp.customer_id = v_customer_id and p.org_id = v_org_id
    ) then
      raise exception 'The selected property does not belong to your account.';
    end if;
  end if;

  insert into public.communication_threads (org_id, customer_id, subject, category, related_request_id, related_property_id, last_customer_read_at)
  values (v_org_id, v_customer_id, v_subject, nullif(trim(coalesce(p_category, '')), ''), p_related_request_id, p_related_property_id, now())
  returning * into v_thread;

  insert into public.communication_messages (thread_id, org_id, sender_type, customer_account_id, body)
  select v_thread.id, v_org_id, 'customer', ca.id, v_body
    from public.customer_accounts ca
   where ca.auth_user_id = auth.uid() and ca.status = 'active';

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_org_id, 'communication_thread', v_thread.id, 'conversation_started',
    format('Customer started a conversation: %s', v_subject), auth.uid(),
    jsonb_build_object('customer_id', v_customer_id));

  return v_thread;
end;
$$;

-- ============================================================================
-- send_customer_message — customer-only, SECURITY DEFINER. Thread ownership
-- proven via the same customer_accounts join before any insert.
-- ============================================================================

create or replace function public.send_customer_message(p_thread_id uuid, p_body text)
returns public.communication_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.communication_threads;
  v_customer_account_id uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_message public.communication_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if v_body = '' then
    raise exception 'A message is required.';
  end if;
  if length(v_body) > 5000 then
    raise exception 'Message must be 5000 characters or fewer.';
  end if;

  select t.* into v_thread from public.communication_threads t where t.id = p_thread_id;
  if v_thread.id is null then
    raise exception 'Conversation not found.';
  end if;

  select ca.id into v_customer_account_id
    from public.customer_accounts ca
   where ca.auth_user_id = auth.uid()
     and ca.status = 'active'
     and ca.customer_id = v_thread.customer_id;

  if v_customer_account_id is null then
    raise exception 'This conversation does not belong to your account.';
  end if;

  insert into public.communication_messages (thread_id, org_id, sender_type, customer_account_id, body)
  values (p_thread_id, v_thread.org_id, 'customer', v_customer_account_id, v_body)
  returning * into v_message;

  update public.communication_threads
  set last_customer_read_at = now()
  where id = p_thread_id;

  insert into public.activity_log (org_id, entity_type, entity_id, event_type, message, actor_user_id, related_ids)
  values (v_thread.org_id, 'communication_thread', v_thread.id, 'customer_message_received',
    'Customer sent a follow-up message.', auth.uid(),
    jsonb_build_object('customer_id', v_thread.customer_id));

  return v_message;
end;
$$;

-- ============================================================================
-- send_staff_reply — staff-only, SECURITY DEFINER. Any active org member
-- except 'viewer' may reply (viewer never gets write capabilities anywhere
-- in this codebase — packages/shared/permissions.ts's own standing rule).
-- No new named Capability was added: replying to a customer is routine
-- support-inbox work, not a sensitive/outward-facing authorization decision
-- like canPublishCustomerMedia, so gating it on plain active membership
-- (minus viewer) is the smallest correct rule, not an omission.
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
  if v_role is null or v_role = 'viewer' then
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

-- ============================================================================
-- list_customer_threads / list_customer_thread_messages — the ONE
-- centralized customer read path per table, mirroring
-- list_customer_visible_photos()'s discipline exactly: ownership proven via
-- customer_accounts in the same query, never split into a separate
-- browser-authoritative step.
-- ============================================================================

create or replace function public.list_customer_threads()
returns setof public.communication_threads
language sql
security definer
set search_path = public
stable
as $$
  select t.* from public.communication_threads t
  join public.customer_accounts ca on ca.customer_id = t.customer_id
  where ca.auth_user_id = auth.uid()
    and ca.status = 'active'
  order by t.updated_at desc;
$$;

create or replace function public.list_customer_thread_messages(p_thread_id uuid)
returns setof public.communication_messages
language sql
security definer
set search_path = public
stable
as $$
  select m.* from public.communication_messages m
  join public.communication_threads t on t.id = m.thread_id
  join public.customer_accounts ca on ca.customer_id = t.customer_id
  where m.thread_id = p_thread_id
    and ca.auth_user_id = auth.uid()
    and ca.status = 'active'
  order by m.created_at asc;
$$;

create or replace function public.mark_thread_read_by_customer(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.communication_threads t
  set last_customer_read_at = now()
  where t.id = p_thread_id
    and exists (
      select 1 from public.customer_accounts ca
      where ca.customer_id = t.customer_id
        and ca.auth_user_id = auth.uid()
        and ca.status = 'active'
    );
end;
$$;

revoke all on function public.start_customer_thread(text, text, text, uuid, uuid) from public;
revoke all on function public.send_customer_message(uuid, text) from public;
revoke all on function public.send_staff_reply(uuid, text) from public;
revoke all on function public.list_customer_threads() from public;
revoke all on function public.list_customer_thread_messages(uuid) from public;
revoke all on function public.mark_thread_read_by_customer(uuid) from public;

grant execute on function public.start_customer_thread(text, text, text, uuid, uuid) to authenticated;
grant execute on function public.send_customer_message(uuid, text) to authenticated;
grant execute on function public.send_staff_reply(uuid, text) to authenticated, service_role;
grant execute on function public.list_customer_threads() to authenticated;
grant execute on function public.list_customer_thread_messages(uuid) to authenticated;
grant execute on function public.mark_thread_read_by_customer(uuid) to authenticated;
