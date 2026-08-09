import {
  ErrorCode,
  err,
  ok,
  type ListJobsArgs,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Job = Database['public']['Tables']['jobs']['Row'];

type CustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  | 'company_name'
  | 'display_name'
  | 'email'
  | 'first_name'
  | 'id'
  | 'last_name'
  | 'notes'
  | 'phone_primary'
  | 'preferred_channel'
>;

type PropertyRow = Pick<
  Database['public']['Tables']['properties']['Row'],
  | 'access_notes'
  | 'address_line_1'
  | 'address_line_2'
  | 'city'
  | 'gate_code'
  | 'id'
  | 'notes'
  | 'parking_notes'
  | 'property_type'
  | 'state'
  | 'zip'
>;

type ServiceCategoryRow = Pick<
  Database['public']['Tables']['service_categories']['Row'],
  'id' | 'name'
>;

type JobPhase = Database['public']['Tables']['job_phases']['Row'];

export interface JobListCustomerSummary {
  displayName: string;
  id: string;
}

export interface JobListPropertySummary {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  id: string;
  state: string;
  zip: string;
}

export interface JobListCategorySummary {
  id: string;
  name: string;
}

export interface JobListItem {
  category: JobListCategorySummary | null;
  customer: JobListCustomerSummary | null;
  job: Job;
  nextScheduledAt: string | null;
  property: JobListPropertySummary | null;
}

export interface JobListPage {
  jobs: JobListItem[];
  total: number;
}

export interface JobDetailCustomerSummary extends JobListCustomerSummary {
  email: string | null;
  notes: string | null;
  phonePrimary: string | null;
  preferredChannel: Database['public']['Enums']['preferred_channel'] | null;
}

export interface JobDetailPropertySummary extends JobListPropertySummary {
  accessNotes: string | null;
  gateCode: string | null;
  notes: string | null;
  parkingNotes: string | null;
  propertyType: string | null;
}

export interface JobDetailCategorySummary extends JobListCategorySummary {}

export interface JobPhaseSummary {
  actualCost: number | null;
  actualEnd: string | null;
  actualStart: string | null;
  description: string | null;
  estimatedTotal: number | null;
  id: string;
  name: string;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  sortOrder: number | null;
  status: Database['public']['Enums']['job_status'];
}

export interface JobDetail {
  category: JobDetailCategorySummary | null;
  customer: JobDetailCustomerSummary | null;
  job: Job;
  phases: JobPhaseSummary[];
  property: JobDetailPropertySummary | null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function resolveCustomerDisplayName(customer: CustomerRow): string {
  if (customer.display_name) return customer.display_name;
  if (customer.company_name) return customer.company_name;

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Unnamed customer';
}

function toCustomerSummary(
  customer: CustomerRow | null | undefined
): JobListCustomerSummary | null {
  if (!customer) {
    return null;
  }

  return {
    displayName: resolveCustomerDisplayName(customer),
    id: customer.id,
  };
}

function toJobDetailCustomerSummary(
  customer: CustomerRow | null | undefined
): JobDetailCustomerSummary | null {
  if (!customer) {
    return null;
  }

  return {
    displayName: resolveCustomerDisplayName(customer),
    email: customer.email,
    id: customer.id,
    notes: customer.notes,
    phonePrimary: customer.phone_primary,
    preferredChannel: customer.preferred_channel,
  };
}

function toPropertySummary(
  property: PropertyRow | null | undefined
): JobListPropertySummary | null {
  if (!property) {
    return null;
  }

  return {
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    id: property.id,
    state: property.state,
    zip: property.zip,
  };
}

function toJobDetailPropertySummary(
  property: PropertyRow | null | undefined
): JobDetailPropertySummary | null {
  if (!property) {
    return null;
  }

  return {
    accessNotes: property.access_notes,
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    gateCode: property.gate_code,
    id: property.id,
    notes: property.notes,
    parkingNotes: property.parking_notes,
    propertyType: property.property_type,
    state: property.state,
    zip: property.zip,
  };
}

function toCategorySummary(
  category: ServiceCategoryRow | null | undefined
): JobListCategorySummary | null {
  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
  };
}

function toJobPhaseSummary(phase: JobPhase): JobPhaseSummary {
  return {
    actualCost: phase.actual_cost,
    actualEnd: phase.actual_end,
    actualStart: phase.actual_start,
    description: phase.description,
    estimatedTotal: phase.estimated_total,
    id: phase.id,
    name: phase.name,
    scheduledEnd: phase.scheduled_end,
    scheduledStart: phase.scheduled_start,
    sortOrder: phase.sort_order,
    status: phase.status,
  };
}

export async function listJobs(
  client: DbClient,
  args: ListJobsArgs
): Promise<Result<JobListPage>> {
  const { limit, offset, orgId, search, status, statuses } = args;

  let query = client
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('scheduled_start', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const escaped = escapeLikePattern(search);
    query = query.or(
      [
        `title.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `job_number.ilike.%${escaped}%`,
      ].join(',')
    );
  }

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  } else if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const jobs = data ?? [];

  if (jobs.length === 0) {
    return ok({
      jobs: [],
      total: count ?? 0,
    });
  }

  const customerIds = Array.from(new Set(jobs.map((job) => job.customer_id)));
  const propertyIds = Array.from(new Set(jobs.map((job) => job.property_id)));
  const categoryIds = Array.from(
    new Set(
      jobs
        .map((job) => job.category_id)
        .filter((categoryId): categoryId is string => Boolean(categoryId))
    )
  );

  const [customersResult, propertiesResult, categoriesResult] = await Promise.all([
    client
      .from('customers')
      .select('id, display_name, company_name, first_name, last_name')
      .eq('org_id', orgId)
      .in('id', customerIds),
    client
      .from('properties')
      .select('id, address_line_1, address_line_2, city, state, zip')
      .eq('org_id', orgId)
      .in('id', propertyIds),
    categoryIds.length > 0
      ? client
          .from('service_categories')
          .select('id, name')
          .eq('org_id', orgId)
          .in('id', categoryIds)
      : Promise.resolve({ data: [] as ServiceCategoryRow[], error: null }),
  ]);

  if (customersResult.error) {
    return err(ErrorCode.DB_ERROR, customersResult.error.message);
  }

  if (propertiesResult.error) {
    return err(ErrorCode.DB_ERROR, propertiesResult.error.message);
  }

  if (categoriesResult.error) {
    return err(ErrorCode.DB_ERROR, categoriesResult.error.message);
  }

  const customersById = new Map(
    (customersResult.data ?? []).map((customer) => [customer.id, customer as CustomerRow])
  );
  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((property) => [property.id, property as PropertyRow])
  );
  const categoriesById = new Map(
    (categoriesResult.data ?? []).map((category) => [
      category.id,
      category as ServiceCategoryRow,
    ])
  );

  return ok({
    jobs: jobs.map((job) => ({
      category: toCategorySummary(
        job.category_id ? categoriesById.get(job.category_id) : null
      ),
      customer: toCustomerSummary(customersById.get(job.customer_id)),
      job,
      nextScheduledAt: job.scheduled_start ?? job.scheduled_end,
      property: toPropertySummary(propertiesById.get(job.property_id)),
    })),
    total: count ?? jobs.length,
  });
}

export interface JobsInRangeItem {
  category: JobListCategorySummary | null;
  customer: JobListCustomerSummary | null;
  job: Pick<
    Job,
    | 'id'
    | 'title'
    | 'job_number'
    | 'status'
    | 'priority'
    | 'scheduled_start'
    | 'scheduled_end'
  >;
  property: JobListPropertySummary | null;
}

/**
 * Jobs whose scheduled_start falls in [start, end) — Calendar's real data
 * source (Base44-exact Jobs/Calendar port). Deliberately NOT limited to any
 * particular status: Calendar shows whatever is actually scheduled,
 * matching the pre-existing (legacy)/calendar/page.tsx's own inline query
 * (org-scoped `jobs` select filtered by `scheduled_start`), just extracted
 * here as a reusable, testable query and given real customer/property/
 * category joins (the inline version had none). This is a query-layer
 * *addition*, not a new events table — no `calendar_events` concept exists
 * in the schema (verified: `grep -r calendar_event supabase/migrations`
 * returns nothing) and none is introduced here.
 */
export async function listJobsScheduledInRange(
  client: DbClient,
  args: { orgId: string; start: Date; end: Date }
): Promise<Result<JobsInRangeItem[]>> {
  const { data, error } = await client
    .from('jobs')
    .select('id, title, job_number, status, priority, scheduled_start, scheduled_end, customer_id, property_id, category_id')
    .eq('org_id', args.orgId)
    .gte('scheduled_start', args.start.toISOString())
    .lt('scheduled_start', args.end.toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const jobs = data ?? [];
  if (jobs.length === 0) return ok([]);

  const customerIds = Array.from(new Set(jobs.map((job) => job.customer_id)));
  const propertyIds = Array.from(new Set(jobs.map((job) => job.property_id)));
  const categoryIds = Array.from(
    new Set(jobs.map((job) => job.category_id).filter((id): id is string => Boolean(id)))
  );

  const [customersResult, propertiesResult, categoriesResult] = await Promise.all([
    client.from('customers').select('id, display_name, company_name, first_name, last_name').eq('org_id', args.orgId).in('id', customerIds),
    client.from('properties').select('id, address_line_1, address_line_2, city, state, zip').eq('org_id', args.orgId).in('id', propertyIds),
    categoryIds.length > 0
      ? client.from('service_categories').select('id, name').eq('org_id', args.orgId).in('id', categoryIds)
      : Promise.resolve({ data: [] as ServiceCategoryRow[], error: null }),
  ]);

  if (customersResult.error) return err(ErrorCode.DB_ERROR, customersResult.error.message);
  if (propertiesResult.error) return err(ErrorCode.DB_ERROR, propertiesResult.error.message);
  if (categoriesResult.error) return err(ErrorCode.DB_ERROR, categoriesResult.error.message);

  const customersById = new Map((customersResult.data ?? []).map((c) => [c.id, c as CustomerRow]));
  const propertiesById = new Map((propertiesResult.data ?? []).map((p) => [p.id, p as PropertyRow]));
  const categoriesById = new Map((categoriesResult.data ?? []).map((c) => [c.id, c as ServiceCategoryRow]));

  return ok(
    jobs.map((job) => ({
      category: toCategorySummary(job.category_id ? categoriesById.get(job.category_id) : null),
      customer: toCustomerSummary(customersById.get(job.customer_id)),
      job,
      property: toPropertySummary(propertiesById.get(job.property_id)),
    }))
  );
}

export async function getJobById(
  client: DbClient,
  args: { jobId: string; orgId: string }
): Promise<Result<JobDetail>> {
  const { data: job, error } = await client
    .from('jobs')
    .select('*')
    .eq('id', args.jobId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!job) {
    return err(ErrorCode.NOT_FOUND, `Job ${args.jobId} not found`);
  }

  const [customerResult, propertyResult, categoryResult, phasesResult] = await Promise.all([
    client
      .from('customers')
      .select(
        'id, display_name, company_name, first_name, last_name, phone_primary, email, preferred_channel, notes'
      )
      .eq('org_id', args.orgId)
      .eq('id', job.customer_id)
      .maybeSingle(),
    client
      .from('properties')
      .select(
        'id, address_line_1, address_line_2, city, state, zip, property_type, access_notes, gate_code, parking_notes, notes'
      )
      .eq('org_id', args.orgId)
      .eq('id', job.property_id)
      .maybeSingle(),
    job.category_id
      ? client
          .from('service_categories')
          .select('id, name')
          .eq('org_id', args.orgId)
          .eq('id', job.category_id)
          .maybeSingle()
      : Promise.resolve({ data: null as ServiceCategoryRow | null, error: null }),
    client
      .from('job_phases')
      .select(
        'id, name, description, status, scheduled_start, scheduled_end, actual_start, actual_end, estimated_total, actual_cost, sort_order'
      )
      .eq('job_id', job.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ]);

  if (customerResult.error) {
    return err(ErrorCode.DB_ERROR, customerResult.error.message);
  }

  if (propertyResult.error) {
    return err(ErrorCode.DB_ERROR, propertyResult.error.message);
  }

  if (categoryResult.error) {
    return err(ErrorCode.DB_ERROR, categoryResult.error.message);
  }

  if (phasesResult.error) {
    return err(ErrorCode.DB_ERROR, phasesResult.error.message);
  }

  return ok({
    category: toCategorySummary(categoryResult.data as ServiceCategoryRow | null),
    customer: toJobDetailCustomerSummary(customerResult.data as CustomerRow | null),
    job,
    phases: (phasesResult.data ?? []).map((phase) =>
      toJobPhaseSummary(phase as JobPhase)
    ),
    property: toJobDetailPropertySummary(propertyResult.data as PropertyRow | null),
  });
}
