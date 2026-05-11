import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getRequestById, type RequestDetail } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { ConvertToJobButton } from '../_components/convert-to-job-button';
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

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <ErrorPage>
        Could not load your organization membership: {membershipError.message}
      </ErrorPage>
    );
  }

  if (!membership?.org_id) {
    return <ErrorPage>You don&apos;t have an active organization membership yet.</ErrorPage>;
  }

  const result = await getRequestById(supabase, { taskId, orgId: membership.org_id });

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
          {request.jobId ? (
            <Link
              href={`/jobs/${request.jobId}`}
              className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Job created
            </Link>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{request.title}</h1>
        <p className="text-sm text-muted-foreground">
          Received {formatDateTime(request.createdAt)}
        </p>
      </header>

      <div className="space-y-4">
        <CustomerCard request={request} />
        <DescriptionCard request={request} />
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
  if (!request.customer) return null;
  const { customer } = request;

  return (
    <section className="rounded-md border bg-background p-4 space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer
      </h2>
      <p className="font-medium">
        <Link
          href={`/customers/${customer.id}`}
          className="underline-offset-2 hover:underline"
        >
          {customer.displayName}
        </Link>
      </p>
      {customer.phonePrimary ? (
        <p className="text-sm text-muted-foreground">{customer.phonePrimary}</p>
      ) : null}
      {customer.email ? (
        <p className="text-sm text-muted-foreground">{customer.email}</p>
      ) : null}
    </section>
  );
}

function DescriptionCard({ request }: { request: RequestDetail }) {
  const parsed = parseDescription(request.description);

  return (
    <section className="rounded-md border bg-background p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Request Details
      </h2>

      {parsed.fields.length > 0 ? (
        <dl className="space-y-1">
          {parsed.fields.map(({ key, value }) => (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="font-medium text-foreground min-w-[110px]">{key}</dt>
              <dd className="text-muted-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {parsed.body ? (
        <div className="space-y-1">
          {parsed.fields.length > 0 ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Message
            </p>
          ) : null}
          <p className="text-sm text-foreground whitespace-pre-wrap">{parsed.body}</p>
        </div>
      ) : null}

      {parsed.photos.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Photos
          </p>
          <ul className="space-y-1">
            {parsed.photos.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline-offset-2 hover:underline break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!parsed.fields.length && !parsed.body && !parsed.photos.length ? (
        <p className="text-sm text-muted-foreground">No description provided.</p>
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
  return (
    <section className="rounded-md border bg-background p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Actions
      </h2>

      <div className="flex flex-wrap gap-3">
        {request.jobId ? (
          <Link
            href={`/jobs/${request.jobId}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Open job →
          </Link>
        ) : (
          <ConvertToJobButton taskId={request.id} />
        )}

        {request.status !== 'done' && request.status !== 'cancelled' ? (
          <MarkReviewedButton taskId={request.id} />
        ) : null}
      </div>

      {!request.jobId && !request.property && request.customerId ? (
        <p className="text-xs text-muted-foreground">
          A property must be linked to the customer before converting to a job.{' '}
          <Link
            href={`/customers/${request.customerId}`}
            className="underline-offset-2 hover:underline text-foreground"
          >
            Go to customer record →
          </Link>
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
    open: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-blue-50 text-blue-700',
    done: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500',
    snoozed: 'bg-purple-50 text-purple-700',
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
    urgent: 'bg-red-50 text-red-700',
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

interface ParsedDescription {
  fields: Array<{ key: string; value: string }>;
  body: string;
  photos: string[];
}

/**
 * Parse the structured description block written by buildTaskDescription.
 * Lines at the top that match "Key: Value" are extracted as fields.
 * Everything after the blank line separator is the body.
 * Photo URLs after "Photos:" are extracted separately.
 */
function parseDescription(description: string | null): ParsedDescription {
  if (!description) return { fields: [], body: '', photos: [] };

  const FIELD_KEYS = new Set(['From', 'Email', 'Phone', 'Property type', 'Timeline', 'Service']);
  const lines = description.split('\n');

  const fields: Array<{ key: string; value: string }> = [];
  const bodyLines: string[] = [];
  const photos: string[] = [];
  let inPhotos = false;
  let pastHeader = false;

  for (const line of lines) {
    if (!pastHeader) {
      if (line.trim() === '') {
        pastHeader = true;
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (FIELD_KEYS.has(key) && value) {
          fields.push({ key, value });
          continue;
        }
      }
      pastHeader = true;
    }

    if (line.trim() === 'Photos:') {
      inPhotos = true;
      continue;
    }

    if (inPhotos) {
      const url = line.trim().replace(/^-\s*/, '');
      if (url) photos.push(url);
    } else {
      bodyLines.push(line);
    }
  }

  return { fields, body: bodyLines.join('\n').trim(), photos };
}

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
