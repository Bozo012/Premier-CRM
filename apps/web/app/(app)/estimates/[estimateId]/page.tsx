import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createServiceClient,
  type EstimateStatus,
  getActiveOrgContext,
  getEstimateById,
  listEstimateLineItems,
  listQuotesForEstimate,
} from '@premier/db';
import { hasCapability, type OrgRole } from '@premier/shared';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { getServerSupabase } from '@/lib/supabase-server';

import { AdvanceStatusButton } from '../_components/advance-status-button';
import { CreateQuoteButton } from '../_components/create-quote-button';
import { LineItemsSection } from '../_components/line-items-section';
import { PricingReviewPanel } from '../_components/pricing-review-panel';
import { estimateStatusTone } from '../_lib/forge-estimate-view-model';

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
  const { orgId, role } = orgContextResult.data;
  const canApprovePricing = hasCapability(role as OrgRole, 'canApproveEstimatePricing');
  const canEditEstimate = hasCapability(role as OrgRole, 'canEditEstimate');

  const [result, quotesResult, lineItemsResult] = await Promise.all([
    getEstimateById(supabase, { estimateId, orgId }),
    listQuotesForEstimate(serviceClient, { estimateId, orgId }),
    listEstimateLineItems(serviceClient, { estimateId, orgId }),
  ]);

  if (!result.success) {
    return (
      <ForgePage className="max-w-6xl gap-5 md:gap-6">
        <BackLink />
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error === 'NOT_FOUND'
            ? 'Estimate not found.'
            : `Failed to load estimate: ${result.error}`}
        </p>
      </ForgePage>
    );
  }

  const estimate = result.data;
  const quotes = quotesResult.success ? quotesResult.data : [];
  const lineItems = lineItemsResult.success ? lineItemsResult.data : [];

  const address = estimate.property
    ? `${estimate.property.addressLine1}, ${estimate.property.city}, ${estimate.property.state} ${estimate.property.zip}`
    : null;

  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
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

      {estimate.sourceSiteVisitId ? (
        <ForgeCard className="text-sm">
          <p className="font-bold text-foreground">Generated from completed site visit</p>
          <Link
            href={`/site-visits/${estimate.sourceSiteVisitId}`}
            className="text-sm font-medium underline-offset-2 hover:underline"
          >
            View site visit
          </Link>
        </ForgeCard>
      ) : (
        <AdvanceStatusButton estimateId={estimate.id} currentStatus={estimate.status} />
      )}

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
        locked={!!estimate.pricingReviewedAt || estimate.pricingReviewStatus === 'pending_review'}
      />

      {estimate.isQuoteEligibilityGated ? (
        <PricingReviewPanel
          estimateId={estimate.id}
          pricingReviewedAt={estimate.pricingReviewedAt}
          pricingReviewStatus={estimate.pricingReviewStatus}
          pricingReviewRequestedAt={estimate.pricingReviewRequestedAt}
          pricingReviewRequestedByName={estimate.pricingReviewRequestedByName}
          pricingReviewChangesRequestedNote={estimate.pricingReviewChangesRequestedNote}
          canApprovePricing={canApprovePricing}
          canEditEstimate={canEditEstimate}
        />
      ) : null}

      {/* Quotes section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quotes</h2>
          {!estimate.isQuoteEligibilityGated &&
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
          <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            No quotes yet. Use &ldquo;Create quote&rdquo; above to build the first one.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
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
    </ForgePage>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackLink() {
  return <ForgeBackLink href="/estimates">Estimates</ForgeBackLink>;
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ForgeCard className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div>{children}</div>
    </ForgeCard>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <ForgeStatusPill tone={estimateStatusTone(status as EstimateStatus)}>{formatEnumLabel(status)}</ForgeStatusPill>;
}

function QuoteStatusBadge({ status }: { status: string }) {
  const tone = status === 'accepted' ? 'emerald' : status === 'declined' ? 'red' : status === 'sent' || status === 'viewed' ? 'blue' : 'neutral';
  return <ForgeStatusPill tone={tone}>{formatEnumLabel(status)}</ForgeStatusPill>;
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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
