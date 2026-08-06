import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { getActiveOrgContext, listCustomers, type Customer } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { toCustomerSummary, toCustomersListViewModel, type CustomerPropertyLink, type WorkCountRow } from './_lib/forge-customers-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { CustomersShell } from './_components/customers-shell';
import { CustomersListContainer } from './_components/customers-list-container';

export const metadata: Metadata = { title: 'Customers' };

interface CustomersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VALUES = ['all', 'active', 'prospect', 'inactive'] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const statusFilter = readStatusParam(params.status);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/customers');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    // No shell can be built without an org — this mirrors the pre-existing
    // OrgContextError fallback (no regression versus the prior page.tsx).
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const { orgId } = orgContextResult.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  // Real server-side search (packages/db/queries/customers.ts:listCustomers
  // ilike's `display_name`) — not client-side filtering. `status` has no
  // persisted column to push into the query (see deriveCustomerPresentationStatus's
  // doc comment in forge-customers-view-model.ts), so it stays a post-fetch
  // filter over this bounded page, same limitation the pre-existing page.tsx
  // already had.
  const result = await listCustomers(supabase, { orgId, search, limit: 250, offset: 0 });

  if (!result.success) {
    return (
      <CustomersShell shellData={shellData} mobileNav={mobileNav}>
        <CustomersListContainer
          model={toCustomersListViewModel({
            customers: [],
            searchQuery: search ?? '',
            statusFilter,
            error: { title: 'Customers could not be loaded', message: result.error },
          })}
        />
      </CustomersShell>
    );
  }

  const customers = result.data.customers;
  const customerIds = customers.map((customer) => customer.id);
  const [propertyLinks, requestRows, estimateRows] =
    customerIds.length > 0
      ? await Promise.all([
          supabase.from('customer_properties').select('customer_id, properties(id, address_line_1, property_type)').in('customer_id', customerIds),
          supabase.from('service_requests').select('customer_id, status').eq('org_id', orgId).in('customer_id', customerIds),
          supabase.from('estimates').select('customer_id, status').eq('org_id', orgId).in('customer_id', customerIds),
        ])
      : [{ data: null }, { data: null }, { data: null }];

  const now = new Date();
  const summaries = customers.map((customer: Customer) =>
    toCustomerSummary(
      customer,
      ((propertyLinks.data ?? []) as CustomerPropertyLink[]).filter((link) => link.customer_id === customer.id),
      ((requestRows.data ?? []) as WorkCountRow[]).filter((row) => row.customer_id === customer.id),
      ((estimateRows.data ?? []) as WorkCountRow[]).filter((row) => row.customer_id === customer.id),
      now
    )
  );

  const model = toCustomersListViewModel({ customers: summaries, searchQuery: search ?? '', statusFilter });

  return (
    <CustomersShell shellData={shellData} mobileNav={mobileNav}>
      <CustomersListContainer model={model} />
    </CustomersShell>
  );
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readStatusParam(value: string | string[] | undefined): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (STATUS_VALUES as readonly string[]).includes(raw ?? '') ? (raw as StatusFilter) : 'all';
}
