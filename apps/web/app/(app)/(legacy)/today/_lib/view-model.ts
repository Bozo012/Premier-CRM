// ============================================================================
// ADAPTER / VIEW-MODEL LAYER (Layer 2 — Forge V1.1 Today redesign)
// ============================================================================
// Pure, side-effect-free functions that reshape data already returned by
// Layer 1 (packages/db queries — getActiveOrgContext, getTodayActionItems,
// getTodayQuoteActivity, getTodaySiteVisits, getTodayInvoicesNeedingActionCount)
// into plain props the Layer 3 presentation components can render directly.
//
// This layer performs NO Supabase/network/database access, and makes NO
// authorization, capability, or workflow-relevance decisions — every such
// decision was already made in Layer 1 and by RLS before any of this code
// runs. The one workflow-relevance rule that used to live here (in the
// Base44 compatibility spike's version of this file — "is a quote-accepted
// activity row still actionable") has been corrected: it now lives in
// packages/db/queries/today-actions.ts's getTodayQuoteActivity(), alongside
// getTodayActionItems(), which is where a workflow decision belongs. This
// file only sorts, labels, and groups what Layer 1 already decided.
import type { BoardJob, BoardSiteVisit, TodayActionItem, TodaySiteVisit } from '@premier/db';

export function sortActionItems(items: TodayActionItem[]): TodayActionItem[] {
  return [...items].sort((a, b) => {
    const aTime =
      a.kind === 'new_request'
        ? a.submittedAt
        : a.kind === 'pricing_review_requested'
          ? a.submittedAt
          : a.kind === 'create_quote'
            ? a.approvedAt
            : a.createdAt;
    const bTime =
      b.kind === 'new_request'
        ? b.submittedAt
        : b.kind === 'pricing_review_requested'
          ? b.submittedAt
          : b.kind === 'create_quote'
            ? b.approvedAt
            : b.createdAt;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

export function formatScheduledTime(value: string | null): string {
  if (!value) return 'Anytime';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export interface ScheduleEntry {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  timeLabel: string;
  kind: 'job' | 'site_visit';
}

export type KanbanStage = 'scheduled' | 'in_progress' | 'on_hold' | 'completed';

/**
 * How far into the future a still-'scheduled' job/site visit stays on the
 * operational board before it's considered too far out to be current work.
 * No existing repository decision on this exact question was found (see
 * docs/implementation/today-kanban-board-semantics.md) — 7 days is the
 * documented default, not a rediscovered pre-existing constant. In_progress
 * and on_hold records are never subject to this cut (regardless of how
 * long ago they started); it only bounds the 'scheduled' bucket.
 */
export const BOARD_SCHEDULED_HORIZON_DAYS = 7;

export interface KanbanCardModel {
  assignment?: string;
  customer: string;
  flag?: string;
  href: string;
  id: string;
  priority: 'low' | 'normal' | 'high';
  property: string;
  stage: KanbanStage;
  timeLabel?: string;
  title: string;
}

/** Merges today's jobs and today's site visits into one chronological
 * schedule — pure presentation ordering, not a workflow decision (both
 * lists were already independently, correctly scoped by Layer 1). */
export function buildTodaySchedule(
  jobs: Array<{ id: string; title: string; scheduled_start: string | null }>,
  siteVisits: TodaySiteVisit[]
): ScheduleEntry[] {
  const jobEntries: ScheduleEntry[] = jobs.map((job) => ({
    id: job.id,
    href: `/jobs/${job.id}`,
    title: job.title,
    subtitle: null,
    timeLabel: formatScheduledTime(job.scheduled_start),
    kind: 'job',
  }));

  const visitEntries: ScheduleEntry[] = siteVisits.map((visit) => ({
    id: visit.appointmentId,
    href: `/site-visits/${visit.siteVisitId}`,
    title: visit.contactName ?? 'Site visit',
    subtitle: visit.propertyAddress,
    timeLabel: formatScheduledTime(visit.scheduledStart),
    kind: 'site_visit',
  }));

  return [...jobEntries, ...visitEntries].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
}

/**
 * Operational board — real lifecycle stage per record, not a hard-coded
 * assumption, and NOT limited to today's scheduled_start (that's what
 * buildTodaySchedule/getTodaySiteVisits are for). jobs/siteVisits are
 * expected to already come from getBoardJobs()/getBoardSiteVisits(), which
 * fetch every currently-relevant record (any in_progress/on_hold
 * regardless of date, any completed within a bounded recent window) —
 * this function's only remaining job is applying the 'scheduled' bucket's
 * future-horizon cut and mapping each record's real status to a
 * KanbanStage. `now` is a parameter (not `new Date()` inline) so the
 * horizon cut is deterministically unit-testable.
 */
export function buildKanbanCards(jobs: BoardJob[], siteVisits: BoardSiteVisit[], now: Date = new Date()): KanbanCardModel[] {
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + BOARD_SCHEDULED_HORIZON_DAYS);

  const jobCards: KanbanCardModel[] = jobs
    .filter((job) => job.status !== 'scheduled' || withinScheduledHorizon(job.scheduledStart, horizonEnd))
    .map((job) => ({
      customer: resolveCustomerName(job.customers),
      flag: job.priority === 'emergency' ? 'Emergency' : job.priority === 'high' ? 'High priority' : undefined,
      href: `/jobs/${job.id}`,
      id: `job-${job.id}`,
      priority: job.priority === 'emergency' ? 'high' : job.priority,
      property: resolvePropertyName(job.properties),
      stage: job.status,
      timeLabel: job.scheduledStart ? formatScheduledTime(job.scheduledStart) : undefined,
      title: job.title,
    }));

  const visitCards: KanbanCardModel[] = siteVisits
    .filter((visit) => visit.status !== 'scheduled' || withinScheduledHorizon(visit.scheduledStart, horizonEnd))
    .map((visit) => ({
      assignment: 'Site visit',
      customer: visit.contactName ?? 'Customer',
      href: `/site-visits/${visit.siteVisitId}`,
      id: `visit-${visit.siteVisitId}`,
      priority: 'normal',
      property: visit.propertyAddress ?? 'Property',
      stage: visit.status,
      // Completed cards show when the work finished, not the original
      // (now-superseded) scheduled time.
      timeLabel:
        visit.status === 'completed'
          ? visit.completedAt
            ? formatScheduledTime(visit.completedAt)
            : undefined
          : visit.scheduledStart
            ? formatScheduledTime(visit.scheduledStart)
            : undefined,
      title: visit.serviceTitle,
    }));

  return [...jobCards, ...visitCards].sort((left, right) => {
    const leftTime = left.timeLabel ?? '99:99';
    const rightTime = right.timeLabel ?? '99:99';
    return leftTime.localeCompare(rightTime);
  });
}

/** No scheduled_start at all still counts as "within horizon" — absence of a
 * date isn't evidence it's far away, and hiding it would just make it
 * silently vanish, the exact defect class this fix addresses. */
function withinScheduledHorizon(scheduledStart: string | null, horizonEnd: Date): boolean {
  if (!scheduledStart) return true;
  return new Date(scheduledStart).getTime() < horizonEnd.getTime();
}

function resolveCustomerName(customer: BoardJob['customers']): string {
  if (!customer) return 'Customer';
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return fullName || 'Customer';
}

function resolvePropertyName(property: BoardJob['properties']): string {
  if (!property) return 'Property';
  return `${property.address_line_1}, ${property.city}, ${property.state}`;
}

export interface SnapshotItem {
  helper: string;
  href: string;
  label: string;
  value: string;
}

/** Operational, actionable counts only — no accounting totals/revenue
 * (Kevin decision, docs/ux/forge-v1.1-ux-modernization-plan.md §10 item 4,
 * resolved: actionable counts, not accounting totals). */
export function buildSnapshotItems(counts: {
  newRequestCount: number;
  todayScheduleCount: number;
  invoicesNeedingActionCount: number;
}): SnapshotItem[] {
  return [
    { label: 'New requests', value: String(counts.newRequestCount), helper: 'Unreviewed website inquiries', href: '/requests' },
    { label: "Today's work", value: String(counts.todayScheduleCount), helper: 'Jobs and site visits scheduled today', href: '/jobs' },
    { label: 'Invoices needing action', value: String(counts.invoicesNeedingActionCount), helper: 'Sent, viewed, partial, or overdue', href: '/invoices' },
  ];
}

export function deriveGreeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function deriveFirstName(fullName: string | null, email: string | null): string {
  const fromProfile = fullName ? fullName.split(' ')[0] : null;
  const fromEmail = email ? email.split('@')[0] : null;
  return fromProfile ?? fromEmail ?? 'there';
}
