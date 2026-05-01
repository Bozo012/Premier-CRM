import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getCustomer360, type Customer } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

import { ArchetypeBadge } from '../_components/archetype-badge';

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { customerId } = await params;

  if (!isUuid(customerId)) {
    notFound();
  }

  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/customers/${customerId}`)}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell>
        <ErrorPanel>
          Could not load your organization membership: {membershipError.message}
        </ErrorPanel>
      </PageShell>
    );
  }

  if (!membership?.org_id) {
    return (
      <PageShell>
        <WarningPanel>
          You don&apos;t have an active organization membership yet. Ask the
          owner to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await getCustomer360(supabase, {
    customerId,
    orgId: membership.org_id,
  });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <PageShell>
        <ErrorPanel>Failed to load customer: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { customer, properties, recentJobs, openQuotes, unpaidInvoices, stats } =
    result.data;

  return (
    <PageShell>
      <header className="space-y-4">
        <div className="space-y-2">
          <Link
            href="/customers"
            className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to customers
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {resolveDisplayName(customer)}
            </h1>
            <ArchetypeBadge archetype={customer.archetype} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total revenue"
            value={formatMoney(stats.total_revenue)}
            helper={formatJobsCount(stats.total_jobs)}
          />
          <StatCard
            label="Last contact"
            value={formatDate(stats.last_contact_at)}
            helper={customer.preferred_channel ?? 'No preferred channel'}
          />
          <StatCard
            label="Last completed job"
            value={formatDate(stats.last_job_completed_at)}
            helper={formatMoney(recentJobs[0]?.total ?? null)}
          />
          <StatCard
            label="Outstanding invoices"
            value={String(unpaidInvoices.length)}
            helper={formatMoney(sumInvoices(unpaidInvoices))}
          />
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Primary phone" value={customer.phone_primary} />
            <DetailRow label="Secondary phone" value={customer.phone_secondary} />
            <DetailRow label="Email" value={customer.email} />
            <DetailRow label="Company" value={customer.company_name} />
            <DetailRow
              label="Payment terms"
              value={formatPaymentTerms(customer.payment_terms_days)}
            />
            <DetailRow label="Source" value={customer.source} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{customer.notes?.trim() || 'No customer notes yet.'}</p>
            <DetailRow
              label="Standing approval"
              value={formatMoney(customer.standing_approval_threshold)}
            />
            <DetailRow
              label="Monthly invoices"
              value={customer.consolidate_invoices_monthly ? 'Enabled' : 'Off'}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ListCard
          title="Properties"
          emptyMessage="No linked properties yet."
          items={properties.map((property) => ({
            href: `/properties/${property.id}`,
            id: property.id,
            title: formatAddress(property),
            subtitle: [
              property.property_type,
              formatGeofence(property.geofence_radius_m),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <ListCard
          title="Recent jobs"
          emptyMessage="No jobs yet for this customer."
          items={recentJobs.map((job) => ({
            id: job.id,
            title: job.title,
            subtitle: [
              formatStatus(job.status),
              formatDate(job.scheduled_start),
              formatMoney(job.total),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <ListCard
          title="Open quotes"
          emptyMessage="No open quotes right now."
          items={openQuotes.map((quote) => ({
            id: quote.id,
            title: quote.job_title || 'Untitled quote',
            subtitle: [formatMoney(quote.total), formatDate(quote.sent_at)]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
      </section>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      {children}
    </main>
  );
}

function StatCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value?.trim() || 'Not set'}</p>
    </div>
  );
}

function ListCard({
  emptyMessage,
  items,
  title,
}: {
  emptyMessage: string;
  items: Array<{ href?: string; id: string; subtitle: string; title: string }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border p-3">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="font-medium text-foreground">{item.title}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {item.subtitle || 'No additional details'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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

function resolveDisplayName(customer: Customer): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Unnamed customer';
}

function formatAddress(property: {
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
}) {
  return `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`;
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatStatus(value: string): string {
  return value
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatJobsCount(value: number | null | undefined): string {
  if (!value) {
    return 'No completed jobs yet';
  }

  return value === 1 ? '1 job on record' : `${value} jobs on record`;
}

function formatPaymentTerms(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return value === 0 ? 'Due on receipt' : `Net ${value}`;
}

function formatGeofence(value: number | null | undefined): string {
  if (!value) {
    return '';
  }

  return `${Math.round(value)}m geofence`;
}

function sumInvoices(
  invoices: Array<{ amount_due: number | null }>
): number | null {
  const values = invoices
    .map((invoice) => invoice.amount_due)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
