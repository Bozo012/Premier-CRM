import type { SiteVisitDetail, SiteVisitListItem } from '@premier/db';
import type { InspectionFieldDefinition } from '@premier/shared';
import type { StatusTone } from '@/components/ui/status-pill';

export interface ForgeSiteVisitSummary {
  id: string;
  visitNumber: string;
  title: string;
  customerName: string;
  propertyAddress: string | null;
  scheduledDate: string;
  scheduledTime: string;
  statusLabel: string;
  statusTone: StatusTone;
  progressLabel: string | null;
  progressPercent: number | null;
  nextActionLabel: string | null;
}

export function toForgeSiteVisitSummary(item: SiteVisitListItem): ForgeSiteVisitSummary {
  const progress = inspectionProgress(item.inspectionResponseCount, item.inspectionFieldCount);
  return {
    id: item.id,
    visitNumber: shortVisitNumber(item.id),
    title: item.serviceRequestTitle,
    customerName: item.customerDisplayName,
    propertyAddress: item.propertyAddress,
    scheduledDate: item.activeAppointment ? formatDate(item.activeAppointment.scheduledStart) : 'Unscheduled',
    scheduledTime: item.activeAppointment ? formatTimeRange(item.activeAppointment.scheduledStart, item.activeAppointment.scheduledEnd) : 'Needs scheduling',
    statusLabel: siteVisitStatusLabel(item.status),
    statusTone: siteVisitStatusTone(item.status),
    progressLabel: progress.total > 0 ? `${progress.completed}/${progress.total} fields` : null,
    progressPercent: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null,
    nextActionLabel: nextSiteVisitActionLabel(item.status, item.generatedEstimateId),
  };
}

export function inspectionDetailProgress(
  responses: Record<string, unknown> | null,
  fieldDefinitions: InspectionFieldDefinition[]
): { completed: number; total: number; missingRequired: string[] } {
  const completed = fieldDefinitions.filter((field) => hasInspectionValue(responses?.[field.key])).length;
  const missingRequired = fieldDefinitions
    .filter((field) => field.required && !hasInspectionValue(responses?.[field.key]))
    .map((field) => field.label);

  return { completed, total: fieldDefinitions.length, missingRequired };
}

export function siteVisitDetailActions(visit: Pick<SiteVisitDetail, 'status' | 'generatedEstimateId'>): Array<{ id: string; label: string; href: string | null; kind: 'primary' | 'secondary' }> {
  if (visit.status === 'scheduled') {
    return [{ id: 'start-inspection', label: 'Start inspection', href: null, kind: 'primary' }];
  }
  if (visit.status === 'in_progress') {
    return [{ id: 'resume-inspection', label: 'Resume inspection', href: 'inspection', kind: 'primary' }];
  }
  if (visit.status === 'completed' && !visit.generatedEstimateId) {
    return [{ id: 'generate-estimate', label: 'Generate estimate', href: null, kind: 'primary' }];
  }
  if (visit.status === 'completed' && visit.generatedEstimateId) {
    return [{ id: 'open-estimate', label: 'Open estimate', href: `/estimates/${visit.generatedEstimateId}`, kind: 'primary' }];
  }
  return [];
}

export function siteVisitStatusTone(status: string): StatusTone {
  if (status === 'cancelled') return 'red';
  if (status === 'completed') return 'emerald';
  if (status === 'in_progress') return 'blue';
  if (status === 'scheduled') return 'blue';
  return 'amber';
}

export function siteVisitStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    awaiting_scheduling: 'Awaiting scheduling',
    scheduled: 'Scheduled',
    in_progress: 'Inspection in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] ?? status;
}

function inspectionProgress(completed: number, total: number): { completed: number; total: number } {
  return { completed: Math.min(completed, total), total };
}

function nextSiteVisitActionLabel(status: string, generatedEstimateId: string | null): string | null {
  if (generatedEstimateId) return 'Open estimate';
  if (status === 'awaiting_scheduling') return 'Schedule visit';
  if (status === 'scheduled') return 'Start inspection';
  if (status === 'in_progress') return 'Resume inspection';
  if (status === 'completed') return 'Generate estimate';
  return null;
}

function shortVisitNumber(id: string): string {
  return `SV-${id.slice(0, 8).toUpperCase()}`;
}

function hasInspectionValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTimeRange(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}
