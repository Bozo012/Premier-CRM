// Layer 2 adapter — maps a real JobDetail payload
// (packages/db/queries/jobs.ts:getJobById, plus source-quote/source-request
// lookups and real crew assignments) into the generic RecordDetailModel
// shape RecordDetailView renders (apps/web/components/forge-shell/
// recordDetail.types.ts), matching customers/_lib/forge-customer-detail-
// view-model.ts's established pattern.
//
// Sections deliberately NOT modeled here (quotes, invoices, deposit,
// working invoice, change orders, phase list, job logs, job photos, crew)
// stay real bespoke Cards composed alongside this model on the page — see
// docs/ux/base44-exact-jobs-calendar-report.md for why: those need genuine
// interactive create/mutate controls (add line item, create invoice, add
// log, upload photo, assign crew) that RecordDetailView's declarative
// section kinds (fields/related/timeline/notes/media/progress/text/lines)
// cannot express — only pure display data belongs in this model.
import type { JobAssignment, JobDetail } from '@premier/db';

import type { DetailSection, DetailTone, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

import { deriveJobProgress, deriveJobOrigin, formatEnumLabel } from './forge-jobs-view-model';

const STAGE_TONE: Record<ReturnType<typeof deriveJobProgress>['stage'], DetailTone> = {
  scheduled: 'info',
  in_progress: 'info',
  on_hold: 'warning',
  completed: 'success',
};

export interface JobSourceLink {
  id: string;
  label: string;
  sublabel: string;
  route: string;
  recordType: string;
}

export function toJobDetailModel(args: {
  detail: JobDetail;
  crew: JobAssignment[];
  sourceEstimate: { id: string; title: string | null; estimate_number: string | null } | null;
  sourceRequest: { id: string; request_number: string | null; service_title: string | null } | null;
}): RecordDetailModel {
  const { detail, crew, sourceEstimate, sourceRequest } = args;
  const { job, customer, property, category } = detail;
  const { stage, percent } = deriveJobProgress(job.status);
  const lead = crew.find((c) => c.isLead) ?? null;
  const origin = deriveJobOrigin(job);

  const scheduleFields: DetailSection = {
    kind: 'fields',
    id: 'schedule',
    title: 'Schedule, crew & access',
    fields: [
      { label: 'Scheduled window', value: formatWindow(job.scheduled_start, job.scheduled_end) },
      { label: 'Actual window', value: formatWindow(job.actual_start, job.actual_end) },
      { label: 'Estimated duration', value: formatDuration(job.estimated_duration_minutes) },
      { label: 'Priority', value: formatEnumLabel(job.priority) },
      { label: 'Service category', value: category?.name ?? 'Not set' },
      { label: 'Lead technician', value: lead ? lead.displayName : 'Unassigned', tone: lead ? undefined : 'warning' },
      {
        label: 'Assigned crew',
        value: crew.length > 0 ? crew.map((c) => c.displayName).join(', ') : 'No crew assigned',
      },
      { label: 'Gate code', value: property?.gateCode ?? 'Not set', visibility: 'internal' },
      { label: 'Access notes', value: property?.accessNotes?.trim() || 'No access notes', visibility: 'internal' },
      { label: 'Parking notes', value: property?.parkingNotes?.trim() || 'No parking notes', visibility: 'internal' },
    ],
  };

  const relatedItems: { id: string; label: string; sublabel?: string; route?: string; recordType?: string }[] = [];
  if (customer) {
    relatedItems.push({ id: customer.id, label: customer.displayName, sublabel: 'Customer', route: `/customers/${customer.id}`, recordType: 'customer' });
  }
  if (property) {
    relatedItems.push({
      id: property.id,
      label: property.addressLine1,
      sublabel: 'Property',
      route: `/properties/${property.id}`,
      recordType: 'property',
    });
  }
  const source = resolveSourceLink(job, sourceEstimate, sourceRequest);
  if (source) {
    relatedItems.push(source);
  }

  const relatedSection: DetailSection = {
    kind: 'related',
    id: 'linked',
    title: 'Related records',
    emptyMessage: 'No linked customer, property, or source yet.',
    items: relatedItems,
  };

  const sections: DetailSection[] = [
    {
      kind: 'progress',
      id: 'progress',
      title: 'Progress',
      progress: {
        percent,
        percentLabel: `${percent}%`,
        stageLabel: formatEnumLabel(job.status),
        // Honest derivation note — see the file-level comment and the
        // report's progress-source audit: job_phases exists but is
        // unpopulated/unused today, so this percentage comes from
        // job.status, not a checklist.
        explanation:
          'Forge derives this percentage from the job’s real lifecycle status, not a checklist — job_phases exists in the schema but has no populated data or UI creating phases today.',
      },
    },
    {
      kind: 'text',
      id: 'scope',
      title: 'Scope',
      body: job.description?.trim() || 'No description recorded for this job.',
      // No visibility tag: `jobs.description` has no real customer-vs-staff
      // visibility flag in the schema — tagging it "customer" or "internal"
      // would fabricate a distinction that doesn't exist in storage.
    },
    scheduleFields,
    relatedSection,
  ];

  if (job.ai_summary?.trim()) {
    sections.push({ kind: 'text', id: 'ai-summary', title: 'AI summary', body: job.ai_summary.trim(), visibility: 'internal' });
  }

  const warnings: string[] = [];
  if (crew.length > 0 && !lead) {
    warnings.push('Crew is assigned but no lead technician is set.');
  }

  return {
    recordType: 'Job',
    identity: job.job_number || 'No job number',
    title: job.title.trim() || 'Untitled job',
    statusLabel: formatEnumLabel(job.status),
    statusTone: STAGE_TONE[stage],
    backLabel: 'Back to jobs',
    contextChips: [
      customer ? { id: customer.id, label: customer.displayName, route: `/customers/${customer.id}` } : null,
      property ? { id: property.id, label: property.addressLine1, route: `/properties/${property.id}` } : null,
      { id: 'origin', label: originLabel(origin) },
    ].filter((chip): chip is { id: string; label: string; route?: string } => chip !== null),
    summaryTiles: [
      { id: 'stage', label: 'Stage', value: formatEnumLabel(job.status) },
      { id: 'priority', label: 'Priority', value: formatEnumLabel(job.priority), tone: job.priority === 'emergency' || job.priority === 'high' ? 'warning' : undefined },
      { id: 'scheduled', label: 'Scheduled', value: job.scheduled_start ? formatDateTime(job.scheduled_start) : 'Unscheduled' },
      { id: 'lead', label: 'Lead technician', value: lead ? lead.displayName : 'Unassigned', tone: lead ? undefined : 'warning' },
    ],
    warnings: warnings.length > 0 ? warnings : undefined,
    readOnlyNotice:
      job.status === 'cancelled' ? 'This job is cancelled and retained for audit history only.' : null,
    // No primaryAction/secondaryActions fabricated here — every real
    // trigger point (schedule, add log, add photo, create quote/invoice,
    // create change order, add expense, manage deposit) is a real,
    // already-wired Card/button rendered alongside this model on the page,
    // exactly like the legacy page before this port. Duplicating them as
    // RecordDetailView actionIds with no real handler would be fabricated.
    primaryAction: null,
    secondaryActions: [],
    sections,
  };
}

function resolveSourceLink(
  job: JobDetail['job'],
  sourceEstimate: { id: string; title: string | null; estimate_number: string | null } | null,
  sourceRequest: { id: string; request_number: string | null; service_title: string | null } | null
): { id: string; label: string; sublabel: string; route: string; recordType: string } | null {
  if (sourceEstimate) {
    return {
      id: sourceEstimate.id,
      label: sourceEstimate.title?.trim() || sourceEstimate.estimate_number || 'Source estimate',
      sublabel: 'Source estimate',
      route: `/estimates/${sourceEstimate.id}`,
      recordType: 'estimate',
    };
  }
  if (sourceRequest) {
    return {
      id: sourceRequest.id,
      label: sourceRequest.service_title?.trim() || sourceRequest.request_number || 'Source request',
      sublabel: 'Source request',
      route: `/requests/${sourceRequest.id}`,
      recordType: 'request',
    };
  }
  if (job.origin_quote_id) {
    return { id: job.origin_quote_id, label: 'Accepted quote', sublabel: 'Source quote', route: `/quotes/${job.origin_quote_id}`, recordType: 'quote' };
  }
  return null;
}

function originLabel(origin: ReturnType<typeof deriveJobOrigin>): string {
  if (origin === 'from-quote') return 'Created from quote';
  if (origin === 'from-request') return 'Created from request';
  return 'Manually created';
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return 'Not scheduled';
  if (start && end) return `${formatDateTime(start)} → ${formatDateTime(end)}`;
  return formatDateTime(start ?? end ?? '');
}

function formatDateTime(value: string): string {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value)
  );
}

function formatDuration(value: number | null): string {
  if (value === null) return 'Not estimated';
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (minutes === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hours}h ${minutes}m`;
}
