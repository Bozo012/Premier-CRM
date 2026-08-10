import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createServiceClient,
  getActiveOrgContext,
  getDepositState,
  getEntityTimeline,
  getJobById,
  getJobInvoiceTotals,
  getSignedReadUrl,
  getWorkingInvoice,
  listChangeOrdersForJob,
  listInvoicesForJob,
  listJobAssignments,
  listQuotesForJob,
  listActiveTeamMembers,
  type ChangeOrderThreadDetail,
  type DepositState,
  type JobInvoiceSummary,
  type JobQuoteSummary,
  type WorkingInvoiceDetail,
} from '@premier/db';
import { ErrorCode, hasCapability, type OrgRole } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrgContextError } from '@/components/org-context-error';
import { Timeline } from '@/components/timeline';
import { buildChangeOrderHistoryFeed } from '@/lib/change-order-history';
import { getServerSupabase } from '@/lib/supabase-server';

import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';
import { toJobDetailModel } from '../_lib/forge-job-detail-view-model';
import { JobsShell } from '../_components/jobs-shell';
import { JobDetailContainer } from '../_components/job-detail-container';
import { CrewSection } from '../_components/crew-section';
import {
  ProposeChangeOrderButton,
  WithdrawChangeOrderButton,
} from '../_components/change-order-action-buttons';
import { AddJobLogForm } from '../_components/add-job-log-form';
import { AddJobPhotoForm } from '../_components/add-job-photo-form';
import { ChangeOrderDraftForm } from '../_components/change-order-draft-form';
import { CreateDraftQuoteButton } from '../_components/create-draft-quote-button';
import { CreateInvoiceButton } from '../_components/create-invoice-button';
import { CreateSchedulingSlotForm } from '../_components/create-scheduling-slot-form';
import { DepositRequirementForm } from '../_components/deposit-requirement-form';
import { GenerateFinalInvoiceButton } from '../_components/generate-final-invoice-button';
import { ScheduleJobForm } from '../_components/schedule-job-form';
import { CreateDepositInvoiceButton } from '../_components/create-deposit-invoice-button';
import { WaiveDepositButton } from '../_components/waive-deposit-button';

interface JobDetailPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;

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
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }
  const { orgId, role } = orgContextResult.data;
  const canCreateQuote = hasCapability(role as OrgRole, 'canCreateQuote');
  const canManageCrew = hasCapability(role as OrgRole, 'canScheduleJobs');

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  if (!isUuid(jobId)) {
    return (
      <JobsShell shellData={shellData} mobileNav={mobileNav}>
        <PageShell>
          <JobNotFoundPanel />
        </PageShell>
      </JobsShell>
    );
  }

  const serviceClient = createServiceClient();

  const [
    result,
    quotesResult,
    sourceEstimateResult,
    sourceRequestResult,
    invoicesResult,
    invoiceTotalsResult,
    depositStateResult,
    workingInvoiceResult,
    changeOrdersResult,
    timelineResult,
    photosResult,
    crewResult,
    membersResult,
  ] = await Promise.all([
    getJobById(supabase, { jobId, orgId }),
    listQuotesForJob(supabase, { jobId, orgId }),
    serviceClient.from('estimates').select('id, title, estimate_number').eq('converted_job_id', jobId).eq('org_id', orgId).maybeSingle(),
    serviceClient.from('service_requests').select('id, request_number, service_title').eq('job_id', jobId).eq('org_id', orgId).maybeSingle(),
    listInvoicesForJob(supabase, { jobId, orgId }),
    getJobInvoiceTotals(supabase, { jobId, orgId }),
    getDepositState(serviceClient, { orgId, jobId }),
    getWorkingInvoice(serviceClient, { orgId, jobId }),
    listChangeOrdersForJob(serviceClient, { orgId, jobId }),
    getEntityTimeline(serviceClient, { orgId, entityType: 'job', entityId: jobId }),
    serviceClient
      .from('vault_items')
      .select('id, content, created_at, storage_object_key, image_url')
      .eq('org_id', orgId)
      .eq('job_id', jobId)
      .eq('type', 'photo')
      .order('created_at', { ascending: false }),
    listJobAssignments(supabase, { orgId, jobId }),
    listActiveTeamMembers(supabase, { orgId }),
  ]);

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      return (
        <JobsShell shellData={shellData} mobileNav={mobileNav}>
          <PageShell>
            <JobNotFoundPanel />
          </PageShell>
        </JobsShell>
      );
    }

    return (
      <JobsShell shellData={shellData} mobileNav={mobileNav}>
        <PageShell>
          <ErrorPanel>Failed to load job: {result.error}</ErrorPanel>
        </PageShell>
      </JobsShell>
    );
  }

  if (!quotesResult.success) {
    return (
      <JobsShell shellData={shellData} mobileNav={mobileNav}>
        <PageShell>
          <ErrorPanel>Failed to load job quotes: {quotesResult.error}</ErrorPanel>
        </PageShell>
      </JobsShell>
    );
  }

  if (!invoicesResult.success) {
    return (
      <JobsShell shellData={shellData} mobileNav={mobileNav}>
        <PageShell>
          <ErrorPanel>Failed to load job invoices: {invoicesResult.error}</ErrorPanel>
        </PageShell>
      </JobsShell>
    );
  }

  const { job, phases } = result.data;
  const quotes = quotesResult.data;
  const sourceEstimate = sourceEstimateResult.data ?? null;
  const sourceRequest = sourceRequestResult.data ?? null;
  const invoices = invoicesResult.data;
  const invoiceTotals = invoiceTotalsResult.success ? invoiceTotalsResult.data : null;
  const depositState = depositStateResult.success ? depositStateResult.data : null;
  const workingInvoice = workingInvoiceResult.success ? workingInvoiceResult.data : null;
  const changeOrders = changeOrdersResult.success ? changeOrdersResult.data : [];
  const timelineEntries = timelineResult.success
    ? timelineResult.data.map((entry) => ({
        id: entry.id,
        label: entry.message?.trim() || formatEnumLabel(entry.event_type),
        createdAt: entry.created_at,
      }))
    : [];
  const crew = crewResult.success ? crewResult.data : [];
  const availableMembers = membersResult.success ? membersResult.data : [];
  const jobPhotos = await Promise.all(
    (photosResult.data ?? []).map(async (item) => {
      const storagePath = item.storage_object_key ?? item.image_url;
      const signedUrl = storagePath ? await getSignedReadUrl(serviceClient, storagePath) : null;
      return {
        id: item.id,
        caption: item.content?.trim() || 'Job photo',
        createdAt: item.created_at,
        imageUrl: signedUrl?.success ? signedUrl.data : null,
      };
    })
  );

  const model = toJobDetailModel({ detail: result.data, crew, sourceEstimate, sourceRequest });

  return (
    <JobsShell shellData={shellData} mobileNav={mobileNav}>
      <JobDetailContainer model={model} />
      <PageShell>
        {job.status === 'approved' ? (
          <Card id="schedule-job">
            <CardHeader>
              <CardTitle>Ready to schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use this step to turn the approved work order into a scheduled job.
              </p>
              <ScheduleJobForm jobId={job.id} />
              <CreateSchedulingSlotForm />
            </CardContent>
          </Card>
        ) : null}

        <CrewSection jobId={job.id} assignments={crew} availableMembers={availableMembers} canManageCrew={canManageCrew} />

        <section className="flex gap-2 overflow-x-auto pb-1">
          <Button asChild variant="outline" className="shrink-0 rounded-xl font-bold">
            <Link href="/expenses/new">Add expense</Link>
          </Button>
          <Button asChild variant="outline" className="shrink-0 rounded-xl font-bold">
            <a href="#change-orders">Create change order</a>
          </Button>
          <Button asChild variant="outline" className="shrink-0 rounded-xl font-bold">
            <a href="#job-logs">Add log</a>
          </Button>
          <Button asChild variant="outline" className="shrink-0 rounded-xl font-bold">
            <a href="#job-photos">Add photo</a>
          </Button>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Financial snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Quoted total" value={formatMoney(job.quoted_total)} />
            <DetailRow label="Invoiced total" value={invoiceTotals ? formatMoney(invoiceTotals.invoicedTotal) : 'Not available'} />
            <DetailRow label="Paid total" value={invoiceTotals ? formatMoney(invoiceTotals.paidTotal) : 'Not available'} />
            <DetailRow label="Amount remaining" value={invoiceTotals ? formatMoney(invoiceTotals.amountDueTotal) : 'Not available'} />
            <DetailRow label="Cost total" value={formatMoney(job.cost_total)} />
            <DetailRow label="Closed at" value={job.closed_at ? formatScheduledAt(job.closed_at) : 'Not closed'} />
          </CardContent>
        </Card>

        <section>
          <Timeline entries={timelineEntries} />
        </section>

        <section id="job-logs">
          <Card>
            <CardHeader>
              <CardTitle>Job logs</CardTitle>
            </CardHeader>
            <CardContent>
              <AddJobLogForm jobId={job.id} />
            </CardContent>
          </Card>
        </section>

        <section id="job-photos">
          <Card>
            <CardHeader>
              <CardTitle>Job photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddJobPhotoForm jobId={job.id} />
              {jobPhotos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos added to this job yet.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {jobPhotos.map((photo) => (
                    <li key={photo.id}>
                      <Link href={`/site-photos/${photo.id}`} className="block overflow-hidden rounded-md border transition hover:opacity-90">
                        <div className="grid aspect-video place-items-center bg-muted">
                          {photo.imageUrl ? (
                            <div
                              role="img"
                              aria-label={photo.caption}
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${photo.imageUrl})` }}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Preview unavailable</span>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-1 text-xs font-medium text-foreground">{photo.caption}</p>
                          <p className="text-xs text-muted-foreground">{formatScheduledAt(photo.createdAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Phase summary</CardTitle>
          </CardHeader>
          <CardContent>
            {phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No phases are attached to this job. Forge&apos;s job_phases table exists but is not
                populated or created by any current workflow — job progress above is derived from the
                job&apos;s status instead, not from phases.
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
                      {[phase.sortOrder !== null ? `Order ${phase.sortOrder}` : null, formatScheduledWindow(phase.scheduledStart, phase.scheduledEnd)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {phase.description?.trim() ? <p className="mt-2 text-sm text-foreground">{phase.description.trim()}</p> : null}
                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <p>
                        <span className="font-medium text-foreground">Actual:</span> {formatScheduledWindow(phase.actualStart, phase.actualEnd)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Estimate:</span> {formatMoney(phase.estimatedTotal)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Actual cost:</span> {formatMoney(phase.actualCost)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <JobQuotesCard jobId={job.id} quotes={quotes} canCreateQuote={canCreateQuote} />
          <JobInvoicesCard jobId={job.id} invoices={invoices} />
          <DepositCard jobId={job.id} depositState={depositState} />
          <WorkingInvoiceCard jobId={job.id} workingInvoice={workingInvoice} />
        </section>

        <section id="change-orders">
          <ChangeOrdersCard jobId={job.id} threads={changeOrders} />
        </section>
      </PageShell>
    </JobsShell>
  );
}

function JobNotFoundPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job not found</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">This job may have been moved, deleted, or created in a different organization.</p>
        <Button asChild>
          <Link href="/jobs">Back to jobs</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DepositCard({ depositState, jobId }: { depositState: DepositState | null; jobId: string }) {
  const status = depositState?.paymentStatus ?? 'none';
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Deposit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-medium text-foreground">{formatEnumLabel(status)}</span>
        </p>
        {depositState?.requirement?.required_amount ? (
          <p className="text-sm text-muted-foreground">Required: {formatMoney(depositState.requirement.required_amount)}</p>
        ) : null}
        {status === 'none' ? <DepositRequirementForm jobId={jobId} /> : null}
        {status === 'required' && !depositState?.requirement?.deposit_invoice_id ? (
          <div className="flex flex-col gap-2">
            <CreateDepositInvoiceButton jobId={jobId} />
            <WaiveDepositButton jobId={jobId} />
          </div>
        ) : null}
        {status === 'required' && depositState?.requirement?.deposit_invoice_id ? (
          <p className="text-sm text-muted-foreground">
            Deposit invoice created, awaiting payment —{' '}
            <a className="underline" href={`/invoices/${depositState.requirement.deposit_invoice_id}`}>
              view it
            </a>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WorkingInvoiceCard({ jobId, workingInvoice }: { jobId: string; workingInvoice: WorkingInvoiceDetail | null }) {
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Working invoice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!workingInvoice ? (
          <p className="text-sm text-muted-foreground">No working invoice yet — created automatically when the job is scheduled.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {workingInvoice.lineItems.length} {workingInvoice.lineItems.length === 1 ? 'line item' : 'line items'}
            </p>
            <ul className="space-y-1 text-sm">
              {workingInvoice.lineItems.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span>
                    {item.name}
                    {item.source_type ? <span className="ml-1 text-xs text-muted-foreground">({formatEnumLabel(item.source_type)})</span> : null}
                  </span>
                  <span>{formatMoney(item.total)}</span>
                </li>
              ))}
            </ul>
            {workingInvoice.lineItems.length > 0 ? <GenerateFinalInvoiceButton jobId={jobId} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangeOrdersCard({ jobId, threads }: { jobId: string; threads: ChangeOrderThreadDetail[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change orders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No change orders on this job yet.</p>
        ) : (
          <ul className="space-y-3">
            {threads.map((thread) => {
              const currentRevision = thread.revisions.find((r) => r.id === thread.changeOrder.current_revision_id);
              return (
                <li key={thread.changeOrder.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      v{currentRevision?.version ?? 1} — {formatEnumLabel(thread.changeOrder.status)}
                    </p>
                  </div>
                  {currentRevision?.reason ? <p className="mt-1 text-sm text-muted-foreground">{currentRevision.reason}</p> : null}
                  <p className="mt-1 text-sm text-muted-foreground">Price adjustment: {formatMoney(currentRevision?.price_adjustment ?? 0)}</p>
                  {thread.currentRevisionLineItems.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {thread.currentRevisionLineItems.map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span>{item.description}</span>
                          <span>{formatMoney(item.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(() => {
                    const history = buildChangeOrderHistoryFeed(thread);
                    return history.length > 0 ? (
                      <ol className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        {history.map((event) => (
                          <li key={event.id}>
                            <span className="text-foreground">{event.label}</span>
                            {event.detail ? ` — ${event.detail}` : ''}
                          </li>
                        ))}
                      </ol>
                    ) : null;
                  })()}
                  {currentRevision?.status === 'draft' ? (
                    <div className="mt-2 flex gap-2">
                      <ProposeChangeOrderButton jobId={jobId} revisionId={currentRevision.id} />
                      <WithdrawChangeOrderButton jobId={jobId} revisionId={currentRevision.id} />
                    </div>
                  ) : null}
                  {currentRevision?.status === 'proposed' || currentRevision?.status === 'under_review' ? (
                    <div className="mt-2">
                      <WithdrawChangeOrderButton jobId={jobId} revisionId={currentRevision.id} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <ChangeOrderDraftForm jobId={jobId} />
      </CardContent>
    </Card>
  );
}

function JobQuotesCard({ jobId, quotes, canCreateQuote }: { jobId: string; quotes: JobQuoteSummary[]; canCreateQuote: boolean }) {
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Quotes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotes.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No quotes are attached to this job yet. Start with a draft quote, then line items and send flow can layer on next.
            </p>
            {canCreateQuote ? <CreateDraftQuoteButton jobId={jobId} /> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {quotes.map((quoteSummary) => (
                <li key={quoteSummary.quote.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/quotes/${quoteSummary.quote.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                      {quoteSummary.quote.title?.trim() || quoteSummary.quote.quote_number || 'Untitled quote'}
                    </Link>
                    <QuoteStatusBadge status={quoteSummary.quote.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[formatEnumLabel(quoteSummary.quote.type), formatMoney(quoteSummary.quote.total), `${quoteSummary.lineItemCount} ${quoteSummary.lineItemCount === 1 ? 'line item' : 'line items'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Updated {formatScheduledAt(quoteSummary.quote.updated_at)}</p>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline">
              <Link href={`/quotes/${quotes[0]?.quote.id}`}>Open latest quote</Link>
            </Button>
            {canCreateQuote ? <CreateDraftQuoteButton jobId={jobId} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobInvoicesCard({ invoices, jobId }: { invoices: JobInvoiceSummary[]; jobId: string }) {
  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invoices.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No invoices are attached to this job yet.</p>
            <CreateInvoiceButton jobId={jobId} />
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {invoices.map(({ invoice, lineItemCount }) => (
                <li key={invoice.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/invoices/${invoice.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                      {invoice.title?.trim() || invoice.invoice_number || 'Untitled invoice'}
                    </Link>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[formatEnumLabel(invoice.kind), formatMoney(invoice.total), `Due ${formatMoney(invoice.amount_due)}`, `${lineItemCount} ${lineItemCount === 1 ? 'line item' : 'line items'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {invoice.due_date ? <p className="mt-1 text-xs text-muted-foreground">Due {formatScheduledAt(invoice.due_date)}</p> : null}
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
  return <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-28 pt-4 sm:px-6 lg:px-8">{children}</main>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{formatEnumLabel(status)}</span>;
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
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>{formatEnumLabel(status)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{formatEnumLabel(status)}</span>;
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

function formatMoney(value: number | null) {
  if (value === null) return 'Not available';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

function formatScheduledAt(value: string | null) {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatScheduledWindow(start: string | null, end: string | null) {
  if (!start && !end) return 'Not scheduled';
  if (start && end) return `${formatScheduledAt(start)} → ${formatScheduledAt(end)}`;
  return formatScheduledAt(start ?? end);
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
