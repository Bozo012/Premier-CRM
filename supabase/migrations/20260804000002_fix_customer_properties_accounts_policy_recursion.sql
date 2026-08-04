-- Fixes a real bug introduced by
-- 20260804000001_harden_customer_properties_and_accounts.sql, caught by
-- authorization-customers-properties-bot.spec.ts against premier-crm-e2e
-- immediately after that migration was applied (never reached production;
-- production has not had CP-B applied yet — see the implementation
-- addendum in docs/security/customers-properties-authorization-audit.md).
--
-- customer_accounts_select_org_members's USING clause queries `customers`
-- directly (`EXISTS (SELECT 1 FROM customers c WHERE c.id =
-- customer_accounts.customer_id AND c.org_id = customer_accounts.org_id)`).
-- That subquery is itself RLS-evaluated against `customers`, whose
-- pre-existing customer_select_own_customer policy queries
-- `customer_accounts` back (`EXISTS (SELECT 1 FROM customer_accounts ca
-- WHERE ca.auth_user_id = auth.uid() ... )`) — a direct customers <->
-- customer_accounts policy cycle, raising `42P17 infinite recursion
-- detected in policy for relation "customers"` on any SELECT against
-- either table.
--
-- The same latent cycle exists for customer_properties_select_org_members:
-- its direct EXISTS subquery against `properties` triggers properties'
-- own customer_select_own_properties policy, which joins back through
-- `customer_properties` itself.
--
-- Fix: match the codebase's established pattern for this exact class of
-- problem (see public.user_is_in_org — STABLE SECURITY DEFINER) with two
-- narrow, read-only helper functions that resolve a customer's or
-- property's org_id by bypassing RLS on the underlying table entirely, so
-- the cross-table org check never re-enters the caller's own RLS
-- evaluation.

create or replace function public.customer_org_id(p_customer_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.customers where id = p_customer_id;
$$;

create or replace function public.property_org_id(p_property_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.properties where id = p_property_id;
$$;

-- customer_properties -------------------------------------------------------

drop policy if exists "customer_properties_select_org_members" on public.customer_properties;

create policy "customer_properties_select_org_members" on public.customer_properties
  for select using (
    user_is_in_org(customer_org_id(customer_properties.customer_id))
    and user_is_in_org(property_org_id(customer_properties.property_id))
  );

-- customer_accounts -----------------------------------------------------

drop policy if exists "customer_accounts_select_org_members" on public.customer_accounts;

create policy "customer_accounts_select_org_members" on public.customer_accounts
  for select using (
    user_is_in_org(org_id)
    and customer_org_id(customer_accounts.customer_id) = customer_accounts.org_id
  );
