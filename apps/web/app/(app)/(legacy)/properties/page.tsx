import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Building2, ChevronRight, Home, Plus, Search } from 'lucide-react';

import { getActiveOrgContext, listProperties, type PropertyListItem } from '@premier/db';

import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { ForgeStatusPill } from '@/components/forge/presentation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Properties' };

type StatusFilter = 'all' | 'active' | 'onboarding' | 'inactive';
type TypeFilter = 'all' | 'residential' | 'commercial';

interface PropertiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface PropertyRowModel {
  activeJobs: number;
  attentionLabel: string | null;
  customerId: string | null;
  customerName: string;
  item: PropertyListItem;
  nextVisitLabel: string;
  openRequests: number;
  status: Exclude<StatusFilter, 'all'>;
  type: Exclude<TypeFilter, 'all'>;
  updatedLabel: string;
}

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Onboarding', value: 'onboarding' },
  { label: 'Inactive', value: 'inactive' },
];

const TYPE_FILTERS: Array<{ label: string; value: TypeFilter }> = [
  { label: 'All types', value: 'all' },
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
];

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const status = readStatusParam(params.status);
  const type = readTypeParam(params.type);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/properties');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <PageShell rows={[]} search={search} status={status} type={type}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }

  const { orgId } = orgContextResult.data;
  const result = await listProperties(supabase, { limit: 250, offset: 0, orgId });

  if (!result.success) {
    return (
      <PageShell rows={[]} search={search} status={status} type={type}>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Failed to load properties: {result.error}</p>
      </PageShell>
    );
  }

  const propertyIds = result.data.properties.map((row) => row.property.id);
  const [requestsResult, jobsResult] =
    propertyIds.length > 0
      ? await Promise.all([
          supabase.from('service_requests').select('property_id, status').eq('org_id', orgId).in('property_id', propertyIds),
          supabase.from('jobs').select('property_id, status, scheduled_start, title').eq('org_id', orgId).in('property_id', propertyIds),
        ])
      : [{ data: null }, { data: null }];

  const rows = result.data.properties.map((item) =>
    toPropertyRow(item, (requestsResult.data ?? []) as PropertyWorkRow[], (jobsResult.data ?? []) as PropertyJobRow[])
  );
  const visibleRows = rows.filter((row) => matchesProperty(row, search, status, type));

  return (
    <PageShell rows={rows} search={search} status={status} type={type}>
      <p className="text-sm font-semibold text-muted-foreground">
        {visibleRows.length} of {rows.length} {rows.length === 1 ? 'property' : 'properties'}
      </p>

      {visibleRows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-xl border bg-card px-4 text-center">
          <div>
            <h2 className="text-lg font-bold">No properties found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm lg:block">
            <table className="w-full">
              <thead className="bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Property</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Open work</th>
                  <th className="px-4 py-2.5">Next visit</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.item.property.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/properties/${row.item.property.id}`} className="font-bold text-foreground hover:underline">
                        {row.item.property.address_line_1}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatAddress(row.item.property)}</p>
                      {row.attentionLabel ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <AlertTriangle className="h-3 w-3" /> {row.attentionLabel}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.customerId ? (
                        <Link href={`/customers/${row.customerId}`} className="text-sm font-bold text-primary hover:underline">
                          {row.customerName}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">No customer</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold">{labelize(row.type)}</p>
                      <p className="text-xs text-muted-foreground">{row.item.property.property_type ?? 'General property'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{row.openRequests} requests · {row.activeJobs} jobs</td>
                    <td className="px-4 py-3 text-sm">{row.nextVisitLabel}</td>
                    <td className="px-4 py-3"><PropertyStatus status={row.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.updatedLabel}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {visibleRows.map((row) => {
              const Icon = row.type === 'commercial' ? Building2 : Home;
              return (
                <Link key={row.item.property.id} href={`/properties/${row.item.property.id}`} className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{row.item.property.address_line_1}</p>
                      <p className="truncate text-xs text-muted-foreground">{formatAddress(row.item.property)}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PropertyStatus status={row.status} />
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{labelize(row.type)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                    <div><dt className="text-[11px] font-bold uppercase text-muted-foreground">Requests</dt><dd className="text-sm font-bold">{row.openRequests}</dd></div>
                    <div><dt className="text-[11px] font-bold uppercase text-muted-foreground">Jobs</dt><dd className="text-sm font-bold">{row.activeJobs}</dd></div>
                    <div><dt className="text-[11px] font-bold uppercase text-muted-foreground">Updated</dt><dd className="text-sm font-bold">{row.updatedLabel}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">Next visit: {row.nextVisitLabel}</p>
                  {row.attentionLabel ? <p className="mt-2 text-xs font-semibold text-primary">{row.attentionLabel}</p> : null}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  rows,
  search,
  status,
  type,
}: {
  children: React.ReactNode;
  rows: PropertyRowModel[];
  search?: string;
  status: StatusFilter;
  type: TypeFilter;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Properties</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every serviced address, its customer, its access notes and the work open there.</p>
          </div>
          <Button disabled className="min-h-11 rounded-xl px-4 font-bold" title="Property creation needs a real route before this can write.">
            <Plus className="h-4 w-4" /> New property
          </Button>
        </div>
        <form action="/properties" className="relative">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="type" value={type} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by property, address, or customer..."
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
        <FilterNav baseHref="/properties" name="status" active={status} search={search} other={{ type }} rows={rows} filters={STATUS_FILTERS} />
        <FilterNav baseHref="/properties" name="type" active={type} search={search} other={{ status }} rows={rows} filters={TYPE_FILTERS} />
      </header>
      {children}
    </main>
  );
}

function FilterNav<T extends string>({
  active,
  baseHref,
  filters,
  name,
  other,
  rows,
  search,
}: {
  active: T;
  baseHref: string;
  filters: Array<{ label: string; value: T }>;
  name: string;
  other: Record<string, string>;
  rows: PropertyRowModel[];
  search?: string;
}) {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={`Property ${name} filters`}>
      {filters.map((filter) => {
        const count =
          name === 'status'
            ? filter.value === 'all'
              ? rows.length
              : rows.filter((row) => row.status === filter.value).length
            : filter.value === 'all'
              ? rows.length
              : rows.filter((row) => row.type === filter.value).length;
        const params = new URLSearchParams({ ...other, [name]: filter.value });
        if (search) params.set('q', search);
        return (
          <Link
            key={filter.value}
            href={`${baseHref}?${params.toString()}`}
            className={[
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition',
              active === filter.value ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            {filter.label}
            <span className={active === filter.value ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>{count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface PropertyWorkRow {
  property_id: string | null;
  status: string;
}

interface PropertyJobRow extends PropertyWorkRow {
  scheduled_start: string | null;
  title: string;
}

function toPropertyRow(item: PropertyListItem, requests: PropertyWorkRow[], jobs: PropertyJobRow[]): PropertyRowModel {
  const propertyId = item.property.id;
  const propertyRequests = requests.filter((row) => row.property_id === propertyId);
  const propertyJobs = jobs.filter((row) => row.property_id === propertyId);
  const openRequests = propertyRequests.filter((row) => !['completed', 'cancelled', 'spam', 'estimate_created'].includes(row.status)).length;
  const activeJobs = propertyJobs.filter((row) => !['completed', 'invoiced', 'paid', 'cancelled'].includes(row.status)).length;
  const nextJob = propertyJobs
    .filter((row) => row.scheduled_start && new Date(row.scheduled_start).getTime() >= Date.now())
    .sort((left, right) => new Date(left.scheduled_start!).getTime() - new Date(right.scheduled_start!).getTime())[0];
  const type = item.property.property_type?.toLowerCase().includes('commercial') ? 'commercial' : 'residential';
  const status = item.customerCount === 0 ? 'inactive' : item.property.jobber_id ? 'active' : 'onboarding';

  return {
    activeJobs,
    attentionLabel: item.property.access_notes ? item.property.access_notes : item.property.gate_code ? 'Gate or access note on file' : null,
    customerId: item.customers[0]?.id ?? null,
    customerName: item.customers[0]?.displayName ?? 'No customer',
    item,
    nextVisitLabel: nextJob ? `${formatShortDate(nextJob.scheduled_start!)} · ${nextJob.title}` : 'Not scheduled',
    openRequests,
    status,
    type,
    updatedLabel: relativeTime(item.property.updated_at),
  };
}

function matchesProperty(row: PropertyRowModel, search: string | undefined, status: StatusFilter, type: TypeFilter): boolean {
  if (status !== 'all' && row.status !== status) return false;
  if (type !== 'all' && row.type !== type) return false;
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [row.item.property.address_line_1, row.item.property.city, row.item.property.state, row.item.property.zip, row.customerName]
    .some((value) => value.toLowerCase().includes(normalized));
}

function PropertyStatus({ status }: { status: Exclude<StatusFilter, 'all'> }) {
  if (status === 'active') return <ForgeStatusPill tone="emerald">Active</ForgeStatusPill>;
  if (status === 'onboarding') return <ForgeStatusPill tone="blue">Onboarding</ForgeStatusPill>;
  return <ForgeStatusPill tone="neutral">Inactive</ForgeStatusPill>;
}

function formatAddress(property: { address_line_1: string; city: string; state: string; zip: string }) {
  return `${property.city}, ${property.state} ${property.zip}`;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function readStatusParam(value: string | string[] | undefined): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.some((filter) => filter.value === raw) ? (raw as StatusFilter) : 'all';
}

function readTypeParam(value: string | string[] | undefined): TypeFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return TYPE_FILTERS.some((filter) => filter.value === raw) ? (raw as TypeFilter) : 'all';
}
