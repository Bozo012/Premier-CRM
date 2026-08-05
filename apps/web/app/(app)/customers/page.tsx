import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, ChevronRight, Home, Mail, Phone, Plus, Search } from 'lucide-react';

import { getActiveOrgContext, listCustomers, type Customer } from '@premier/db';

import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Customers' };

interface CustomersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type CustomerStatus = 'all' | 'active' | 'prospect' | 'inactive';

interface CustomerPropertySummary {
  id: string;
  name: string;
  type: 'commercial' | 'residential';
}

interface CustomerRowModel {
  customer: Customer;
  email: string;
  lastActivityLabel: string;
  name: string;
  openEstimates: number;
  openRequests: number;
  phone: string;
  properties: CustomerPropertySummary[];
  status: Exclude<CustomerStatus, 'all'>;
}

const STATUS_FILTERS: Array<{ label: string; value: CustomerStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Prospect', value: 'prospect' },
  { label: 'Inactive', value: 'inactive' },
];

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const status = readStatusParam(params.status);

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
    return (
      <PageShell search={search} status={status} rows={[]}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }

  const { orgId } = orgContextResult.data;
  const result = await listCustomers(supabase, {
    orgId,
    limit: 250,
    offset: 0,
  });

  if (!result.success) {
    return (
      <PageShell search={search} status={status} rows={[]}>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load customers: {result.error}
        </p>
      </PageShell>
    );
  }

  const customers = result.data.customers;
  const customerIds = customers.map((customer) => customer.id);
  const [propertyLinks, requestRows, estimateRows] =
    customerIds.length > 0
      ? await Promise.all([
          supabase
            .from('customer_properties')
            .select('customer_id, properties(id, address_line_1, property_type)')
            .in('customer_id', customerIds),
          supabase
            .from('service_requests')
            .select('customer_id, status')
            .eq('org_id', orgId)
            .in('customer_id', customerIds),
          supabase
            .from('estimates')
            .select('customer_id, status')
            .eq('org_id', orgId)
            .in('customer_id', customerIds),
        ])
      : [
          { data: null },
          { data: null },
          { data: null },
        ];

  const rows = customers.map((customer) =>
    toCustomerRow(
      customer,
      ((propertyLinks.data ?? []) as CustomerPropertyLink[]).filter((link) => link.customer_id === customer.id),
      ((requestRows.data ?? []) as WorkCountRow[]).filter((row) => row.customer_id === customer.id),
      ((estimateRows.data ?? []) as WorkCountRow[]).filter((row) => row.customer_id === customer.id)
    )
  );
  const visibleRows = rows.filter((row) => matchesCustomer(row, search, status));

  return (
    <PageShell search={search} status={status} rows={rows}>
      {visibleRows.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Properties</th>
                  <th className="px-5 py-3">Open items</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((row) => (
                  <tr key={row.customer.id} className="transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <Link href={`/customers/${row.customer.id}`} className="font-bold text-foreground hover:underline">
                        {row.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.properties[0]?.name ?? 'No property linked'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{row.phone}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{row.email}</p>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold">{row.properties.length} {row.properties.length === 1 ? 'property' : 'properties'}</td>
                    <td className="px-5 py-4 text-xs font-semibold">
                      {row.openRequests + row.openEstimates > 0 ? `${row.openRequests} req · ${row.openEstimates} est` : '—'}
                    </td>
                    <td className="px-5 py-4"><StatusPill status={row.status} /></td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{row.lastActivityLabel}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/customers/${row.customer.id}`} aria-label={`Open ${row.name}`}>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {visibleRows.map((row) => (
              <Link key={row.customer.id} href={`/customers/${row.customer.id}`} className="rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.properties[0]?.name ?? 'No property linked'}</p>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>
                  <span>{row.properties.length} {row.properties.length === 1 ? 'property' : 'properties'}</span>
                  {row.openRequests + row.openEstimates > 0 ? <span>{row.openRequests} req · {row.openEstimates} est</span> : null}
                  <span>{row.lastActivityLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.properties.slice(0, 2).map((property) => {
                    const Icon = property.type === 'commercial' ? Building2 : Home;
                    return (
                      <span key={property.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {property.name}
                      </span>
                    );
                  })}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  rows,
  search = '',
  status,
}: {
  children: React.ReactNode;
  rows: CustomerRowModel[];
  search?: string;
  status: CustomerStatus;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage customer accounts, properties, and contact details.</p>
          </div>
          <Button asChild className="min-h-11 rounded-xl px-4 font-bold">
            <Link href="/customers/new"><Plus className="h-4 w-4" /> Add customer</Link>
          </Button>
        </div>
        <form action="/customers" className="relative">
          <input type="hidden" name="status" value={status} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by name, email, or property..."
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter customers">
          {STATUS_FILTERS.map((filter) => {
            const count = filter.value === 'all' ? rows.length : rows.filter((row) => row.status === filter.value).length;
            return (
              <Link
                key={filter.value}
                href={`/customers?status=${filter.value}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
                className={[
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition',
                  status === filter.value ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                {filter.label}
                <span className={status === filter.value ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>{count}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </main>
  );
}

function EmptyState({ search }: { search?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center rounded-xl border bg-card px-4 text-center">
      <div>
        <h2 className="text-lg font-bold">{search ? 'No customers found' : 'No customers yet'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{search ? 'Try adjusting your search or filters.' : 'Add your first customer to get started.'}</p>
      </div>
    </div>
  );
}

interface CustomerPropertyLink {
  customer_id: string;
  properties: { id: string; address_line_1: string; property_type: string | null } | null;
}

interface WorkCountRow {
  customer_id: string;
  status: string;
}

function toCustomerRow(
  customer: Customer,
  propertyLinks: CustomerPropertyLink[],
  requestRows: WorkCountRow[],
  estimateRows: WorkCountRow[]
): CustomerRowModel {
  const properties = propertyLinks.flatMap((link) => {
    if (!link.properties) return [];
    return [{
      id: link.properties.id,
      name: link.properties.address_line_1,
      type: link.properties.property_type?.toLowerCase().includes('commercial') ? 'commercial' as const : 'residential' as const,
    }];
  });
  const openRequests = requestRows.filter((row) => !['completed', 'cancelled', 'spam', 'estimate_created'].includes(row.status)).length;
  const openEstimates = estimateRows.filter((row) => !['declined', 'expired', 'converted'].includes(row.status)).length;

  return {
    customer,
    email: customer.email ?? 'No email',
    lastActivityLabel: relativeTime(customer.last_contact_at ?? customer.updated_at ?? customer.created_at),
    name: resolveDisplayName(customer),
    openEstimates,
    openRequests,
    phone: customer.phone_primary ?? 'No phone',
    properties,
    status: customer.is_archived ? 'inactive' : properties.length === 0 && (customer.total_jobs ?? 0) === 0 ? 'prospect' : 'active',
  };
}

function matchesCustomer(row: CustomerRowModel, search: string | undefined, status: CustomerStatus): boolean {
  if (status !== 'all' && row.status !== status) return false;
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [row.name, row.email, row.phone, ...row.properties.map((property) => property.name)].some((value) => value.toLowerCase().includes(normalized));
}

function StatusPill({ status }: { status: Exclude<CustomerStatus, 'all'> }) {
  const label = status === 'active' ? 'Active' : status === 'prospect' ? 'Prospect' : 'Inactive';
  const className =
    status === 'active'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'prospect'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-50 text-slate-500';
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}

function resolveDisplayName(customer: Customer): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
}

function relativeTime(value: string): string {
  const deltaMs = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(deltaMs / 3_600_000));
  if (hours < 1) return 'Now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readStatusParam(value: string | string[] | undefined): CustomerStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.some((filter) => filter.value === raw) ? (raw as CustomerStatus) : 'all';
}
