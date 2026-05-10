import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getQuoteById, type QuoteLineItemSummary } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

interface QuoteDetailPageProps {
  params: Promise<{ quoteId: string }>;
}

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { quoteId } = await params;

  if (!isUuid(quoteId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/quotes/${quoteId}`)}`);
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
          You don&apos;t have an active organization membership yet. Ask the owner
          to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await getQuoteById(supabase, {
    orgId: membership.org_id,
    quoteId,
  });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <PageShell>
        <ErrorPanel>Failed to load quote: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { customer, job, lineItems, property, quote } = result.data;

  return (
    <PageShell>
      <header className="space-y-4">
        <div className="space-y-2">
          <Link
            href={`/jobs/${job.job.id}`}
            className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to job
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {quote.title?.trim() || quote.quote_number || 'Untitled quote'}
            </h1>
            <QuoteStatusBadge status={quote.status} />
            <QuoteTypeBadge type={quote.type} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              quote.quote_number || 'Draft number not assigned',
              customer?.displayName || 'Unknown customer',
              job.job.job_number || 'No job number',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          label="Quote total"
          value={formatMoney(quote.total)}
          helper={`Subtotal ${formatMoney(quote.subtotal)}`}
        />
        <InfoCard
          label="Line items"
          value={String(lineItems.length)}
          helper={
            lineItems.length === 0
              ? 'Add line items in the next builder slice'
              : 'Ready for quote builder expansion'
          }
        />
        <InfoCard
          label="Valid until"
          value={quote.valid_until ? formatDate(quote.valid_until) : 'Not set'}
          helper={`Created ${formatDateTime(quote.created_at)}`}
        />
        <InfoCard
          label="Linked job"
          value={job.job.title.trim() || job.job.job_number || 'Untitled job'}
          helper={formatEnumLabel(job.job.status)}
          href={`/jobs/${job.job.id}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Quote summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Status" value={formatEnumLabel(quote.status)} />
            <DetailRow label="Type" value={formatEnumLabel(quote.type)} />
            <DetailRow label="Service category" value={job.category?.name || 'Not set'} />
            <DetailRow label="Job priority" value={formatEnumLabel(job.job.priority)} />
            <DetailRow
              label="Scheduled window"
              value={formatScheduledWindow(
                job.job.scheduled_start,
                job.job.scheduled_end
              )}
            />
            <DetailRow
              label="Intro text"
              value={quote.intro_text?.trim() || 'No intro text yet'}
            />
            <DetailRow
              label="Outro text"
              value={quote.outro_text?.trim() || 'No outro text yet'}
            />
            <DetailRow label="Terms" value={quote.terms?.trim() || 'No terms yet'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Subtotal" value={formatMoney(quote.subtotal)} />
            <DetailRow
              label="Discount amount"
              value={formatMoney(quote.discount_amount)}
            />
            <DetailRow label="Tax rate" value={formatPercent(quote.tax_pct)} />
            <DetailRow label="Tax amount" value={formatMoney(quote.tax_amount)} />
            <DetailRow label="Total" value={formatMoney(quote.total)} />
            <DetailRow label="Updated" value={formatDateTime(quote.updated_at)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer context</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{customer.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    {customer.phonePrimary || 'No primary phone'}
                  </p>
                </div>
                <DetailRow label="Email" value={customer.email || 'Not set'} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This quote is missing visible customer context.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property context</CardTitle>
          </CardHeader>
          <CardContent>
            {property ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {formatPropertyAddress(property)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {property.propertyType || 'Property type not set'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This quote is missing visible property context.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No line items yet. The next quote-builder slice will add the line-item
                editor and service-catalog picker here.
              </p>
            ) : (
              <ul className="space-y-3">
                {lineItems.map((lineItem) => (
                  <LineItemCard key={lineItem.item.id} lineItem={lineItem} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FutureSectionCard
          title="Send & approval"
          description="Email delivery, magic-link viewing, and approval flow stay in later quote slices."
        />
        <FutureSectionCard
          title="PDF"
          description="PDF generation will attach once the builder structure and send flow are in place."
        />
        <FutureSectionCard
          title="Revisions"
          description="Versioning and revised-quote history will layer onto this route later."
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

function InfoCard({
  helper,
  href,
  label,
  value,
}: {
  helper: string;
  href?: string;
  label: string;
  value: string;
}) {
  const content = (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-base font-medium text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </>
  );

  if (!href) {
    return <Card>{content}</Card>;
  }

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <Link
        href={href}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function LineItemCard({ lineItem }: { lineItem: QuoteLineItemSummary }) {
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{lineItem.item.name}</p>
          <p className="text-sm text-muted-foreground">
            {[
              lineItem.service?.name || 'Manual line item',
              lineItem.phaseName,
              lineItem.item.unit,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <p className="text-sm font-medium text-foreground">
          {formatMoney(lineItem.item.total_quoted)}
        </p>
      </div>

      {lineItem.item.description?.trim() ? (
        <p className="mt-2 text-sm text-foreground">{lineItem.item.description.trim()}</p>
      ) : null}

      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
        <p>
          <span className="font-medium text-foreground">Qty:</span>{' '}
          {formatQuantity(lineItem.item.quantity)}
        </p>
        <p>
          <span className="font-medium text-foreground">Unit price:</span>{' '}
          {formatMoney(lineItem.item.unit_price)}
        </p>
        <p>
          <span className="font-medium text-foreground">Metric:</span>{' '}
          {lineItem.service?.pricingMetric
            ? formatEnumLabel(lineItem.service.pricingMetric)
            : 'Manual'}
        </p>
        <p>
          <span className="font-medium text-foreground">Markup:</span>{' '}
          {formatPercent(lineItem.item.markup_pct)}
        </p>
      </div>
    </li>
  );
}

function FutureSectionCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
      {formatEnumLabel(status)}
    </span>
  );
}

function QuoteTypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {formatEnumLabel(type)}
    </span>
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

function formatMoney(value: number | null) {
  if (value === null) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return 'Not set';
  }

  return `${value}%`;
}

function formatQuantity(value: number) {
  return Number(value).toString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatScheduledWindow(start: string | null, end: string | null) {
  if (!start && !end) {
    return 'Not scheduled';
  }

  if (start && end) {
    return `${formatDateTime(start)} → ${formatDateTime(end)}`;
  }

  return formatDateTime(start ?? end ?? '');
}

function formatPropertyAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [
    property.addressLine1,
    property.addressLine2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
