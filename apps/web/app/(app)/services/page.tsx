import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Search } from 'lucide-react';

import { getActiveOrgContext, listServiceCatalogItems, type ServiceCatalogCategorySummary, type ServiceCatalogItemSummary } from '@premier/db';

import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { ForgeStatusPill } from '@/components/forge/presentation';
import { getServerSupabase } from '@/lib/supabase-server';

import { ServiceCategoryManager } from './_components/service-category-manager';
import { ServiceItemManager } from './_components/service-item-manager';

export const metadata: Metadata = { title: 'Service Catalog' };

type CatalogStatus = 'all' | 'active' | 'inactive' | 'confirmed' | 'guided' | 'unconfirmed';

interface ServicesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_FILTERS: Array<{ label: string; value: CatalogStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Guided', value: 'guided' },
  { label: 'Unconfirmed', value: 'unconfirmed' },
];

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const categoryId = readUuidParam(params.category);
  const status = readStatusParam(params.status);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/services');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <PageShell categories={[]} items={[]} search={search} categoryId={categoryId} status={status}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }

  const result = await listServiceCatalogItems(supabase, {
    activity: 'all',
    limit: 250,
    offset: 0,
    orgId: orgContextResult.data.orgId,
  });

  if (!result.success) {
    return (
      <PageShell categories={[]} items={[]} search={search} categoryId={categoryId} status={status}>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Failed to load services: {result.error}</p>
      </PageShell>
    );
  }

  const visibleItems = result.data.items.filter((item) => matchesServiceItem(item, search, categoryId, status));
  const groupedItems = groupItemsByCategory(result.data.items);

  return (
    <PageShell categories={result.data.categories} items={result.data.items} search={search} categoryId={categoryId} status={status}>
      {visibleItems.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-xl border bg-card px-4 text-center">
          <div>
            <h2 className="text-lg font-bold">No services found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleItems.map((itemSummary) => (
            <ServiceCard key={itemSummary.item.id} itemSummary={itemSummary} />
          ))}
        </div>
      )}

      <details id="manage-service-catalog" className="rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-bold">Manage catalog data</summary>
        <div className="mt-5 space-y-8">
          <ServiceCategoryManager categories={result.data.categories} />
          <ServiceItemManager categories={result.data.categories} groupedItems={groupedItems} />
        </div>
      </details>
    </PageShell>
  );
}

function PageShell({
  categoryId,
  categories,
  children,
  items,
  search,
  status,
}: {
  categoryId?: string;
  categories: ServiceCatalogCategorySummary[];
  children: React.ReactNode;
  items: ServiceCatalogItemSummary[];
  search?: string;
  status: CatalogStatus;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Service Catalog</h1>
          <Button asChild className="min-h-11 rounded-xl px-4 font-bold">
            <Link href="/services#manage-service-catalog"><Plus className="h-4 w-4" /> Add service</Link>
          </Button>
        </div>
        <form action="/services" className="relative">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="category" value={categoryId ?? ''} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by service name, category..."
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Service status filters">
          {STATUS_FILTERS.map((filter) => {
            const count = filter.value === 'all' ? items.length : items.filter((item) => matchesCatalogStatus(item, filter.value)).length;
            return (
              <Link
                key={filter.value}
                href={`/services?status=${filter.value}${categoryId ? `&category=${categoryId}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
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
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Service category filters">
          <CategoryLink active={!categoryId} href={`/services?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ''}`} label="All categories" />
          {categories.map((category) => (
            <CategoryLink
              key={category.id}
              active={category.id === categoryId}
              href={`/services?status=${status}&category=${category.id}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
              label={`${category.name} ${category.itemCount}`}
            />
          ))}
        </nav>
      </header>
      {children}
    </main>
  );
}

function CategoryLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={[
        'inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-xs font-bold transition',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

function ServiceCard({ itemSummary }: { itemSummary: ServiceCatalogItemSummary }) {
  const item = itemSummary.item;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-card-foreground">{item.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {[itemSummary.category?.name, pricingMetricLabel(item.pricing_metric), item.unit_label ?? item.unit].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.rate_confirmed !== null ? <ForgeStatusPill tone="emerald">Confirmed rate</ForgeStatusPill> : null}
          {item.rate_confirmed === null && item.confidence !== 'unconfirmed' ? <ForgeStatusPill tone="amber">Pricing guidance</ForgeStatusPill> : null}
          {item.confidence === 'unconfirmed' ? <ForgeStatusPill tone="neutral">Unconfirmed</ForgeStatusPill> : null}
          {item.is_active === false ? <ForgeStatusPill tone="neutral">Inactive</ForgeStatusPill> : null}
        </div>
      </div>
      <p className="mt-3 text-sm font-bold text-primary">{formatPrimaryPrice(item.rate_confirmed ?? item.default_unit_price)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{formatPriceRange(item.rate_low, item.rate_high)}</p>
      {item.description ? <p className="mt-2 text-sm text-card-foreground">{item.description}</p> : null}
    </article>
  );
}

function matchesServiceItem(itemSummary: ServiceCatalogItemSummary, search: string | undefined, categoryId: string | undefined, status: CatalogStatus): boolean {
  const item = itemSummary.item;
  if (categoryId && item.category_id !== categoryId) return false;
  if (!matchesCatalogStatus(itemSummary, status)) return false;
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [item.name, item.description ?? '', itemSummary.category?.name ?? '', item.scope_includes ?? '', item.scope_excludes ?? ''].some((value) =>
    value.toLowerCase().includes(normalized)
  );
}

function matchesCatalogStatus(itemSummary: ServiceCatalogItemSummary, status: CatalogStatus): boolean {
  const item = itemSummary.item;
  if (status === 'all') return true;
  if (status === 'active') return item.is_active !== false;
  if (status === 'inactive') return item.is_active === false;
  if (status === 'confirmed') return item.rate_confirmed !== null;
  if (status === 'guided') return item.rate_confirmed === null && item.confidence !== 'unconfirmed';
  return item.confidence === 'unconfirmed';
}

function groupItemsByCategory(items: ServiceCatalogItemSummary[]) {
  const groups = new Map<string, { category: { id: string; name: string }; items: ServiceCatalogItemSummary[] }>();
  for (const item of items) {
    const category = item.category ?? { id: 'uncategorized', name: 'Uncategorized' };
    const existing = groups.get(category.id) ?? { category: { id: category.id, name: category.name }, items: [] };
    existing.items.push(item);
    groups.set(category.id, existing);
  }
  return Array.from(groups.values());
}

function formatPrimaryPrice(value: number | null): string {
  if (value === null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatPriceRange(low: number | null, high: number | null): string {
  if (low === null && high === null) return 'No rate range set';
  if (low !== null && high !== null) return `${formatPrimaryPrice(low)}–${formatPrimaryPrice(high)}`;
  return formatPrimaryPrice(low ?? high);
}

function pricingMetricLabel(value: string | null): string | null {
  if (!value) return null;
  return value.replace('per_', 'per ').replaceAll('_', ' ');
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readUuidParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : undefined;
}

function readStatusParam(value: string | string[] | undefined): CatalogStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.some((filter) => filter.value === raw) ? (raw as CatalogStatus) : 'all';
}
