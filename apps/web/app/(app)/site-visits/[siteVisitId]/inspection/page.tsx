import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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

import { GenerateEstimateButton } from '../../_components/generate-estimate-button';
import { InspectionForm } from '../../_components/inspection-form';
import { StartInspectionButton } from '../../_components/start-inspection-button';
import {
  inspectionDetailProgress,
  siteVisitStatusLabel,
  siteVisitStatusTone,
} from '../../_lib/forge-site-visit-view-model';

export const metadata: Metadata = { title: 'Site Visit Inspection' };

interface SiteVisitInspectionPageProps {
  params: Promise<{ siteVisitId: string }>;
}

export default async function SiteVisitInspectionPage({ params }: SiteVisitInspectionPageProps) {
  const { siteVisitId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/site-visits/${siteVisitId}/inspection`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/today');
  }

  const serviceClient = createServiceClient();
  const result = await getSiteVisitById(serviceClient, siteVisitId, orgContextResult.data.orgId);

  if (!result.success) {
    return (
      <ForgePage className="max-w-3xl gap-5">
        <ForgeBackLink href="/site-visits">Site Visits</ForgeBackLink>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error === 'NOT_FOUND' ? 'Site visit not found.' : `Failed to load inspection: ${result.error}`}
        </p>
      </ForgePage>
    );
  }

  const visit = result.data;
  const fieldDefinitions = visit.fieldDefinitions as InspectionFieldDefinition[];
  const progress = inspectionDetailProgress(visit.inspectionResponses ?? {}, fieldDefinitions);

  return (
    <ForgePage className="max-w-4xl gap-5 md:gap-6">
      <ForgeBackLink href={`/site-visits/${visit.id}`}>Back to site visit</ForgeBackLink>

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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Inspection — {visit.serviceRequestTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {visit.customerDisplayName}
            {visit.activeAppointment ? ` · ${formatDateTime(visit.activeAppointment.scheduledStart)}` : ''}
          </p>
        </div>
      </header>

      <ForgeCard className="space-y-3">
        <ForgeSectionTitle>Progress</ForgeSectionTitle>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">
              {progress.completed}/{progress.total} fields complete
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
      </ForgeCard>

      {visit.status === 'scheduled' ? (
        <ForgeCard className="space-y-3">
          <ForgeSectionTitle>Start inspection</ForgeSectionTitle>
          <p className="text-sm text-muted-foreground">
            Starting inspection moves the site visit through the guarded lifecycle action before any findings can be saved.
          </p>
          <StartInspectionButton siteVisitId={visit.id} />
        </ForgeCard>
      ) : null}

      {visit.status === 'in_progress' || visit.status === 'completed' ? (
        <ForgeCard className="space-y-3">
          <ForgeSectionTitle>{visit.status === 'completed' ? 'Inspection findings' : 'Inspection workflow'}</ForgeSectionTitle>
          <InspectionForm
            siteVisitId={visit.id}
            fieldDefinitions={fieldDefinitions}
            initialResponses={visit.inspectionResponses ?? {}}
            readOnly={visit.status === 'completed'}
            returnToVisitOnComplete
          />
        </ForgeCard>
      ) : null}

      {visit.status === 'completed' && !visit.generatedEstimateId ? (
        <GenerateEstimateButton siteVisitId={visit.id} />
      ) : null}

      {visit.generatedEstimateId ? (
        <Link
          href={`/estimates/${visit.generatedEstimateId}`}
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
        >
          Open estimate →
        </Link>
      ) : null}
    </ForgePage>
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
