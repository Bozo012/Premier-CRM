import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';

import { getActiveOrgContext, getRequestById, type RequestDetail } from '@premier/db';
import { hasCapability, type OrgRole } from '@premier/shared';

import {
  ForgeBackLink,
  ForgeCard,
  ForgePage,
  ForgeSectionTitle,
  ForgeStatusPill,
} from '@/components/forge/presentation';
import { getRequestIntakePath, getRequestIntakePathLabel } from '@/lib/request-intake-flow';
import { getServerSupabase } from '@/lib/supabase-server';

import { CreateEstimateButton } from '../_components/create-estimate-button';
import { CreateJobButton } from '../_components/create-job-button';
import { MarkReviewedButton } from '../_components/mark-reviewed-button';
import { TriagePanel } from '../_components/triage-panel';
import { toForgeRequestDetailModel } from '../_lib/forge-request-view-model';

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

  const { orgId, role } = orgContextResult.data;
  const canCreateDirectWorkOrder = hasCapability(role as OrgRole, 'canCreateDirectWorkOrder');
  const canTriageRequests = hasCapability(role as OrgRole, 'canTriageRequests');

  const result = await getRequestById(supabase, { taskId, orgId });

  if (!result.success) {
    return <ErrorPage>Failed to load request: {result.error}</ErrorPage>;
  }

  const request = result.data;
  const model = toForgeRequestDetailModel(request);

  return (
    <ForgePage className="max-w-3xl gap-5 md:gap-6">
      <ForgeBackLink href="/requests">Requests</ForgeBackLink>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ForgeStatusPill tone={model.statusTone}>{model.statusLabel}</ForgeStatusPill>
          {model.priorityLabel ? (
            <ForgeStatusPill tone={model.priorityTone}>{model.priorityLabel}</ForgeStatusPill>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {model.number}
          </span>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{model.title}</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Received {model.ageLabel}
          </p>
        </div>
      </header>

      <ForgeCard className="space-y-2">
        <ForgeSectionTitle>Customer concern</ForgeSectionTitle>
        <p className="text-base font-semibold leading-relaxed">{model.description}</p>
        {model.serviceLine ? <p className="text-sm text-muted-foreground">{model.serviceLine}</p> : null}
      </ForgeCard>

      <ForgeCard className="space-y-3">
        <ForgeSectionTitle>Customer and property</ForgeSectionTitle>
        <div>
          <p className="font-bold">
            {model.customerHref ? (
              <Link href={model.customerHref} className="underline-offset-2 hover:underline">
                {model.contactName}
              </Link>
            ) : (
              model.contactName
            )}
          </p>
          {model.propertyAddress ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {model.propertyHref ? (
                <Link href={model.propertyHref} className="underline-offset-2 hover:text-foreground hover:underline">
                  {model.propertyAddress}
                </Link>
              ) : (
                model.propertyAddress
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {model.phone ? (
            <a href={`tel:${model.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {model.phone}
            </a>
          ) : null}
          {model.email ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {model.email}
            </span>
          ) : null}
        </div>
      </ForgeCard>

      <ForgeCard>
        <TriagePanel
          requestId={request.id}
          triageDecision={request.triageDecision}
          triageReason={request.triageReason}
          triagedAt={request.triagedAt}
          triageCorrectedFrom={request.triageCorrectedFrom}
          triageCorrectionReason={request.triageCorrectionReason}
          estimateId={request.estimateId}
          jobId={request.jobId}
          siteVisitId={request.siteVisitId}
        />
      </ForgeCard>

      <ActionsCard
        request={request}
        canCreateDirectWorkOrder={canCreateDirectWorkOrder}
        canTriageRequests={canTriageRequests}
      />
    </ForgePage>
  );
}

function ActionsCard({
  request,
  canCreateDirectWorkOrder,
  canTriageRequests,
}: {
  request: RequestDetail;
  canCreateDirectWorkOrder: boolean;
  canTriageRequests: boolean;
}) {
  const isReviewed = request.status !== 'new';
  const hasEstimate = !!request.estimateId;
  const hasJob = !!request.jobId;
  const canStartFlow = !hasEstimate && !hasJob && !!request.customerId && !!request.property;
  const intakePathLabel = getRequestIntakePathLabel(
    getRequestIntakePath({ estimateId: request.estimateId, jobId: request.jobId })
  );

  return (
    <ForgeCard className="space-y-3">
      <ForgeSectionTitle>Actions</ForgeSectionTitle>
      <div className="flex flex-wrap gap-2">
        {intakePathLabel ? (
          <span className="inline-flex min-h-9 items-center rounded-xl border bg-muted/40 px-3 text-sm font-bold">
            {intakePathLabel}
          </span>
        ) : null}

        {request.siteVisitId ? (
          <Link
            href={`/site-visits/${request.siteVisitId}`}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            Open site visit →
          </Link>
        ) : hasEstimate ? (
          <Link
            href={`/estimates/${request.estimateId}`}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            Open estimate →
          </Link>
        ) : hasJob ? (
          <Link
            href={`/jobs/${request.jobId}`}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            Open work order →
          </Link>
        ) : (
          <>
            {canStartFlow ? <CreateEstimateButton requestId={request.id} /> : null}
            {canStartFlow && canCreateDirectWorkOrder ? <CreateJobButton requestId={request.id} /> : null}
          </>
        )}

        {!isReviewed && canTriageRequests ? <MarkReviewedButton taskId={request.id} /> : null}
      </div>

      {!hasEstimate && !hasJob && canStartFlow ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <p className="font-bold text-foreground">Site-visit path</p>
            <p className="mt-1">Use triage for work that needs inspection before pricing.</p>
            <p className="mt-1">Request → site visit → inspection → estimate.</p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <p className="font-bold text-foreground">Direct work path</p>
            <p className="mt-1">Owner/admin only, for already-authorized work.</p>
            <p className="mt-1">Request → job → schedule work.</p>
          </div>
        </div>
      ) : null}

      {!hasEstimate && !request.property && request.customerId ? (
        <p className="text-xs text-muted-foreground">
          A property must be linked before starting either path.{' '}
          <Link href={`/customers/${request.customerId}`} className="text-foreground underline-offset-2 hover:underline">
            Go to customer record →
          </Link>
        </p>
      ) : null}
    </ForgeCard>
  );
}

function ErrorPage({ children }: { children: React.ReactNode }) {
  return (
    <ForgePage className="max-w-2xl gap-5">
      <ForgeBackLink href="/requests">Requests</ForgeBackLink>
      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {children}
      </p>
    </ForgePage>
  );
}
