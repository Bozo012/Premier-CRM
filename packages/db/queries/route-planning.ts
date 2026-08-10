/**
 * Route Planning dataset — Layer 1 query for the /routes dispatcher view.
 *
 * Reuses the same authoritative schedule sources Calendar/Today already use
 * (jobs.scheduled_start/scheduled_end, site_visit_appointments) rather than
 * introducing a new table. No `route_stop_order`/`sequence_number` column
 * exists anywhere (confirmed by grep across every job/site-visit/scheduling
 * migration) — this file returns scheduled-time order only; the view-model
 * layer is responsible for any additional client-side ordering.
 *
 * Two genuinely different real crew models are surfaced here, not merged:
 * jobs are crewed via job_assignments (multi-person, packages/db/queries/
 * job-assignments.ts), site visits via site_visit_appointments.assigned_
 * user_id (single person, the only real per-appointment assignment concept
 * that table has). Callers must filter each independently.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

type JobStatus = Database['public']['Enums']['job_status'];
type JobPriority = Database['public']['Enums']['job_priority'];
type SiteVisitStatus = Database['public']['Enums']['site_visit_status'];
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority'];

/** Terminal/inactive statuses excluded from every Route Planning query — the
 * one documented exclusion vs. Calendar (which shows all statuses for a
 * scheduled date; Route Planning is a dispatch view, not a historical log). */
const EXCLUDED_JOB_STATUSES: JobStatus[] = ['cancelled'];
const EXCLUDED_SITE_VISIT_STATUSES: SiteVisitStatus[] = ['cancelled'];

/** Statuses eligible to appear in the "Unscheduled" section when scheduled_start is null. */
const UNSCHEDULED_JOB_STATUSES: JobStatus[] = ['approved', 'scheduled', 'on_hold'];

export interface RouteAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface RouteJobCrewMember {
  userId: string;
  displayName: string;
  isLead: boolean;
}

export interface RouteJobRow {
  kind: 'job';
  id: string;
  jobNumber: string | null;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedDurationMinutes: number | null;
  customerId: string | null;
  customerName: string | null;
  propertyId: string | null;
  address: RouteAddress | null;
}

export interface RouteSiteVisitRow {
  kind: 'site-visit';
  id: string; // site_visits.id
  appointmentId: string | null;
  title: string;
  status: SiteVisitStatus;
  priority: ServiceRequestPriority | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string | null;
  customerName: string | null;
  propertyId: string | null;
  address: RouteAddress | null;
  assignedUserId: string | null;
}

interface JobQueryRow {
  id: string;
  job_number: string | null;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_duration_minutes: number | null;
  customer_id: string;
  property_id: string;
}

async function hydrateJobRows(client: DbClient, orgId: string, jobs: JobQueryRow[]): Promise<Result<RouteJobRow[]>> {
  if (jobs.length === 0) return ok([]);

  const customerIds = Array.from(new Set(jobs.map((j) => j.customer_id).filter(Boolean)));
  const propertyIds = Array.from(new Set(jobs.map((j) => j.property_id).filter(Boolean)));

  const [customersResult, propertiesResult] = await Promise.all([
    customerIds.length > 0
      ? client.from('customers').select('id, display_name, company_name, first_name, last_name').eq('org_id', orgId).in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length > 0
      ? client.from('properties').select('id, address_line_1, address_line_2, city, state, zip').eq('org_id', orgId).in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customersResult.error) return err(ErrorCode.DB_ERROR, customersResult.error.message);
  if (propertiesResult.error) return err(ErrorCode.DB_ERROR, propertiesResult.error.message);

  const customersById = new Map(
    (customersResult.data ?? []).map((c) => [
      c.id,
      (c.display_name?.trim() || c.company_name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer') as string,
    ])
  );
  const propertiesById = new Map((propertiesResult.data ?? []).map((p) => [p.id, p]));

  return ok(
    jobs.map((job) => {
      const property = propertiesById.get(job.property_id);
      return {
        kind: 'job',
        id: job.id,
        jobNumber: job.job_number,
        title: job.title.trim() || job.job_number || 'Untitled job',
        status: job.status,
        priority: job.priority,
        scheduledStart: job.scheduled_start,
        scheduledEnd: job.scheduled_end,
        estimatedDurationMinutes: job.estimated_duration_minutes,
        customerId: job.customer_id,
        customerName: customersById.get(job.customer_id) ?? null,
        propertyId: job.property_id,
        address: property
          ? { line1: property.address_line_1, line2: property.address_line_2, city: property.city, state: property.state, zip: property.zip }
          : null,
      };
    })
  );
}

/** Real jobs scheduled to start within [dayStart, dayEnd), excluding cancelled. */
export async function listRouteJobsForDate(
  client: DbClient,
  args: { orgId: string; dayStart: Date; dayEnd: Date }
): Promise<Result<RouteJobRow[]>> {
  const { data, error } = await client
    .from('jobs')
    .select('id, job_number, title, status, priority, scheduled_start, scheduled_end, estimated_duration_minutes, customer_id, property_id')
    .eq('org_id', args.orgId)
    .gte('scheduled_start', args.dayStart.toISOString())
    .lt('scheduled_start', args.dayEnd.toISOString())
    .not('status', 'in', `(${EXCLUDED_JOB_STATUSES.join(',')})`)
    .order('scheduled_start', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return hydrateJobRows(client, args.orgId, (data ?? []) as JobQueryRow[]);
}

/** Real active jobs with no scheduled_start at all — the "Unscheduled" section. */
export async function listUnscheduledRouteJobs(client: DbClient, args: { orgId: string }): Promise<Result<RouteJobRow[]>> {
  const { data, error } = await client
    .from('jobs')
    .select('id, job_number, title, status, priority, scheduled_start, scheduled_end, estimated_duration_minutes, customer_id, property_id')
    .eq('org_id', args.orgId)
    .is('scheduled_start', null)
    .in('status', UNSCHEDULED_JOB_STATUSES)
    .order('created_at', { ascending: false });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return hydrateJobRows(client, args.orgId, (data ?? []) as JobQueryRow[]);
}

interface SiteVisitAppointmentQueryRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  assigned_user_id: string | null;
  site_visit_id: string;
  site_visits: {
    id: string;
    status: SiteVisitStatus;
    service_requests:
      | {
          service_title: string;
          priority: ServiceRequestPriority;
          customer_id: string | null;
          property_id: string | null;
          property_address_line_1: string | null;
          property_address_line_2: string | null;
          property_city: string | null;
          property_state: string | null;
          property_zip: string | null;
          customers: { display_name: string | null; company_name: string | null; first_name: string | null; last_name: string | null } | null;
        }
      | null;
  } | null;
}

function customerNameFrom(customer: { display_name: string | null; company_name: string | null; first_name: string | null; last_name: string | null } | null): string | null {
  if (!customer) return null;
  return customer.display_name?.trim() || customer.company_name?.trim() || [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || null;
}

function toSiteVisitRow(appointmentId: string | null, siteVisitId: string, status: SiteVisitStatus, scheduledStart: string | null, scheduledEnd: string | null, assignedUserId: string | null, request: SiteVisitAppointmentQueryRow['site_visits'] extends null ? never : NonNullable<SiteVisitAppointmentQueryRow['site_visits']>['service_requests']): RouteSiteVisitRow {
  return {
    kind: 'site-visit',
    id: siteVisitId,
    appointmentId,
    title: request?.service_title ?? 'Site visit',
    status,
    priority: request?.priority ?? null,
    scheduledStart,
    scheduledEnd,
    customerId: request?.customer_id ?? null,
    customerName: customerNameFrom(request?.customers ?? null),
    propertyId: request?.property_id ?? null,
    address: request
      ? {
          line1: request.property_address_line_1,
          line2: request.property_address_line_2,
          city: request.property_city,
          state: request.property_state,
          zip: request.property_zip,
        }
      : null,
    assignedUserId,
  };
}

/** Real site visits with a scheduled appointment starting within [dayStart, dayEnd). */
export async function listRouteSiteVisitsForDate(
  client: DbClient,
  args: { orgId: string; dayStart: Date; dayEnd: Date }
): Promise<Result<RouteSiteVisitRow[]>> {
  const { data, error } = await client
    .from('site_visit_appointments')
    .select(
      `
      id, scheduled_start, scheduled_end, status, assigned_user_id, site_visit_id,
      site_visits (
        id, status,
        service_requests ( service_title, priority, customer_id, property_id, property_address_line_1, property_address_line_2, property_city, property_state, property_zip, customers ( display_name, company_name, first_name, last_name ) )
      )
    `
    )
    .eq('org_id', args.orgId)
    .eq('status', 'scheduled')
    .gte('scheduled_start', args.dayStart.toISOString())
    .lt('scheduled_start', args.dayEnd.toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as unknown as SiteVisitAppointmentQueryRow[];
  const visits = rows
    .map((row) => {
      const siteVisit = Array.isArray(row.site_visits) ? row.site_visits[0] : row.site_visits;
      if (!siteVisit || EXCLUDED_SITE_VISIT_STATUSES.includes(siteVisit.status)) return null;
      const request = Array.isArray(siteVisit.service_requests) ? siteVisit.service_requests[0] : siteVisit.service_requests;
      return toSiteVisitRow(row.id, row.site_visit_id, siteVisit.status, row.scheduled_start, row.scheduled_end, row.assigned_user_id, request);
    })
    .filter((v): v is RouteSiteVisitRow => v !== null);

  return ok(visits);
}

interface SiteVisitQueryRow {
  id: string;
  status: SiteVisitStatus;
  assigned_user_id: string | null;
  service_requests:
    | {
        service_title: string;
        priority: ServiceRequestPriority;
        customer_id: string | null;
        property_id: string | null;
        property_address_line_1: string | null;
        property_address_line_2: string | null;
        property_city: string | null;
        property_state: string | null;
        property_zip: string | null;
        customers: { display_name: string | null; company_name: string | null; first_name: string | null; last_name: string | null } | null;
      }
    | null;
}

/** Real site visits awaiting scheduling entirely (no appointment yet) — the "Unscheduled" section. */
export async function listUnscheduledRouteSiteVisits(client: DbClient, args: { orgId: string }): Promise<Result<RouteSiteVisitRow[]>> {
  const { data, error } = await client
    .from('site_visits')
    .select(
      `
      id, status, assigned_user_id,
      service_requests ( service_title, priority, customer_id, property_id, property_address_line_1, property_address_line_2, property_city, property_state, property_zip, customers ( display_name, company_name, first_name, last_name ) )
    `
    )
    .eq('org_id', args.orgId)
    .eq('status', 'awaiting_scheduling')
    .order('created_at', { ascending: false });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = (data ?? []) as unknown as SiteVisitQueryRow[];
  return ok(
    rows.map((row) => {
      const request = Array.isArray(row.service_requests) ? row.service_requests[0] : row.service_requests;
      return toSiteVisitRow(null, row.id, row.status, null, null, row.assigned_user_id, request);
    })
  );
}
