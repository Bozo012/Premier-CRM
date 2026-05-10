import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  listServiceCatalogItems,
  type ServiceCatalogItemSummary,
} from '@premier/db';
import {
  ServiceCatalogActivitySchema,
  ServiceCatalogConfidenceSchema,
  type ServiceCatalogActivity,
  type ServiceCatalogConfidence,
} from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getServerSupabase } from '@/lib/supabase-server';

import { ServiceCategoryManager } from './_components/service-category-manager';
import { ServiceItemManager } from './_components/service-item-manager';

const CONFIDENCE_FILTERS: Array<{
  label: string;
  value?: ServiceCatalogConfidence;
}> = [
  { label: 'All confidence' },
  { label: 'Unconfirmed', value: 'unconfirmed' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
] as const;

const ACTIVITY_FILTERS: Array<{
  label: string;
  value: ServiceCatalogActivity;
}> = [
  { label: 'Active only', value: 'active' },
  { label: 'Inactive only', value: 'inactive' },
  { label: 'All services', value: 'all' },
] as const;

interface ServicesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const categoryId = readUuidParam(params.category);
  const confidence = readConfidenceParam(params.confidence);
  const activity = readActivityParam(params.activity) ?? 'active';

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/services');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell
        activity={activity}
        categoryId={categoryId}
        confidence={confidence}
        search={search}
        categories={[]}
      >
        <ErrorPanel>
          Could not load your organization membership: {membershipError.message}
        </ErrorPanel>
      </PageShell>
    );
  }

  if (!membership?.org_id) {
    return (
      <PageShell
        activity={activity}
        categoryId={categoryId}
        confidence={confidence}
        search={search}
        categories={[]}
      >
        <WarningPanel>
          You don&apos;t have an active organization membership yet. Ask the owner
          to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await listServiceCatalogItems(supabase, {
    activity,
    categoryId,
    confidence,
    limit: 250,
    offset: 0,
    orgId: membership.org_id,
    search,
  });

  if (!result.success) {
    return (
      <PageShell
        activity={activity}
        categoryId={categoryId}
        confidence={confidence}
        search={search}
        categories={[]}
      >
        <ErrorPanel>Failed to load services: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { categories, items, total } = result.data;
  const groupedItems = groupItemsByCategory(items);

  return (
    <PageShell
      activity={activity}
      categoryId={categoryId}
      confidence={confidence}
      search={search}
      categories={categories}
    >
      <p className="text-sm text-muted-foreground">
        {formatTotal(total, activity, search, categoryId, confidence)}
      </p>

      <ServiceCategoryManager categories={categories} />

      {items.length === 0 ? (
        <EmptyState
          activity={activity}
          categoryId={categoryId}
          confidence={confidence}
          search={search}
        />
      ) : null}

      <ServiceItemManager categories={categories} groupedItems={groupedItems} />
    </PageShell>
  );
}

function PageShell({
  activity,
  categories,
  categoryId,
  children,
  confidence,
  search = '',
}: {
  activity: ServiceCatalogActivity;
  categories: Array<{ id: string; name: string }>;
  categoryId?: string;
  children: React.ReactNode;
  confidence?: ServiceCatalogConfidence;
  search?: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Service catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse internal services, pricing confidence, and seeded rate ranges.
          </p>
        </div>

        <form action="/services" className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr),repeat(3,minmax(0,0.7fr)),auto]">
          <Input
            defaultValue={search}
            name="q"
            placeholder="Search by service, description, scope, or category..."
          />
          <select
            defaultValue={categoryId ?? ''}
            name="category"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            defaultValue={confidence ?? ''}
            name="confidence"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CONFIDENCE_FILTERS.map((filter) => (
              <option key={filter.label} value={filter.value ?? ''}>
                {filter.label}
              </option>
            ))}
          </select>
          <select
            defaultValue={activity}
            name="activity"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ACTIVITY_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </header>

      {children}
    </main>
  );
}

function EmptyState({
  activity,
  categoryId,
  confidence,
  search,
}: {
  activity: ServiceCatalogActivity;
  categoryId?: string;
  confidence?: ServiceCatalogConfidence;
  search?: string;
}) {
  if (search || categoryId || confidence || activity !== 'active') {
    return (
      <div className="space-y-3 rounded-md border bg-background px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No services match the current catalog filters.
        </p>
        <Button asChild variant="outline">
          <Link href="/services">Clear filters</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      No service catalog items yet. Seeded services or future catalog entries will show up here.
    </div>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

function WarningPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
      {children}
    </p>
  );
}

function readStringParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200
    ? trimmed
    : undefined;
}

function readUuidParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw
  )
    ? raw
    : undefined;
}

function readConfidenceParam(
  value: string | string[] | undefined
): ServiceCatalogConfidence | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = ServiceCatalogConfidenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function readActivityParam(
  value: string | string[] | undefined
): ServiceCatalogActivity | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = ServiceCatalogActivitySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function groupItemsByCategory(items: ServiceCatalogItemSummary[]) {
  const groups = new Map<
    string,
    { category: { id: string; name: string }; items: ServiceCatalogItemSummary[] }
  >();

  for (const item of items) {
    const category = item.category ?? {
      id: 'uncategorized',
      name: 'Uncategorized',
    };
    const existing = groups.get(category.id) ?? {
      category: { id: category.id, name: category.name },
      items: [],
    };
    existing.items.push(item);
    groups.set(category.id, existing);
  }

  return Array.from(groups.values());
}

function formatTotal(
  total: number,
  activity: ServiceCatalogActivity,
  search?: string,
  categoryId?: string,
  confidence?: ServiceCatalogConfidence
) {
  if (total === 0) {
    return search || categoryId || confidence || activity !== 'active'
      ? ''
      : 'No services yet.';
  }

  const noun = total === 1 ? 'service' : 'services';

  if (search || categoryId || confidence || activity !== 'active') {
    return `${total} ${noun} matching the current filters`;
  }

  return `${total} ${noun}`;
}
