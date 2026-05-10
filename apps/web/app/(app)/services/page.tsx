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

      {items.length === 0 ? (
        <EmptyState
          activity={activity}
          categoryId={categoryId}
          confidence={confidence}
          search={search}
        />
      ) : (
        <div className="space-y-5">
          {groupedItems.map((group) => (
            <section key={group.category.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {group.category.name}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {group.items.length} {group.items.length === 1 ? 'service' : 'services'}
                </span>
              </div>

              <ul className="space-y-3">
                {group.items.map(({ item }) => (
                  <li key={item.id} className="rounded-md border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-medium text-foreground">
                            {item.name}
                          </p>
                          <ConfidenceBadge confidence={item.confidence} />
                          {item.is_active === false ? <ArchivedBadge /> : null}
                          {item.is_custom_only ? <CustomOnlyBadge /> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatPricingSummary(item)}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{formatUsageSummary(item)}</p>
                        <p>{formatLaborAndMarkup(item)}</p>
                      </div>
                    </div>

                    {item.description?.trim() ? (
                      <p className="mt-3 text-sm text-foreground">
                        {item.description.trim()}
                      </p>
                    ) : null}

                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <DetailLine
                        label="Includes"
                        value={item.scope_includes?.trim() || 'Not set'}
                      />
                      <DetailLine
                        label="Excludes"
                        value={item.scope_excludes?.trim() || 'Not set'}
                      />
                      <DetailLine
                        label="Common addons"
                        value={item.common_addons?.trim() || 'Not set'}
                      />
                      <DetailLine
                        label="Exclusion note"
                        value={item.exclusion_note?.trim() || 'Not set'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
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

function ConfidenceBadge({
  confidence,
}: {
  confidence: ServiceCatalogConfidence | string | null;
}) {
  const value = confidence ?? 'unconfirmed';
  const classes =
    value === 'high'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'medium'
        ? 'bg-blue-50 text-blue-700'
        : value === 'low'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-700';

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function ArchivedBadge() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Archived
    </span>
  );
}

function CustomOnlyBadge() {
  return (
    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
      Custom only
    </span>
  );
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}:</span> {value}
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

function formatPricingSummary(item: ServiceCatalogItemSummary['item']) {
  const rateSummary = formatRateSummary(item);
  const metric = item.pricing_metric ? formatEnumLabel(item.pricing_metric) : 'No metric';
  const unit = item.unit_label?.trim() || item.unit;

  return [rateSummary, metric, unit].filter(Boolean).join(' · ');
}

function formatRateSummary(item: ServiceCatalogItemSummary['item']) {
  if (item.rate_confirmed !== null) {
    return `Confirmed ${formatMoney(item.rate_confirmed)}`;
  }

  if (item.rate_low !== null || item.rate_high !== null) {
    return `${formatMoney(item.rate_low)} – ${formatMoney(item.rate_high)}`;
  }

  if (item.default_unit_price !== null) {
    return `Default ${formatMoney(item.default_unit_price)}`;
  }

  return 'Custom quote';
}

function formatUsageSummary(item: ServiceCatalogItemSummary['item']) {
  const quoted = item.times_quoted ?? 0;
  const won = item.times_won ?? 0;
  const winRate =
    quoted > 0 ? `${Math.round((won / quoted) * 100)}% win rate` : 'No usage yet';

  return `${quoted} quoted · ${won} won · ${winRate}`;
}

function formatLaborAndMarkup(item: ServiceCatalogItemSummary['item']) {
  const labor =
    item.default_labor_minutes !== null
      ? `${item.default_labor_minutes} min labor`
      : 'No labor estimate';
  const markup =
    item.default_markup_pct !== null
      ? `${item.default_markup_pct}% markup`
      : 'No markup default';

  return `${labor} · ${markup}`;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
