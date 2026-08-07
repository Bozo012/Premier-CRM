import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, MapPin } from 'lucide-react';

import { createServiceClient, getActiveOrgContext, getSiteVisitById } from '@premier/db';
import type { InspectionFieldDefinition } from '@premier/shared';

import {
  ForgeBackLink,
  ForgeCard,
  ForgePage,
  ForgeSectionTitle,
  ForgeStatusPill,
} from '@/components/forge/presentation';
import { getServerSupabase } from '@/lib/supabase-server';

import { GenerateEstimateButton } from '../_components/generate-estimate-button';
import { LifecycleButtons } from '../_components/lifecycle-buttons';
import { ScheduleForm } from '../_components/schedule-form';
import { StartInspectionButton } from '../_components/start-inspection-button';
import { SiteVisitsShell } from '../_components/site-visits-shell';
import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';
import {
  inspectionDetailProgress,
  siteVisitDetailActions,
  siteVisitStatusLabel,
  siteVisitStatusTone,
} from '../_lib/forge-site-visit-view-model';

export const metadata: Metadata = { title: 'Site Visits' };

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

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const serviceClient = createServiceClient();
  const result = await getSiteVisitById(serviceClient, siteVisitId, orgContextResult.data.orgId);

  if (!result.success) {
    return (
      <SiteVisitsShell shellData={shellData} mobileNav={mobileNav}>
        <ForgePage className="max-w-3xl gap-5">
          <ForgeBackLink href="/site-visits">Site Visits</ForgeBackLink>
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {result.error === 'NOT_FOUND' ? 'Site visit not found.' : `Failed to load site visit: ${result.error}`}
          </p>
        </ForgePage>
      </SiteVisitsShell>
    );
  }

  const visit = result.data;
  const fieldDefinitions = visit.fieldDefinitions as InspectionFieldDefinition[];
  const progress = inspectionDetailProgress(visit.inspectionResponses ?? {}, fieldDefinitions);
  const actions = siteVisitDetailActions(visit);

  return (
    <SiteVisitsShell shellData={shellData} mobileNav={mobileNav}>
    <ForgePage className="max-w-3xl gap-5 md:gap-6">
      <ForgeBackLink href="/site-visits">Site Visits</ForgeBackLink>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ForgeStatusPill tone={siteVisitStatusTone(visit.status)}>
            {siteVisitStatusLabel(visit.status)}
          </ForgeStatusPill>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            SV-{visit.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{visit.serviceRequestTitle}</h1>
          <p className="text-sm text-muted-foreground">{visit.customerDisplayName}</p>
        </div>
      </header>

      {visit.generatedEstimateId ? (
        <ForgeCard className="border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
          Estimate generated.{' '}
          <Link href={`/estimates/${visit.generatedEstimateId}`} className="font-bold underline underline-offset-2">
            View estimate →
          </Link>
        </ForgeCard>
      ) : null}

      <ForgeCard className="space-y-3">
        <ForgeSectionTitle>Appointment</ForgeSectionTitle>
        {visit.activeAppointment ? (
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {formatDateTime(visit.activeAppointment.scheduledStart)} – {formatDateTime(visit.activeAppointment.scheduledEnd)}
          </p>
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
      </ForgeCard>

      <ForgeCard className="space-y-3">
        <ForgeSectionTitle>Inspection handoff</ForgeSectionTitle>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">
              Inspection progress: {progress.completed}/{progress.total}
            </span>
            <span className="font-bold text-primary">
              {progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>

        {progress.missingRequired.length > 0 && visit.status !== 'completed' ? (
          <p className="text-xs text-muted-foreground">
            Required before completion: {progress.missingRequired.join(', ')}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            if (action.id === 'start-inspection') return <StartInspectionButton key={action.id} siteVisitId={visit.id} />;
            if (action.id === 'generate-estimate') return <GenerateEstimateButton key={action.id} siteVisitId={visit.id} />;
            if (action.href) {
              const href = action.href === 'inspection' ? `/site-visits/${visit.id}/inspection` : action.href;
              return (
                <Link
                  key={action.id}
                  href={href}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                >
                  {action.label} →
                </Link>
              );
            }
            return null;
          })}
          <LifecycleButtons siteVisitId={visit.id} status={visit.status} hideStart />
        </div>
      </ForgeCard>

      <VisitContextCard visit={visit} />

      {visit.status === 'completed' ? (
        <CompletedInspectionSummary
          responses={visit.inspectionResponses ?? {}}
          fieldDefinitions={fieldDefinitions}
        />
      ) : null}
    </ForgePage>
    </SiteVisitsShell>
  );
}

function VisitContextCard({
  visit,
}: {
  visit: {
    serviceRequestId: string;
    customerId: string;
    customerDisplayName: string;
    serviceRequestTitle: string;
    activeAppointment: { scheduledStart: string; scheduledEnd: string } | null;
  };
}) {
  return (
    <ForgeCard className="space-y-3">
      <ForgeSectionTitle>Related records</ForgeSectionTitle>
      <div className="grid gap-2 text-sm">
        <Link href={`/requests/${visit.serviceRequestId}`} className="rounded-xl border px-3 py-2 font-bold hover:bg-muted">
          Source request →
        </Link>
        <Link href={`/customers/${visit.customerId}`} className="rounded-xl border px-3 py-2 font-bold hover:bg-muted">
          {visit.customerDisplayName} →
        </Link>
      </div>
    </ForgeCard>
  );
}

function CompletedInspectionSummary({
  responses,
  fieldDefinitions,
}: {
  responses: Record<string, unknown>;
  fieldDefinitions: InspectionFieldDefinition[];
}) {
  const visibleResponses = fieldDefinitions
    .filter((field) => hasInspectionValue(responses[field.key]))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (visibleResponses.length === 0) return null;

  return (
    <ForgeCard className="space-y-3">
      <ForgeSectionTitle>Completed inspection summary</ForgeSectionTitle>
      <div className="grid gap-3">
        {visibleResponses.map((field) => (
          <div key={field.key} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {field.label}
            </p>
            <div className="mt-1 text-sm">
              <InspectionValue value={responses[field.key]} />
            </div>
          </div>
        ))}
      </div>
    </ForgeCard>
  );
}

function InspectionValue({ value }: { value: unknown }) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    return (
      <ul className="space-y-1">
        {value.map((entry, index) => (
          <li key={index} className="flex items-start gap-1">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{formatInspectionEntry(entry)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return <span>{formatInspectionEntry(value)}</span>;
}

function formatInspectionEntry(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entry]) => `${formatKey(key)}: ${String(entry)}`)
      .join(', ');
  }
  return 'Recorded';
}

function hasInspectionValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatKey(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
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
