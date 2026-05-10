import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getJobById } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

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

  const result = await getJobById(supabase, {
    jobId,
    orgId: membership.org_id,
  });

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

  const { category, customer, job, property } = result.data;

  return (
    <PageShell>
      <header className="space-y-3">
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
          label="Financial snapshot"
          value={formatMoney(job.quoted_total)}
          helper={`Invoiced ${formatMoney(job.invoiced_total)} · Paid ${formatMoney(job.paid_total)}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Core job info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <DetailRow label="Closed reason" value={job.closed_reason || 'Not closed'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reserved for next phases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Quote, invoice, time tracking, and capture attachments will land here next.</p>
            <p>This pass keeps the job detail page read-only and focused on core job context.</p>
          </CardContent>
        </Card>
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

function WarningPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
