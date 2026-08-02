import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createServiceClient,
  getActiveOrgContext,
  getEstimateById,
  listEstimateLineItems,
  listQuotesForEstimate,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

import { AdvanceStatusButton } from '../_components/advance-status-button';
import { CreateQuoteButton } from '../_components/create-quote-button';
import { LineItemsSection } from '../_components/line-items-section';
import { PricingReviewPanel } from '../_components/pricing-review-panel';

interface EstimateDetailPageProps {
  params: Promise<{ estimateId: string }>;
}

export default async function EstimateDetailPage({ params }: EstimateDetailPageProps) {
  const { estimateId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/estimates/${estimateId}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/estimates');
  }

  const serviceClient = createServiceClient();
  const { orgId } = orgContextResult.data;

  const [result, quotesResult, lineItemsResult] = await Promise.all([
    getEstimateById(supabase, { estimateId, orgId }),
    listQuotesForEstimate(serviceClient, { estimateId, orgId }),
    listEstimateLineItems(serviceClient, { estimateId, orgId }),
  ]);

  if (!result.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
        <BackLink />
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error === 'NOT_FOUND'
            ? 'Estimate not found.'
            : `Failed to load estimate: ${result.error}`}
        </p>
      </main>
    );
  }

  const estimate = result.data;
  const quotes = quotesResult.success ? quotesResult.data : [];
  const lineItems = lineItemsResult.success ? lineItemsResult.data : [];

  const address = estimate.property
    ? `${estimate.property.addressLine1}, ${estimate.property.city}, ${estimate.property.state} ${estimate.property.zip}`
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <BackLink />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">
            {estimate.estimateNumber}
          </span>
          <StatusBadge status={estimate.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {estimate.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Created {formatDate(estimate.createdAt)}
          {estimate.createdByName ? ` by ${estimate.createdByName}` : ''}
        </p>
      </header>

      <AdvanceStatusButton estimateId={estimate.id} currentStatus={estimate.status} />

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Customer">
          {estimate.customer ? (
            <Link
              href={`/customers/${estimate.customer.id}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {estimate.customer.displayName}
            </Link>
          ) : (
            <span className="text-muted-foreground">No customer linked</span>
          )}
          {estimate.customer?.email ? (
            <p className="text-sm text-muted-foreground">{estimate.customer.email}</p>
          ) : null}
          {estimate.customer?.phonePrimary ? (
            <p className="text-sm text-muted-foreground">{estimate.customer.phonePrimary}</p>
          ) : null}
        </InfoCard>

        <InfoCard label="Property">
          {address ? (
            <p className="font-medium">{address}</p>
          ) : (
            <span className="text-muted-foreground">No property linked</span>
          )}
        </InfoCard>

        {estimate.description ? (
          <InfoCard label="Description">
            <p className="whitespace-pre-wrap text-sm">{estimate.description}</p>
          </InfoCard>
        ) : null}

        {estimate.siteVisitAt ? (
          <InfoCard label="Site visit">
            <p className="font-medium">{formatDate(estimate.siteVisitAt)}</p>
            {estimate.siteVisitNotes ? (
              <p className="mt-1 text-sm text-muted-foreground">{estimate.siteVisitNotes}</p>
            ) : null}
          </InfoCard>
        ) : null}

        {estimate.serviceRequestId ? (
          <InfoCard label="Source request">
            <Link
              href={`/requests/${estimate.serviceRequestId}`}
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              View original request
            </Link>
          </InfoCard>
        ) : null}

        {estimate.convertedJobId ? (
          <InfoCard label="Converted job">
            <Link
              href={`/jobs/${estimate.convertedJobId}`}
              className="text-sm font-medium text-green-700 underline-offset-2 hover:underline"
            >
              View job
            </Link>
            {estimate.convertedAt ? (
              <p className="text-sm text-muted-foreground">
                Converted {formatDate(estimate.convertedAt)}
              </p>
            ) : null}
          </InfoCard>
        ) : null}
      </div>

      <LineItemsSection
        estimateId={estimate.id}
        lineItems={lineItems}
        locked={!!estimate.pricingReviewedAt}
      />

      {estimate.sourceSiteVisitId ? (
        <PricingReviewPanel estimateId={estimate.id} pricingReviewedAt={estimate.pricingReviewedAt} />
      ) : null}

      {/* Quotes section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quotes</h2>
          {!estimate.sourceSiteVisitId &&
          estimate.status !== 'converted' &&
          estimate.status !== 'declined' &&
          estimate.status !== 'expired' ? (
            <CreateQuoteButton
              estimateId={estimate.id}
              estimateTitle={estimate.title}
            />
          ) : null}
        </div>

        {quotes.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            No quotes yet. Use &ldquo;Create quote&rdquo; above to build the first one.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/quotes/${q.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {q.title?.trim() || q.quoteNumber || 'Untitled quote'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.quoteNumber ? `${q.quoteNumber} · ` : ''}
                      Created {formatDate(q.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {q.total !== null ? (
                      <span className="text-sm font-medium text-foreground">
                        {formatMoney(q.total)}
                      </span>
                    ) : null}
                    <QuoteStatusBadge status={q.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/estimates"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      ← Estimates
    </Link>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-md border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    site_visit_scheduled: 'bg-blue-50 text-blue-700',
    site_visit_complete: 'bg-indigo-50 text-indigo-700',
    quoted: 'bg-purple-50 text-purple-700',
    accepted: 'bg-green-50 text-green-700',
    declined: 'bg-red-50 text-red-700',
    expired: 'bg-slate-100 text-slate-500',
    converted: 'bg-emerald-50 text-emerald-700',
  };
  const color = colorMap[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')}
    </span>
  );
}

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-violet-50 text-violet-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-700',
  expired: 'bg-orange-50 text-orange-700',
  revised: 'bg-blue-50 text-blue-700',
};

function QuoteStatusBadge({ status }: { status: string }) {
  const colorClass = QUOTE_STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')}
    </span>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}
