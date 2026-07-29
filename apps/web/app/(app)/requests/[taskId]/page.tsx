import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext, getRequestById, type RequestDetail } from '@premier/db';

import { getRequestIntakePath, getRequestIntakePathLabel } from '@/lib/request-intake-flow';
import { getServerSupabase } from '@/lib/supabase-server';
import { CreateEstimateButton } from '../_components/create-estimate-button';
import { CreateJobButton } from '../_components/create-job-button';
import { MarkReviewedButton } from '../_components/mark-reviewed-button';

interface RequestDetailPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { taskId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/requests/${taskId}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return <ErrorPage>{orgContextResult.error}</ErrorPage>;
  }
  const { orgId } = orgContextResult.data;

  const result = await getRequestById(supabase, { taskId, orgId });

  if (!result.success) {
    return (
      <ErrorPage>
        {result.error === 'NOT_FOUND'
          ? 'Request not found.'
          : `Failed to load request: ${result.error}`}
      </ErrorPage>
    );
  }

  const request = result.data;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <Link
        href="/requests"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Requests
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <StatusBadge status={request.status} />
          {request.priority !== 'normal' ? (
            <PriorityBadge priority={request.priority} />
          ) : null}
          {request.estimateId ? (
            <Link
              href={`/estimates/${request.estimateId}`}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Estimate created
            </Link>
          ) : request.jobId ? (
            <Link
              href={`/jobs/${request.jobId}`}
              className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Job created
            </Link>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {request.requestNumber}
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{request.title}</h1>
        <p className="text-sm text-muted-foreground">
          Received {formatDateTime(request.createdAt)}
        </p>
      </header>

      <div className="space-y-4">
        <CustomerCard request={request} />
        <RequestDetailsCard request={request} />
        <PropertyCard request={request} />
        <ActionsCard request={request} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function CustomerCard({ request }: { request: RequestDetail }) {
  const email = request.contactEmail ?? request.customer?.email;
  const phone = request.contactPhone ?? request.customer?.phonePrimary;

  return (
    <section className="rounded-md border bg-background p-4 space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer
      </h2>
      <p className="font-medium">
        {request.customer ? (
          <Link
            href={`/customers/${request.customer.id}`}
            className="underline-offset-2 hover:underline"
          >
            {request.contactName}
          </Link>
        ) : (
          request.contactName
        )}
      </p>
      {phone ? <p className="text-sm text-muted-foreground">{phone}</p> : null}
      {email ? <p className="text-sm text-muted-foreground">{email}</p> : null}
    </section>
  );
}

function RequestDetailsCard({ request }: { request: RequestDetail }) {
  return (
    <section className="rounded-md border bg-background p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Request Details
      </h2>

      <dl className="space-y-1">
        <div className="flex gap-2 text-sm">
          <dt className="font-medium text-foreground min-w-[110px]">Service</dt>
          <dd className="text-muted-foreground">{request.serviceTitle}</dd>
        </div>
        {request.serviceCategory && request.serviceCategory !== request.serviceTitle ? (
          <div className="flex gap-2 text-sm">
            <dt className="font-medium text-foreground min-w-[110px]">Category</dt>
            <dd className="text-muted-foreground">{request.serviceCategory}</dd>
          </div>
        ) : null}
      </dl>

      {request.description ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Description
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{request.description}</p>
        </div>
      ) : null}
    </section>
  );
}

function PropertyCard({ request }: { request: RequestDetail }) {
  if (!request.property) {
    return (
      <section className="rounded-md border bg-background p-4 space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Property
        </h2>
        <p className="text-sm text-muted-foreground">
          No property linked.{' '}
          {request.customerId ? (
            <Link
              href={`/customers/${request.customerId}`}
              className="underline-offset-2 hover:underline text-foreground"
            >
              Add one from the customer record.
            </Link>
          ) : null}
        </p>
      </section>
    );
  }

  const { property } = request;
  const address = [
    property.addressLine1,
    property.addressLine2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="rounded-md border bg-background p-4 space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Property
      </h2>
      <p className="text-sm font-medium">
        <Link
          href={`/properties/${property.id}`}
          className="underline-offset-2 hover:underline"
        >
          {address}
        </Link>
      </p>
    </section>
  );
}

function ActionsCard({ request }: { request: RequestDetail }) {
  const isReviewed = request.status !== 'new';
  const hasEstimate = !!request.estimateId;
  const hasJob = !!request.jobId;
  const canStartFlow = !hasEstimate && !hasJob && !!request.customerId && !!request.property;
  const intakePathLabel = getRequestIntakePathLabel(
    getRequestIntakePath({ estimateId: request.estimateId, jobId: request.jobId })
  );

  return (
    <section className="rounded-md border bg-background p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Actions
      </h2>

      <div className="flex flex-wrap gap-3">
        {intakePathLabel ? (
          <span className="inline-flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
            {intakePathLabel}
          </span>
        ) : null}

        {hasEstimate ? (
          <Link
            href={`/estimates/${request.estimateId}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Open estimate →
          </Link>
        ) : hasJob ? (
          <Link
            href={`/jobs/${request.jobId}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Open work order →
          </Link>
        ) : (
          <>
            {canStartFlow ? <CreateEstimateButton requestId={request.id} /> : null}
            {canStartFlow ? <CreateJobButton requestId={request.id} /> : null}
          </>
        )}

        {!isReviewed ? (
          <MarkReviewedButton taskId={request.id} />
        ) : null}
      </div>

      {!hasEstimate && !hasJob && canStartFlow ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Inspection flow</p>
            <p className="mt-1">
              Use this for remodels, new work, or anything that needs a visit before pricing.
            </p>
            <p className="mt-1">Request → estimate → site visit → quote → job.</p>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Work-order path</p>
            <p className="mt-1">
              Use this for repeat clients, property managers, or already-approved work.
            </p>
            <p className="mt-1">Request → job → schedule work.</p>
          </div>
        </div>
      ) : null}

      {!hasEstimate && !request.property && request.customerId ? (
        <p className="text-xs text-muted-foreground">
          A property must be linked to the customer before starting either path.{' '}
          <Link
            href={`/customers/${request.customerId}`}
            className="underline-offset-2 hover:underline text-foreground"
          >
            Go to customer record →
          </Link>
        </p>
      ) : null}

      {request.reviewedAt && !hasEstimate ? (
        <p className="text-xs text-muted-foreground">
          Reviewed {formatDateTime(request.reviewedAt)}
        </p>
      ) : null}

      {request.convertedAt && hasEstimate ? (
        <p className="text-xs text-muted-foreground">
          Inspection flow started {formatDateTime(request.convertedAt)}
        </p>
      ) : null}

      {request.convertedAt && hasJob ? (
        <p className="text-xs text-muted-foreground">
          Work order created {formatDateTime(request.convertedAt)}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new: 'bg-amber-50 text-amber-700',
    reviewing: 'bg-blue-50 text-blue-700',
    estimate_created: 'bg-indigo-50 text-indigo-700',
    approved: 'bg-green-50 text-green-700',
    scheduled: 'bg-indigo-50 text-indigo-700',
    in_progress: 'bg-blue-50 text-blue-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500',
    spam: 'bg-red-50 text-red-600',
  };
  const color = colorMap[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {formatEnumLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    high: 'bg-orange-50 text-orange-700',
    emergency: 'bg-red-50 text-red-700',
    low: 'bg-slate-100 text-slate-500',
  };
  const color = colorMap[priority] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {formatEnumLabel(priority)}
    </span>
  );
}

function ErrorPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 pb-24 pt-5">
      <Link
        href="/requests"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Requests
      </Link>
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {children}
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
