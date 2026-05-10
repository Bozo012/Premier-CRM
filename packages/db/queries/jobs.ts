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
  'company_name' | 'display_name' | 'first_name' | 'id' | 'last_name'
>;

type PropertyRow = Pick<
  Database['public']['Tables']['properties']['Row'],
  'address_line_1' | 'address_line_2' | 'city' | 'id' | 'state' | 'zip'
>;

type ServiceCategoryRow = Pick<
  Database['public']['Tables']['service_categories']['Row'],
  'id' | 'name'
>;

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

export interface JobDetailCustomerSummary extends JobListCustomerSummary {}

export interface JobDetailPropertySummary extends JobListPropertySummary {}

export interface JobDetailCategorySummary extends JobListCategorySummary {}

export interface JobDetail {
  category: JobDetailCategorySummary | null;
  customer: JobDetailCustomerSummary | null;
  job: Job;
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

export async function listJobs(
  client: DbClient,
  args: ListJobsArgs
): Promise<Result<JobListPage>> {
  const { limit, offset, orgId, search, status } = args;

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

  if (status) {
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

  const [customerResult, propertyResult, categoryResult] = await Promise.all([
    client
      .from('customers')
      .select('id, display_name, company_name, first_name, last_name')
      .eq('org_id', args.orgId)
      .eq('id', job.customer_id)
      .maybeSingle(),
    client
      .from('properties')
      .select('id, address_line_1, address_line_2, city, state, zip')
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

  return ok({
    category: toCategorySummary(categoryResult.data as ServiceCategoryRow | null),
    customer: toCustomerSummary(customerResult.data as CustomerRow | null),
    job,
    property: toPropertySummary(propertyResult.data as PropertyRow | null),
  });
}
