import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createServiceClient,
  getDepositState,
  getEntityTimelineForCustomer,
  getMySiteVisitSummary,
  getWorkingInvoiceSummaryForCustomer,
  listChangeOrdersForJob,
  listOpenSchedulingSlots,
  type CustomerSiteVisitSummary,
} from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Timeline } from '@/components/timeline';
import { buildChangeOrderHistoryFeed } from '@/lib/change-order-history';
import {
  getPortalRequestStatusDescription,
  getPortalRequestStatusLabel,
} from '@/lib/request-intake-flow';
import { getServerSupabase } from '@/lib/supabase-server';

import { AddChangeOrderCommentForm } from '../_components/add-change-order-comment-form';
import { BookSchedulingSlotForm } from '../_components/book-scheduling-slot-form';
import { RequestChangeOrderForm } from '../_components/request-change-order-form';
import { RespondToChangeOrderForm } from '../_components/respond-change-order-form';
import { signOutCustomerPortal } from '../actions';

interface CustomerAccountRow {
  customer_id: string;
  email: string;
  status: string;
}

interface ServiceRequestRow {
  id: string;
  request_number: string;
  status: string;
  priority: string;
  estimate_id: string | null;
  job_id: string | null;
  service_title: string;
  service_description: string;
  submitted_at: string;
  reviewed_at: string | null;
  converted_at: string | null;
  preferred_date: string | null;
  property_address_line_1: string;
  property_city: string;
  property_state: string;
}

interface CustomerPropertyRow {
  relationship: string | null;
  is_primary: boolean | null;
  properties: {
    id: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
}

function asCustomerAccountRow(value: unknown): CustomerAccountRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.customer_id === 'string' &&
    typeof row.email === 'string' &&
    typeof row.status === 'string'
  ) {
    return {
      customer_id: row.customer_id,
      email: row.email,
      status: row.status,
    };
  }
  return null;
}

function asServiceRequestRows(value: unknown): ServiceRequestRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ServiceRequestRow => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === 'string' &&
      typeof record.request_number === 'string' &&
      typeof record.status === 'string' &&
      typeof record.priority === 'string' &&
      ('estimate_id' in record) &&
      ('job_id' in record) &&
      typeof record.service_title === 'string' &&
      typeof record.service_description === 'string' &&
      typeof record.submitted_at === 'string' &&
      typeof record.property_address_line_1 === 'string' &&
      typeof record.property_city === 'string' &&
      typeof record.property_state === 'string'
    );
  });
}

function asCustomerPropertyRows(value: unknown): CustomerPropertyRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is CustomerPropertyRow => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    const property = record.properties;
    if (!property || typeof property !== 'object') return false;
    const propertyRecord = property as Record<string, unknown>;
    return (
      typeof propertyRecord.id === 'string' &&
      typeof propertyRecord.address_line_1 === 'string' &&
      typeof propertyRecord.city === 'string' &&
      typeof propertyRecord.state === 'string' &&
      typeof propertyRecord.zip === 'string'
    );
  });
}

function isCompleted(status: string): boolean {
  return ['completed', 'cancelled', 'spam'].includes(status);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function propertyAddress(row: CustomerPropertyRow): string {
  const property = row.properties;
  if (!property) return 'Property details unavailable';
  const street = property.address_line_2
    ? `${property.address_line_1}, ${property.address_line_2}`
    : property.address_line_1;
  return `${street}, ${property.city}, ${property.state} ${property.zip}`;
}

export default async function PortalDashboardPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/portal/login');

  const portalClient = supabase as unknown as SupabaseClient;

  const { data: accountData, error: accountError } = await portalClient
    .from('customer_accounts')
    .select('customer_id, email, status')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();

  const account = asCustomerAccountRow(accountData);

  if (accountError || !account || account.status !== 'active') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Portal account not linked yet</CardTitle>
            <CardDescription>
              Your sign-in works, but we could not find an active customer account link yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Customer portal users are linked through customer_accounts, not org_members.
              Ask Premier to confirm your email if you expected to see requests here.
            </p>
            <form action={signOutCustomerPortal}>
              <Button type="submit" variant="outline">Sign out</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [serviceRequestsResult, propertiesResult] = await Promise.all([
    portalClient
      .from('service_requests')
      .select(
        'id, request_number, status, priority, estimate_id, job_id, service_title, service_description, submitted_at, reviewed_at, converted_at, preferred_date, property_address_line_1, property_city, property_state'
      )
      .eq('customer_id', account.customer_id)
      .order('submitted_at', { ascending: false }),
    portalClient
      .from('customer_properties')
      .select('relationship, is_primary, properties(id, address_line_1, address_line_2, city, state, zip)')
      .eq('customer_id', account.customer_id),
  ]);

  const serviceRequests = asServiceRequestRows(serviceRequestsResult.data);
  const properties = asCustomerPropertyRows(propertiesResult.data);
  const activeRequests = serviceRequests.filter((request) => !isCompleted(request.status));
  const completedRequests = serviceRequests.filter((request) => isCompleted(request.status));

  // Customer-safe presentation: this is the ONLY way the portal reads
  // site-visit data — via the get_my_site_visit_summary() RPC, called with
  // the portal-scoped (RLS-authenticated) client, never the service client.
  // The RPC itself filters to this customer's own requests; it never
  // exposes inspection responses, hazards, internal notes, staff-only
  // actors, or the triage reason — see supabase/migrations/20260802020400_
  // customer_safe_site_visit_summary.sql.
  const siteVisitSummaries = new Map<string, CustomerSiteVisitSummary[]>();
  await Promise.all(
    serviceRequests.map(async (request) => {
      const result = await getMySiteVisitSummary(supabase, request.id);
      if (result.success && result.data.length > 0) {
        siteVisitSummaries.set(request.id, result.data);
      }
    })
  );

  const serviceClient = createServiceClient();
  const { data: jobs } = await portalClient
    .from('jobs')
    .select('id, title, status, scheduled_start, scheduled_end, org_id')
    .eq('customer_id', account.customer_id)
    .order('created_at', { ascending: false });

  const jobDetails = await Promise.all(
    (jobs ?? []).map(async (job) => {
      const [slotsResult, depositResult, workingInvoiceResult, changeOrdersResult, timelineResult] =
        await Promise.all([
          job.status === 'approved'
            ? listOpenSchedulingSlots(serviceClient, { orgId: job.org_id })
            : Promise.resolve({ success: true as const, data: [] }),
          getDepositState(serviceClient, { orgId: job.org_id, jobId: job.id }),
          getWorkingInvoiceSummaryForCustomer(serviceClient, { jobId: job.id }),
          listChangeOrdersForJob(serviceClient, { orgId: job.org_id, jobId: job.id }),
          getEntityTimelineForCustomer(serviceClient, {
            orgId: job.org_id,
            entityType: 'job',
            entityId: job.id,
          }),
        ]);

      return {
        job,
        openSlots: slotsResult.success ? slotsResult.data : [],
        depositState: depositResult.success ? depositResult.data : null,
        workingInvoiceSummary: workingInvoiceResult.success ? workingInvoiceResult.data : null,
        changeOrders: changeOrdersResult.success ? changeOrdersResult.data : [],
        timeline: timelineResult.success
          ? timelineResult.data.map((entry) => ({
              id: entry.id,
              label: entry.label,
              createdAt: entry.createdAt,
            }))
          : [],
      };
    })
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Premier customer portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {account.email}. Your customer account is separate from internal Premier org_members.
          </p>
        </div>
        <form action={signOutCustomerPortal}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </header>

      {(serviceRequestsResult.error || propertiesResult.error) ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Some portal data could not be loaded. Please refresh or contact Premier if this continues.
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Active requests" value={activeRequests.length.toString()} />
        <SummaryCard title="Completed requests" value={completedRequests.length.toString()} />
        <SummaryCard title="Properties" value={properties.length.toString()} />
        <SummaryCard title="Account balance" value="Coming soon" />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <RequestList
          title="Active service requests"
          requests={activeRequests}
          emptyText="No active service requests yet."
          siteVisitSummaries={siteVisitSummaries}
        />
        <RequestList
          title="Completed service requests"
          requests={completedRequests}
          emptyText="No completed service requests yet."
          siteVisitSummaries={siteVisitSummaries}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
          <CardDescription>Properties linked to your customer account.</CardDescription>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties are linked yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {properties.map((row) => (
                <li key={row.properties?.id ?? propertyAddress(row)} className="px-4 py-3">
                  <p className="font-medium">{propertyAddress(row)}</p>
                  <p className="text-sm capitalize text-muted-foreground">
                    {row.relationship ?? 'customer'}{row.is_primary ? ' · primary' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {jobDetails.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Your jobs</h2>
          {jobDetails.map(({ job, openSlots, depositState, workingInvoiceSummary, changeOrders, timeline }) => (
            <Card key={job.id}>
              <CardHeader>
                <CardTitle>{job.title}</CardTitle>
                <CardDescription className="capitalize">{job.status.replace(/_/g, ' ')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {job.scheduled_start ? (
                  <p className="text-sm text-muted-foreground">
                    Scheduled: {new Date(job.scheduled_start).toLocaleString()}
                  </p>
                ) : null}

                {job.status === 'approved' ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pick an available time</p>
                    {openSlots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No open slots published yet — Premier will reach out to schedule.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {openSlots.map((slot) => (
                          <BookSchedulingSlotForm
                            key={slot.id}
                            jobId={job.id}
                            slotId={slot.id}
                            label={`${new Date(slot.starts_at).toLocaleString()} (${slot.spotsRemaining} open)`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {depositState && depositState.paymentStatus !== 'none' ? (
                  <p className="text-sm text-muted-foreground">
                    Deposit: <span className="font-medium capitalize">{depositState.paymentStatus.replace(/_/g, ' ')}</span>
                    {depositState.requirement?.required_amount
                      ? ` — $${depositState.requirement.required_amount}`
                      : ''}
                  </p>
                ) : null}

                {workingInvoiceSummary ? (
                  <p className="text-sm text-muted-foreground">
                    Work in progress total so far: ${workingInvoiceSummary.runningTotal.toFixed(2)} (
                    {workingInvoiceSummary.lineCount} items)
                  </p>
                ) : null}

                {changeOrders.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Project changes</p>
                    {changeOrders.map((thread) => {
                      const currentRevision = thread.revisions.find(
                        (r) => r.id === thread.changeOrder.current_revision_id
                      );
                      const awaitingResponse =
                        currentRevision?.status === 'proposed' || currentRevision?.status === 'under_review';
                      const history = buildChangeOrderHistoryFeed(thread);
                      return (
                        <div key={thread.changeOrder.id} className="rounded-md border p-3">
                          <p className="text-sm font-medium">
                            v{currentRevision?.version ?? 1} — {currentRevision?.status ?? thread.changeOrder.status}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Price: ${(currentRevision?.price_adjustment ?? 0).toFixed(2)}
                          </p>

                          {history.length > 0 ? (
                            <ol className="mt-3 space-y-2 border-l pl-3">
                              {history.map((event) => (
                                <li key={event.id} className="text-sm">
                                  <p className="text-foreground">{event.label}</p>
                                  {event.detail ? (
                                    <p className="text-xs text-muted-foreground">{event.detail}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          ) : null}

                          {awaitingResponse && currentRevision ? (
                            <div className="mt-2">
                              <RespondToChangeOrderForm
                                revisionId={currentRevision.id}
                                acknowledgmentVersion={currentRevision.acknowledgment_version}
                              />
                            </div>
                          ) : null}
                          <div className="mt-2">
                            <AddChangeOrderCommentForm changeOrderId={thread.changeOrder.id} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <RequestChangeOrderForm jobId={job.id} />

                {timeline.length > 0 ? <Timeline entries={timeline} title="Job timeline" /> : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function RequestList({
  title,
  requests,
  emptyText,
  siteVisitSummaries,
}: {
  title: string;
  requests: ServiceRequestRow[];
  emptyText: string;
  siteVisitSummaries: Map<string, CustomerSiteVisitSummary[]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="rounded-md border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{request.service_title}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.request_number} · {formatDate(request.submitted_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                    {getPortalRequestStatusLabel({
                      status: request.status,
                      estimateId: request.estimate_id,
                      jobId: request.job_id,
                    })}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {request.service_description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {request.property_address_line_1}, {request.property_city}, {request.property_state}
                  {request.preferred_date ? ` · Preferred ${request.preferred_date}` : ''}
                </p>
                {getPortalRequestStatusDescription({
                  status: request.status,
                  estimateId: request.estimate_id,
                  jobId: request.job_id,
                }) ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {getPortalRequestStatusDescription({
                      status: request.status,
                      estimateId: request.estimate_id,
                      jobId: request.job_id,
                    })}
                  </p>
                ) : null}
                {(siteVisitSummaries.get(request.id) ?? []).map((visit) => (
                  <div key={visit.siteVisitId} className="mt-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    <p className="font-medium capitalize text-foreground">
                      Site visit: {visit.safeStatus.replace(/_/g, ' ')}
                    </p>
                    {visit.scheduledStart ? (
                      <p className="mt-1 text-muted-foreground">
                        {new Date(visit.scheduledStart).toLocaleString()}
                        {visit.isRescheduled ? ' (rescheduled)' : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">Not yet scheduled.</p>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
