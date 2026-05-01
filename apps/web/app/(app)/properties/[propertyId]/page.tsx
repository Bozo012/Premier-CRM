import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPropertyMemory } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

interface PropertyDetailPageProps {
  params: Promise<{ propertyId: string }>;
}

export default async function PropertyDetailPage({
  params,
}: PropertyDetailPageProps) {
  const { propertyId } = await params;

  if (!isUuid(propertyId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/properties/${propertyId}`)}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
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
          You don&apos;t have an active organization membership yet. Ask the
          owner to approve your account, or contact Kevin.
        </WarningPanel>
      </PageShell>
    );
  }

  const result = await getPropertyMemory(supabase, {
    orgId: membership.org_id,
    propertyId,
  });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <PageShell>
        <ErrorPanel>Failed to load property: {result.error}</ErrorPanel>
      </PageShell>
    );
  }

  const { property, allOwners, allJobs, recentPhotos, notesAndRecordings, geofence } =
    result.data;

  return (
    <PageShell>
      <header className="space-y-4">
        <div className="space-y-2">
          <BackLink owners={allOwners} />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {formatAddress(property)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[property.property_type, formatSquareFootage(property.square_footage)]
              .filter(Boolean)
              .join(' · ') || 'Property details available below'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Owners"
            value={String(allOwners.length)}
            helper={formatPrimaryOwner(allOwners)}
          />
          <StatCard
            label="Jobs on record"
            value={String(allJobs.length)}
            helper={formatMoney(sumJobTotals(allJobs))}
          />
          <StatCard
            label="Recent photos"
            value={String(recentPhotos.length)}
            helper={formatDate(recentPhotos[0]?.occurred_at)}
          />
          <StatCard
            label="Notes & recordings"
            value={String(notesAndRecordings.length)}
            helper={formatDate(notesAndRecordings[0]?.occurred_at)}
          />
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Property details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Address" value={formatAddress(property)} />
            <DetailRow
              label="Property type"
              value={formatText(property.property_type)}
            />
            <DetailRow label="Year built" value={formatNumber(property.year_built)} />
            <DetailRow
              label="Square footage"
              value={formatSquareFootage(property.square_footage)}
            />
            <DetailRow label="Stories" value={formatNumber(property.stories)} />
            <DetailRow
              label="Lot size"
              value={formatSquareFootage(property.lot_size_sqft)}
            />
            <DetailRow label="Notes" value={formatText(property.notes)} />
            <ExternalLinkRow
              label="Street view"
              href={property.street_view_url}
              text="Open street view"
            />
            <ExternalLinkRow
              label="Satellite image"
              href={property.satellite_image_url}
              text="Open satellite image"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access & geofence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Gate code" value={formatText(property.gate_code)} />
            <DetailRow
              label="Access notes"
              value={formatText(property.access_notes)}
            />
            <DetailRow
              label="Parking notes"
              value={formatText(property.parking_notes)}
            />
            <DetailRow
              label="Hazards"
              value={property.hazards?.join(', ') || 'None recorded'}
            />
            <DetailRow
              label="Auto tracking"
              value={property.hide_from_auto_tracking ? 'Hidden' : 'Enabled'}
            />
            <DetailRow
              label="Geofence radius"
              value={
                formatMeters(geofence?.radius_meters ?? property.geofence_radius_m) ||
                'Not configured'
              }
            />
            <DetailRow
              label="Dwell / absence"
              value={formatDwellSettings(
                geofence?.min_dwell_seconds,
                geofence?.min_absence_seconds
              )}
            />
            <DetailRow
              label="Fence source"
              value={
                geofence
                  ? geofence.auto_generated
                    ? 'Auto-generated from property'
                    : 'Manual geofence'
                  : 'No property geofence found'
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Owners & relationships</CardTitle>
          </CardHeader>
          <CardContent>
            {allOwners.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No linked owners or managers yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {allOwners.map((owner) => (
                  <li key={owner.customer.id} className="rounded-md border p-3">
                    <Link
                      href={`/customers/${owner.customer.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {resolveCustomerDisplayName(owner.customer)}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {[
                        owner.relationship || 'owner',
                        owner.is_primary ? 'Primary' : null,
                        owner.customer.phone_primary,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Job history</CardTitle>
          </CardHeader>
          <CardContent>
            {allJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No jobs tied to this property yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {allJobs.map((job) => (
                  <li key={job.id} className="rounded-md border p-3">
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {[formatStatus(job.status), job.category, formatDate(job.completed_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {job.description?.trim() ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {job.description.trim()}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-foreground">
                      {formatMoney(job.total)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent photos</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No property photos yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentPhotos.map((photo, index) => (
                  <li key={`${photo.url ?? 'photo'}-${index}`} className="rounded-md border p-3">
                    <p className="font-medium text-foreground">
                      {photo.caption?.trim() || 'Untitled photo'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[formatDate(photo.occurred_at), photo.job_id ? 'Linked to a job' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {photo.url ? (
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-sm text-foreground underline-offset-4 hover:underline"
                      >
                        Open photo
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes & recordings</CardTitle>
          </CardHeader>
          <CardContent>
            {notesAndRecordings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notes or recordings linked to this property yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {notesAndRecordings.map((item, index) => (
                  <li
                    key={`${item.type}-${item.occurred_at ?? index}`}
                    className="rounded-md border p-3"
                  >
                    <p className="font-medium text-foreground">
                      {item.title?.trim() || formatStatus(item.type)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[formatStatus(item.type), formatDate(item.occurred_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.summary?.trim() ? (
                      <p className="mt-2 text-sm text-foreground">
                        {item.summary.trim()}
                      </p>
                    ) : null}
                    {item.content_preview?.trim() ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {item.content_preview.trim()}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
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

function BackLink({
  owners,
}: {
  owners: Array<{ customer: { id: string } }>;
}) {
  const primaryOwner = owners[0]?.customer?.id;

  return (
    <Link
      href={primaryOwner ? `/customers/${primaryOwner}` : '/customers'}
      className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {primaryOwner ? 'Back to customer' : 'Back to customers'}
    </Link>
  );
}

function StatCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
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

function ExternalLinkRow({
  href,
  label,
  text,
}: {
  href: string | null;
  label: string;
  text: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-foreground underline-offset-4 hover:underline"
        >
          {text}
        </a>
      ) : (
        <p className="text-sm text-foreground">Not available</p>
      )}
    </div>
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

function resolveCustomerDisplayName(customer: {
  company_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Unnamed customer';
}

function formatAddress(property: {
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [
    property.address_line_1,
    property.address_line_2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatStatus(value: string): string {
  return value
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

function formatSquareFootage(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${new Intl.NumberFormat('en-US').format(value)} sq ft`;
}

function formatText(value: string | null | undefined): string {
  return value?.trim() || 'Not set';
}

function formatMeters(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return `${Math.round(value)}m`;
}

function formatDwellSettings(
  minDwellSeconds: number | null | undefined,
  minAbsenceSeconds: number | null | undefined
): string {
  if (!minDwellSeconds && !minAbsenceSeconds) {
    return 'Default timings';
  }

  const dwell = minDwellSeconds ? `${minDwellSeconds}s dwell` : null;
  const absence = minAbsenceSeconds ? `${minAbsenceSeconds}s absence` : null;
  return [dwell, absence].filter(Boolean).join(' · ');
}

function formatPrimaryOwner(
  owners: Array<{
    customer: {
      company_name: string | null;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    };
    is_primary: boolean | null;
  }>
): string {
  if (owners.length === 0) {
    return 'No owner linked';
  }

  const primaryOwner =
    owners.find((owner) => owner.is_primary) ??
    owners[0];

  if (!primaryOwner) {
    return 'No owner linked';
  }

  return resolveCustomerDisplayName(primaryOwner.customer);
}

function sumJobTotals(
  jobs: Array<{ total: number | null }>
): number | null {
  const values = jobs
    .map((job) => job.total)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
