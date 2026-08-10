// Layer 2 adapter — maps real `listJobs` results (packages/db/queries/
// jobs.ts) plus a real per-job lead-technician lookup into the Base44-exact
// JobsList presentation's view-model shape (ported from Forge-Base44-UX @
// 497d0693 — src/contracts/jobs.ts's JobsListViewModel/JobSummary/JobFilter).
//
// PROGRESS-SOURCE DECISION (see docs/ux/base44-exact-jobs-calendar-report.md
// for the full audit): `job_phases` exists in the schema and is already
// queried/returned by getJobById as `JobDetail.phases`, but a direct count
// against the live premier-crm-e2e database
// (`select count(*) from job_phases`) returned 0 rows, and no UI anywhere in
// this codebase creates or edits a phase. Phases are real schema, but not a
// real, populated, meaningfully-used progress signal today — deriving
// "N of M phases complete" from an always-empty table would fabricate
// progress via a technically-real-looking but practically-fictional
// division. Per this slice's explicit instruction, progress is instead
// derived from `job.status` (the real `job_status` lifecycle enum), which
// every job genuinely has.
import type { JobListItem } from '@premier/db';

export type JobStage = 'scheduled' | 'in_progress' | 'on_hold' | 'completed';

export interface JobRowModel {
  id: string;
  number: string;
  title: string;
  customerName: string;
  propertyName: string;
  stage: JobStage;
  stageLabel: string;
  priority: 'low' | 'medium' | 'high';
  priorityLabel: string;
  assignedTechnician: string | null;
  dueDate: string;
  progress: number;
  origin: 'manual' | 'from-quote' | 'from-request' | null;
  status: string;
}

export interface JobsListFilter {
  id: string;
  label: string;
  count: number;
}

export interface JobsListModel {
  jobs: JobRowModel[];
  filters: JobsListFilter[];
  total: number;
}

/**
 * job_status -> a display "stage" bucket + 0-100 progress percentage.
 * Every real status maps to exactly one bucket/percentage; nothing here is
 * randomized or fabricated per-job — two jobs in the same status always show
 * the same progress, which is the honest ceiling of what a status-derived
 * (not checklist-derived) progress bar can promise.
 */
const STATUS_PROGRESS: Record<string, { stage: JobStage; percent: number }> = {
  lead: { stage: 'on_hold', percent: 0 },
  site_visit_scheduled: { stage: 'on_hold', percent: 5 },
  quoted: { stage: 'on_hold', percent: 10 },
  approved: { stage: 'scheduled', percent: 20 },
  scheduled: { stage: 'scheduled', percent: 35 },
  in_progress: { stage: 'in_progress', percent: 65 },
  on_hold: { stage: 'on_hold', percent: 65 },
  completed: { stage: 'completed', percent: 100 },
  invoiced: { stage: 'completed', percent: 100 },
  paid: { stage: 'completed', percent: 100 },
  cancelled: { stage: 'on_hold', percent: 0 },
};

export function deriveJobProgress(status: string): { stage: JobStage; percent: number } {
  return STATUS_PROGRESS[status] ?? { stage: 'scheduled', percent: 0 };
}

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => (part[0] ?? '').toUpperCase() + part.slice(1))
    .join(' ');
}

function priorityBucket(priority: string): { priority: JobRowModel['priority']; label: string } {
  if (priority === 'emergency' || priority === 'high') return { priority: 'high', label: formatEnumLabel(priority) };
  if (priority === 'low') return { priority: 'low', label: 'Low' };
  return { priority: 'medium', label: formatEnumLabel(priority) };
}

function formatShortAddress(property: JobListItem['property']): string {
  if (!property) return 'Unknown property';
  return property.addressLine1;
}

function formatDueDate(value: string | null): string {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function deriveJobOrigin(job: {
  origin_quote_id: string | null;
  origin_estimate_id: string | null;
  origin_request_id: string | null;
}): JobRowModel['origin'] {
  if (job.origin_quote_id || job.origin_estimate_id) return 'from-quote';
  if (job.origin_request_id) return 'from-request';
  return 'manual';
}

export function toJobRowModel(item: JobListItem, leadName: string | null): JobRowModel {
  const { stage, percent } = deriveJobProgress(item.job.status);
  const { priority, label: priorityLabel } = priorityBucket(item.job.priority);

  return {
    id: item.job.id,
    number: item.job.job_number || 'No job number',
    title: item.job.title.trim() || 'Untitled job',
    customerName: item.customer?.displayName ?? 'Unknown customer',
    propertyName: formatShortAddress(item.property),
    stage,
    stageLabel: formatEnumLabel(item.job.status),
    priority,
    priorityLabel,
    assignedTechnician: leadName,
    dueDate: formatDueDate(item.nextScheduledAt),
    progress: percent,
    origin: deriveJobOrigin(item.job),
    status: item.job.status,
  };
}

const FILTER_DEFS: Array<{ id: string; label: string; statuses: string[] }> = [
  { id: 'all', label: 'All jobs', statuses: [] },
  { id: 'scheduled', label: 'Scheduled', statuses: ['approved', 'scheduled'] },
  { id: 'in_progress', label: 'In progress', statuses: ['in_progress'] },
  { id: 'on_hold', label: 'On hold', statuses: ['on_hold', 'lead', 'site_visit_scheduled', 'quoted', 'cancelled'] },
  { id: 'completed', label: 'Completed', statuses: ['completed', 'invoiced', 'paid'] },
];

const VALID_FILTER_IDS = FILTER_DEFS.map((def) => def.id);

export function isValidJobsFilterId(value: string): boolean {
  return VALID_FILTER_IDS.includes(value);
}

/** Statuses a list filter maps to, for the real server-side `listJobs` query — never client-side filtering. */
export function statusesForFilter(filterId: string): string[] {
  return FILTER_DEFS.find((def) => def.id === filterId)?.statuses ?? [];
}

/**
 * `allStatuses` is every job's real `status` value org-wide (a plain
 * `select('status')`, not the current filtered/paged fetch) so filter-chip
 * counts reflect the whole org, not just the currently-visible filtered
 * page — matching what the count badge implies.
 */
export function buildJobsListModel(
  items: JobListItem[],
  leadNameByJobId: Map<string, string>,
  total: number,
  allStatuses: string[]
): JobsListModel {
  const jobs = items.map((item) => toJobRowModel(item, leadNameByJobId.get(item.job.id) ?? null));

  const filters: JobsListFilter[] = FILTER_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    count: def.id === 'all' ? allStatuses.length : allStatuses.filter((status) => def.statuses.includes(status)).length,
  }));

  return { jobs, filters, total };
}
