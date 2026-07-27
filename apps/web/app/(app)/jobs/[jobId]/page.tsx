import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  createServiceClient,
  getActiveOrgContext,
  getJobById,
  getJobInvoiceTotals,
  listInvoicesForJob,
  listQuotesForJob,
  type JobInvoiceSummary,
  type JobPhaseSummary,
  type JobQuoteSummary,
} from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { CreateDraftQuoteButton } from '../_components/create-draft-quote-button';
import { CreateInvoiceButton } from '../_components/create-invoice-button';

interface JobDetailPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;

  if (!isUuid(jobId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/jobs/${jobId}`)}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <PageShell>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </PageShell>
    );
  }
  const { orgId } = orgContextResult.data;

  const serviceClient = createServiceClient();

  const [result, quotesResult, sourceEstimateResult, invoicesResult, invoiceTotalsResult] =
    await Promise.all([
      getJobById(supabase, {
        jobId,
        orgId,
      }),
      listQuotesForJob(supabase, {
        jobId,
        orgId,
      }),
      serviceClient
        .from('estimates')
        .select('id, title, estimate_number')
        .eq('converted_job_id', jobId)
        .eq('org_id', orgId)
        .maybeSingle(),
      listInvoicesForJob(supabase, {
        jobId,
        orgId,
      }),
      getJobInvoiceTotals(supabase, {
        jobId,
        orgId,
      }),
    ]);

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <PageShell>
        <ErrorPanel>Failed to load job: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  if (!quotesResult.success) {
    return (
      <PageShell>
        <ErrorPanel>Failed to load job quotes: {quotesResult.error}</ErrorPanel>
      </PageShell>
    );
  }

  if (!invoicesResult.success) {
    return (
      <PageShell>
        <ErrorPanel>Failed to load job invoices: {invoicesResult.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { category, customer, job, phases, property } = result.data;
  const quotes = quotesResult.data;
  const sourceEstimate = sourceEstimateResult.data ?? null;
  const invoices = invoicesResult.data;
  // Live aggregate, not the stale jobs.invoiced_total/paid_total columns —
  // those have no maintaining trigger and would silently drift from reality.
  const invoiceTotals = invoiceTotalsResult.success ? invoiceTotalsResult.data : null;

  return (
    <PageShell>
      <header className="space-y-4">
        <Link
          href="/jobs"
          className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to jobs
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {job.title.trim() || job.job_number || 'Untitled job'}
            </h1>
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[job.job_number || 'No job number', category?.name || 'Uncategorized']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          label="Next scheduled"
          value={formatScheduledAt(job.scheduled_start ?? job.scheduled_end)}
          helper={
            job.estimated_duration_minutes
              ? `${job.estimated_duration_minutes} minute estimate`
              : 'No duration estimate yet'
          }
        />
        <InfoCard
          label="Customer"
          value={customer?.displayName || 'Unknown customer'}
          helper={customer ? 'Open linked customer record' : 'Customer link missing'}
          href={customer ? `/customers/${customer.id}` : undefined}
        />
        <InfoCard
          label="Property"
          value={property ? formatPropertyAddress(property) : 'Unknown property'}
          helper={property ? 'Open linked property record' : 'Property link missing'}
          href={property ? `/properties/${property.id}` : undefined}
        />
        <InfoCard
          label="Phases"
          value={String(phases.length)}
          helper={summarizePhaseState(phases)}
        />
        {sourceEstimate ? (
          <InfoCard
            label="Source estimate"
            value={sourceEstimate.title?.trim() || sourceEstimate.estimate_number || 'View estimate'}
            helper={sourceEstimate.estimate_number ?? 'Estimate'}
            href={`/estimates/${sourceEstimate.id}`}
          />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Core job info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Service category" value={category?.name || 'Not set'} />
            <DetailRow label="Status" value={formatEnumLabel(job.status)} />
            <DetailRow label="Priority" value={formatEnumLabel(job.priority)} />
            <DetailRow
              label="Scheduled window"
              value={formatScheduledWindow(job.scheduled_start, job.scheduled_end)}
            />
            <DetailRow
              label="Actual window"
              value={formatScheduledWindow(job.actual_start, job.actual_end)}
            />
            <DetailRow
              label="Description"
              value={job.description?.trim() || 'No description yet'}
            />
            <DetailRow
              label="AI summary"
              value={job.ai_summary?.trim() || 'No AI summary yet'}
            />
            <DetailRow label="Closed reason" value={job.closed_reason || 'Not closed'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule & financial snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Estimated duration"
              value={formatDuration(job.estimated_duration_minutes)}
            />
            <DetailRow label="Quoted total" value={formatMoney(job.quoted_total)} />
            <DetailRow
              label="Invoiced total"
              value={invoiceTotals ? formatMoney(invoiceTotals.invoicedTotal) : 'Not available'}
            />
            <DetailRow
              label="Paid total"
              value={invoiceTotals ? formatMoney(invoiceTotals.paidTotal) : 'Not available'}
            />
            <DetailRow
              label="Amount remaining"
              value={invoiceTotals ? formatMoney(invoiceTotals.amountDueTotal) : 'Not available'}
            />
            <DetailRow label="Cost total" value={formatMoney(job.cost_total)} />
            <DetailRow
              label="Closed at"
              value={job.closed_at ? formatScheduledAt(job.closed_at) : 'Not closed'}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Linked customer</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {customer.displayName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatPreferredChannel(customer.preferredChannel)}
                  </p>
                </div>
                <DetailRow label="Primary phone" value={customer.phonePrimary || 'Not set'} />
                <DetailRow label="Email" value={customer.email || 'Not set'} />
                <DetailRow label="Notes" value={customer.notes?.trim() || 'No customer notes'} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This job is missing a visible customer link.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked property</CardTitle>
          </CardHeader>
          <CardContent>
            {property ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Link
                    href={`/properties/${property.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {formatPropertyAddress(property)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {property.propertyType || 'Property type not set'}
                  </p>
                </div>
                <DetailRow label="Gate code" value={property.gateCode || 'Not set'} />
                <DetailRow
                  label="Access notes"
                  value={property.accessNotes?.trim() || 'No access notes'}
                />
                <DetailRow
                  label="Parking notes"
                  value={property.parkingNotes?.trim() || 'No parking notes'}
                />
                <DetailRow label="Property notes" value={property.notes?.trim() || 'No property notes'} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This job is missing a visible property link.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Phase summary</CardTitle>
          </CardHeader>
          <CardContent>
            {phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No phases are attached to this job yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {phases.map((phase) => (
                  <li key={phase.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{phase.name}</p>
                      <StatusBadge status={phase.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        phase.sortOrder !== null ? `Order ${phase.sortOrder}` : null,
                        formatScheduledWindow(
                          phase.scheduledStart,
                          phase.scheduledEnd
                        ),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {phase.description?.trim() ? (
                      <p className="mt-2 text-sm text-foreground">{phase.description.trim()}</p>
                    ) : null}
                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <p>
                        <span className="font-medium text-foreground">Actual:</span>{' '}
                        {formatScheduledWindow(phase.actualStart, phase.actualEnd)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Estimate:</span>{' '}
                        {formatMoney(phase.estimatedTotal)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Actual cost:</span>{' '}
                        {formatMoney(phase.actualCost)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <JobQuotesCard jobId={job.id} quotes={quotes} />
        <JobInvoicesCard jobId={job.id} invoices={invoices} />
        <FutureSectionCard
          title="Time entries"
          description="Tracked labor and drive time will attach to this job here."
        />
        <FutureSectionCard
          title="Captures"
          description="Photos, notes, recordings, and vault items will surface here."
        />
      </section>
    </PageShell>
  );
}

function JobQuotesCard({
  jobId,
  quotes,
}: {
  jobId: string;
  quotes: JobQuoteSummary[];
}) {
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Quotes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotes.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No quotes are attached to this job yet. Start with a draft quote, then
              line items and send flow can layer on next.
            </p>
            <CreateDraftQuoteButton jobId={jobId} />
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {quotes.map((quoteSummary) => (
                <li key={quoteSummary.quote.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/quotes/${quoteSummary.quote.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {quoteSummary.quote.title?.trim() ||
                        quoteSummary.quote.quote_number ||
                        'Untitled quote'}
                    </Link>
                    <QuoteStatusBadge status={quoteSummary.quote.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      formatQuoteType(quoteSummary.quote.type),
                      formatMoney(quoteSummary.quote.total),
                      `${quoteSummary.lineItemCount} ${
                        quoteSummary.lineItemCount === 1 ? 'line item' : 'line items'
                      }`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {formatScheduledAt(quoteSummary.quote.updated_at)}
                  </p>
                </li>
              ))}
            </ul>

            <Button asChild variant="outline">
              <Link href={`/quotes/${quotes[0]?.quote.id}`}>Open latest quote</Link>
            </Button>
            <CreateDraftQuoteButton jobId={jobId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobInvoicesCard({
  invoices,
  jobId,
}: {
  invoices: JobInvoiceSummary[];
  jobId: string;
}) {
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invoices.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No invoices are attached to this job yet.
            </p>
            <CreateInvoiceButton jobId={jobId} />
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {invoices.map(({ invoice, lineItemCount }) => (
                <li key={invoice.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {invoice.title?.trim() || invoice.invoice_number || 'Untitled invoice'}
                    </Link>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[
                      formatEnumLabel(invoice.kind),
                      formatMoney(invoice.total),
                      `Due ${formatMoney(invoice.amount_due)}`,
                      `${lineItemCount} ${lineItemCount === 1 ? 'line item' : 'line items'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {invoice.due_date ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {formatScheduledAt(invoice.due_date)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <Button asChild variant="outline">
              <Link href={`/invoices/${invoices[0]?.invoice.id}`}>Open latest invoice</Link>
            </Button>
            <CreateInvoiceButton jobId={jobId} />
          </div>
        )}
      </CardContent>
    </Card>
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

const INVOICE_STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-violet-50 text-violet-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  partially_paid: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  void: 'bg-slate-100 text-slate-500',
  refunded: 'bg-orange-50 text-orange-700',
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const colorClass = INVOICE_STATUS_BADGE_COLORS[status] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {formatEnumLabel(status)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      {formatEnumLabel(status)}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: 'emergency' | 'high' | 'low' | 'normal';
}) {
  const classes =
    priority === 'emergency'
      ? 'bg-red-50 text-red-700'
      : priority === 'high'
        ? 'bg-amber-50 text-amber-700'
        : priority === 'low'
          ? 'bg-slate-100 text-slate-700'
          : 'bg-muted text-muted-foreground';

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {formatEnumLabel(priority)}
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


function formatPropertyAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [property.addressLine1, property.addressLine2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(', ');
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

function formatQuoteType(value: string) {
  return formatEnumLabel(value);
}

function formatDuration(value: number | null) {
  if (value === null) {
    return 'Not estimated';
  }

  if (value < 60) {
    return `${value} minutes`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return `${hours}h ${minutes}m`;
}

function formatScheduledAt(value: string | null) {
  if (!value) {
    return 'Unscheduled';
  }

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
    return `${formatScheduledAt(start)} → ${formatScheduledAt(end)}`;
  }

  return formatScheduledAt(start ?? end);
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPreferredChannel(value: string | null) {
  if (!value) {
    return 'No preferred contact channel';
  }

  return `${formatEnumLabel(value)} preferred`;
}

function summarizePhaseState(phases: JobPhaseSummary[]) {
  if (phases.length === 0) {
    return 'No phases yet';
  }

  const inProgressCount = phases.filter((phase) => phase.status === 'in_progress').length;
  if (inProgressCount > 0) {
    return inProgressCount === 1
      ? '1 phase in progress'
      : `${inProgressCount} phases in progress`;
  }

  const nextScheduledPhase =
    phases.find((phase) => Boolean(phase.scheduledStart || phase.scheduledEnd)) ?? null;

  if (nextScheduledPhase) {
    return `Next: ${nextScheduledPhase.name}`;
  }

  return 'Phases attached';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
