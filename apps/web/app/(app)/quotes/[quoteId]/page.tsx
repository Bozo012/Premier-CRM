import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  getQuoteById,
  listCatalogItemsForPicker,
  createServiceClient,
  type QuoteLineItemSummary,
} from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

import { ApproveJobButton } from '../_components/approve-job-button';
import { LineItemEditor } from '../_components/line-item-editor';
import { QuoteMetadataForm } from '../_components/quote-metadata-form';
import { ResendQuoteEmailButton } from '../_components/resend-quote-email-button';
import { SendQuoteButton } from '../_components/send-quote-button';

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

  const serviceClient = createServiceClient();

  const [result, catalogResult] = await Promise.all([
    getQuoteById(supabase, {
      orgId: membership.org_id,
      quoteId,
    }),
    listCatalogItemsForPicker(serviceClient, { orgId: membership.org_id }),
  ]);

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
  // Catalog items are non-critical — fall back to empty list on error so the
  // page still loads; manual entry remains available.
  const catalogItems = catalogResult.success ? catalogResult.data : [];

  return (
    <PageShell>
      <header className="space-y-4">
        <div className="space-y-2">
          {job ? (
            <Link
              href={`/jobs/${job.job.id}`}
              className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to job
            </Link>
          ) : quote.estimate_id ? (
            <Link
              href={`/estimates/${quote.estimate_id}`}
              className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to estimate
            </Link>
          ) : (
            <Link
              href="/quotes"
              className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to quotes
            </Link>
          )}
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
              job?.job.job_number || null,
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
          helper={lineItems.length === 0 ? 'Use the editor below to add' : `Total ${formatMoney(quote.subtotal)}`}
        />
        <InfoCard
          label="Valid until"
          value={quote.valid_until ? formatDate(quote.valid_until) : 'Not set'}
          helper={`Created ${formatDateTime(quote.created_at)}`}
        />
        {job ? (
          <InfoCard
            label="Linked job"
            value={job.job.title.trim() || job.job.job_number || 'Untitled job'}
            helper={formatEnumLabel(job.job.status)}
            href={`/jobs/${job.job.id}`}
          />
        ) : quote.estimate_id ? (
          <InfoCard
            label="Linked estimate"
            value="View estimate"
            helper="Quote created from estimate"
            href={`/estimates/${quote.estimate_id}`}
          />
        ) : null}
      </section>

      {quote.status === 'draft' ? (
        <section>
          <QuoteMetadataForm
            quoteId={quote.id}
            currentTitle={quote.title}
            currentValidUntil={quote.valid_until}
            currentDiscountAmount={quote.discount_amount}
            currentTaxPct={quote.tax_pct}
            currentIntroText={quote.intro_text}
            currentOutroText={quote.outro_text}
          />
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Status" value={formatEnumLabel(quote.status)} />
              <DetailRow label="Type" value={formatEnumLabel(quote.type)} />
              {job ? (
                <>
                  <DetailRow label="Service category" value={job.category?.name || 'Not set'} />
                  <DetailRow label="Job priority" value={formatEnumLabel(job.job.priority)} />
                  <DetailRow
                    label="Scheduled window"
                    value={formatScheduledWindow(
                      job.job.scheduled_start,
                      job.job.scheduled_end
                    )}
                  />
                </>
              ) : null}
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
      )}

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
            {quote.status === 'draft' ? (
              <LineItemEditor
                catalogItems={catalogItems}
                lineItems={lineItems}
                quoteId={quote.id}
              />
            ) : (
              <>
                {lineItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No line items.</p>
                ) : (
                  <ul className="space-y-3">
                    {lineItems.map((lineItem) => (
                      <LineItemCard key={lineItem.item.id} lineItem={lineItem} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              {quote.status === 'draft' ? 'Send quote' : 'Customer timeline'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quote.status === 'draft' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Marking as sent transitions the quote to{' '}
                  <span className="font-medium text-foreground">Sent</span> and
                  generates a shareable customer link.
                </p>
                <SendQuoteButton quoteId={quote.id} status={quote.status} />
              </>
            ) : (
              <div className="space-y-4">
                <QuoteLifecycleTimeline quote={quote} />
                {(quote.status === 'sent' || quote.status === 'viewed') &&
                customer?.email ? (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Resend to {customer.email}
                    </p>
                    <ResendQuoteEmailButton quoteId={quote.id} />
                  </div>
                ) : null}
                {quote.status === 'accepted' && job ? (
                  <div className="border-t pt-3 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The customer accepted this quote. Mark the linked job as{' '}
                      <span className="font-medium text-foreground">Approved</span>{' '}
                      to begin scheduling.
                    </p>
                    <ApproveJobButton quoteId={quote.id} />
                    <Link
                      href={`/jobs/${job.job.id}`}
                      className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Open job →
                    </Link>
                  </div>
                ) : quote.status === 'accepted' && !job ? (
                  <div className="border-t pt-3">
                    <p className="text-sm text-muted-foreground">
                      The customer accepted this quote. Job creation from estimate is coming soon.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        <FutureSectionCard
          title="PDF"
          description="PDF generation will attach once the send flow is proven in production."
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

function QuoteLifecycleTimeline({ quote }: { quote: { sent_at: string | null; viewed_at: string | null; accepted_at: string | null; declined_at: string | null; decline_reason: string | null; share_token: string | null; status: string } }) {
  const declined = quote.status === 'declined';
  const accepted = quote.status === 'accepted';
  const awaitingResponse = quote.status === 'sent' || quote.status === 'viewed';

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        <LifecycleEvent
          label="Sent"
          timestamp={quote.sent_at}
          emptyText="Not recorded"
          dotColor="bg-violet-400"
        />
        <LifecycleEvent
          label="Viewed"
          timestamp={quote.viewed_at}
          emptyText="Not yet opened"
          dotColor="bg-indigo-400"
        />
        {accepted ? (
          <LifecycleEvent
            label="Accepted"
            timestamp={quote.accepted_at}
            emptyText="—"
            dotColor="bg-green-500"
            highlight="green"
          />
        ) : declined ? (
          <>
            <LifecycleEvent
              label="Declined"
              timestamp={quote.declined_at}
              emptyText="—"
              dotColor="bg-red-500"
              highlight="red"
            />
            {quote.decline_reason?.trim() ? (
              <li className="pl-5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Reason: </span>
                {quote.decline_reason.trim()}
              </li>
            ) : null}
          </>
        ) : awaitingResponse ? (
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            <span className="text-sm text-muted-foreground">Awaiting customer response</span>
          </li>
        ) : null}
      </ol>

      {quote.share_token ? (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer link
          </p>
          <p className="break-all text-xs text-foreground">
            /q/{quote.share_token}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LifecycleEvent({
  dotColor,
  emptyText,
  highlight,
  label,
  timestamp,
}: {
  dotColor: string;
  emptyText: string;
  highlight?: 'green' | 'red';
  label: string;
  timestamp: string | null;
}) {
  const labelClass =
    highlight === 'green'
      ? 'text-green-700 font-medium'
      : highlight === 'red'
        ? 'text-red-700 font-medium'
        : 'text-foreground';

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${timestamp ? dotColor : 'bg-slate-200'}`} />
      <div className="min-w-0 flex-1">
        <span className={`text-sm ${labelClass}`}>{label}</span>
        {timestamp ? (
          <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(timestamp)}</span>
        ) : (
          <span className="ml-2 text-xs text-muted-foreground">{emptyText}</span>
        )}
      </div>
    </li>
  );
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-violet-50 text-violet-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-700',
  expired: 'bg-orange-50 text-orange-700',
  revised: 'bg-blue-50 text-blue-700',
};

function QuoteStatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_BADGE_COLORS[status] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
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
