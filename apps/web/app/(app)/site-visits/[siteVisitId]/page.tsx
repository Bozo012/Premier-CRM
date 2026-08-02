import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createServiceClient, getActiveOrgContext, getSiteVisitById } from '@premier/db';
import type { InspectionFieldDefinition } from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

import { ScheduleForm } from '../_components/schedule-form';
import { LifecycleButtons } from '../_components/lifecycle-buttons';
import { InspectionForm } from '../_components/inspection-form';
import { GenerateEstimateButton } from '../_components/generate-estimate-button';

interface SiteVisitDetailPageProps {
  params: Promise<{ siteVisitId: string }>;
}

export default async function SiteVisitDetailPage({ params }: SiteVisitDetailPageProps) {
  const { siteVisitId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/site-visits/${siteVisitId}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/today');
  }

  const serviceClient = createServiceClient();
  const result = await getSiteVisitById(serviceClient, siteVisitId);

  if (!result.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6">
        <BackLink requestId={null} />
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error === 'NOT_FOUND' ? 'Site visit not found.' : `Failed to load site visit: ${result.error}`}
        </p>
      </main>
    );
  }

  const visit = result.data;
  const fieldDefinitions = visit.fieldDefinitions as InspectionFieldDefinition[];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6">
      <BackLink requestId={visit.serviceRequestId} />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={visit.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{visit.serviceRequestTitle}</h1>
        <p className="text-sm text-muted-foreground">{visit.customerDisplayName}</p>
      </header>

      {visit.generatedEstimateId ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Estimate generated.{' '}
          <Link href={`/estimates/${visit.generatedEstimateId}`} className="font-medium underline underline-offset-2">
            View estimate →
          </Link>
        </div>
      ) : null}

      <section className="space-y-3 rounded-md border bg-background p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Appointment</h2>
        {visit.activeAppointment ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {formatDateTime(visit.activeAppointment.scheduledStart)} – {formatDateTime(visit.activeAppointment.scheduledEnd)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not yet scheduled.</p>
        )}
        {visit.status === 'awaiting_scheduling' || visit.status === 'scheduled' ? (
          <ScheduleForm
            siteVisitId={visit.id}
            mode={visit.status === 'scheduled' ? 'reschedule' : 'schedule'}
            currentAppointmentId={visit.activeAppointment?.id ?? null}
          />
        ) : null}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <LifecycleButtons siteVisitId={visit.id} status={visit.status} />
      </section>

      {visit.status === 'in_progress' || visit.status === 'completed' ? (
        <section className="space-y-3 rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inspection findings</h2>
          <InspectionForm
            siteVisitId={visit.id}
            fieldDefinitions={fieldDefinitions}
            initialResponses={visit.inspectionResponses ?? {}}
            readOnly={visit.status === 'completed'}
          />
        </section>
      ) : null}

      {visit.status === 'completed' && !visit.generatedEstimateId ? (
        <GenerateEstimateButton siteVisitId={visit.id} />
      ) : null}
    </main>
  );
}

function BackLink({ requestId }: { requestId: string | null }) {
  return (
    <Link
      href={requestId ? `/requests/${requestId}` : '/requests'}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      ← Back to request
    </Link>
  );
}

const STATUS_COLORS: Record<string, string> = {
  awaiting_scheduling: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')}
    </span>
  );
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
