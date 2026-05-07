import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listCustomers, type Customer } from '@premier/db';
import { CustomerArchetypeSchema } from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

import { ArchetypeBadge } from './_components/archetype-badge';
import { CustomerSearchInput } from './_components/customer-search-input';

interface CustomersPageProps {
  // Next 15 App Router: searchParams arrives as a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Customer list page. Server component — runs server-side using the
 * cookie-bound Supabase client so RLS enforces org isolation per session.
 *
 * Reads `q` (free-text search) and `archetype` from URL search params.
 * Both are validated and silently ignored if invalid; the page never
 * 500s on bad URL params.
 */
export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const archetype = readArchetypeParam(params.archetype);

  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/customers');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell>
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load your organization membership: {membershipError.message}
        </p>
      </PageShell>
    );
  }

  if (!membership?.org_id) {
    return (
      <PageShell>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You don&apos;t have an active organization membership yet. Ask the
          owner to approve your account, or contact Kevin.
        </p>
      </PageShell>
    );
  }

  const result = await listCustomers(supabase, {
    orgId: membership.org_id,
    search,
    archetype,
    limit: 50,
    offset: 0,
  });

  if (!result.success) {
    return (
      <PageShell search={search}>
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load customers: {result.error}
        </p>
      </PageShell>
    );
  }

  const { customers, total } = result.data;

  return (
    <PageShell search={search}>
      <p className="text-sm text-muted-foreground">
        {formatTotal(total, search)}
      </p>

      {customers.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {customers.map((customer) => (
            <CustomerRow key={customer.id} customer={customer} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

/**
 * Shared layout for every state of this page (data, error, empty).
 * Keeps the heading + search input visible regardless of outcome so the
 * user can adjust their query without losing place.
 */
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Customers
        </h1>
        <CustomerSearchInput defaultValue={search} />
      </header>
      {children}
    </main>
  );
}

function CustomerRow({ customer }: { customer: Customer }) {
  const displayName = resolveDisplayName(customer);
  const subtitle = resolveSubtitle(customer);

  return (
    <li>
      <Link
        href={`/customers/${customer.id}`}
        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-medium text-foreground">
              {displayName}
            </span>
            <ArchetypeBadge archetype={customer.archetype} />
          </div>
          {subtitle ? (
            <p className="truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ search }: { search?: string }) {
  if (search) {
    return (
      <div className="rounded-md border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No customers match &ldquo;{search}&rdquo;.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-background px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        No customers yet. Import from Jobber or add your first customer.
      </p>
    </div>
  );
}

/**
 * Pull a single string from a search-param value (which may be a string,
 * an array of strings, or undefined per Next's type). Empty/whitespace
 * collapses to undefined.
 */
function readStringParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200
    ? trimmed
    : undefined;
}

/**
 * Validate the `archetype` URL param against the Zod enum. Invalid values
 * (someone tampered with the URL, or an old bookmark with a removed
 * archetype) silently fall back to no filter.
 */
function readArchetypeParam(
  value: string | string[] | undefined
):
  | 'residential_one_off'
  | 'residential_repeat'
  | 'landlord_small'
  | 'landlord_growing'
  | 'property_manager'
  | 'commercial'
  | 'unknown'
  | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = CustomerArchetypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function resolveDisplayName(customer: Customer): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;
  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || 'Unnamed customer';
}

function resolveSubtitle(customer: Customer): string | null {
  const parts: string[] = [];
  if (customer.phone_primary) parts.push(customer.phone_primary);
  if (customer.email) parts.push(customer.email);
  return parts.length ? parts.join(' · ') : null;
}

function formatTotal(total: number, search?: string): string {
  if (total === 0) return search ? '' : 'No customers yet.';
  const noun = total === 1 ? 'customer' : 'customers';
  return search
    ? `${total} ${noun} matching your search`
    : `${total} ${noun}`;
}
