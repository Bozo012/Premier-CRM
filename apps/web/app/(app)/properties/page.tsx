import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, listProperties } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Properties' };

interface PropertiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);

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
      <PageShell search={search}>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }
  const { orgId } = orgContextResult.data;

  const result = await listProperties(supabase, {
    limit: 100,
    offset: 0,
    orgId,
    search,
  });

  if (!result.success) {
    return (
      <PageShell search={search}>
        <ErrorPanel>Failed to load properties: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { properties, total } = result.data;

  return (
    <PageShell search={search}>
      <p className="text-sm text-muted-foreground">{formatTotal(total, search)}</p>

      {properties.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {properties.map((item) => (
            <li key={item.property.id}>
              <Link
                href={`/properties/${item.property.id}`}
                className="block space-y-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium text-foreground">
                    {formatAddress(item.property)}
                  </p>
                  {item.duplicateCount > 1 ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {item.duplicateCount} imported rows
                    </span>
                  ) : null}
                  {item.property.jobber_id ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Imported from Jobber
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[
                    item.property.property_type,
                    formatOwnerSummary(item.customers),
                    formatGeofence(item.property.geofence_radius_m),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({
  children,
  search = '',
}: {
  children: React.ReactNode;
  search?: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Properties
          </h1>
          <p className="text-sm text-muted-foreground">
            Review imported addresses, owners, and property memory.
          </p>
        </div>

        <form action="/properties" className="flex flex-col gap-2 sm:flex-row">
          <Input
            defaultValue={search}
            name="q"
            placeholder="Search by address, city, state, or zip..."
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </header>

      {children}
    </main>
  );
}

function EmptyState({ search }: { search?: string }) {
  if (search) {
    return (
      <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No properties match &ldquo;{search}&rdquo;.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      No properties yet.
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


function readStringParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200
    ? trimmed
    : undefined;
}

function formatAddress(property: {
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
}) {
  return `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`;
}

function formatGeofence(value: number | null | undefined) {
  if (!value) {
    return '';
  }

  return `${Math.round(value)}m geofence`;
}

function formatOwnerSummary(
  customers: Array<{ displayName: string; isPrimary: boolean | null }>
) {
  if (customers.length === 0) {
    return 'No linked owners';
  }

  const primary =
    customers.find((customer) => customer.isPrimary) ?? customers[0] ?? null;

  if (!primary) {
    return 'No linked owners';
  }

  const remainder = customers.length - 1;

  return remainder > 0
    ? `${primary.displayName} + ${remainder} more`
    : primary.displayName;
}

function formatTotal(total: number, search?: string): string {
  if (total === 0) return search ? '' : 'No properties yet.';
  const noun = total === 1 ? 'property' : 'properties';
  return search
    ? `${total} ${noun} matching your search`
    : `${total} ${noun}`;
}
