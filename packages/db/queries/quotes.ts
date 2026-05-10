import {
  ErrorCode,
  err,
  ok,
  type CreateQuoteFromJobInput,
  type QuoteStatus,
  type QuoteType,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Quote = Database['public']['Tables']['quotes']['Row'];
export type QuoteLineItem = Database['public']['Tables']['quote_line_items']['Row'];
export type Job = Database['public']['Tables']['jobs']['Row'];

type CustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  | 'company_name'
  | 'display_name'
  | 'email'
  | 'first_name'
  | 'id'
  | 'last_name'
  | 'phone_primary'
>;

type PropertyRow = Pick<
  Database['public']['Tables']['properties']['Row'],
  | 'address_line_1'
  | 'address_line_2'
  | 'city'
  | 'id'
  | 'property_type'
  | 'state'
  | 'zip'
>;

type ServiceCategoryRow = Pick<
  Database['public']['Tables']['service_categories']['Row'],
  'id' | 'name'
>;

type ServiceItemRow = Pick<
  Database['public']['Tables']['service_items']['Row'],
  'id' | 'name' | 'pricing_metric'
>;

type JobPhaseRow = Pick<
  Database['public']['Tables']['job_phases']['Row'],
  'id' | 'name'
>;

type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];

export interface JobQuoteSummary {
  lineItemCount: number;
  quote: Quote;
}

export interface QuoteCustomerSummary {
  displayName: string;
  email: string | null;
  id: string;
  phonePrimary: string | null;
}

export interface QuotePropertySummary {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  id: string;
  propertyType: string | null;
  state: string;
  zip: string;
}

export interface QuoteCategorySummary {
  id: string;
  name: string;
}

export interface QuoteJobSummary {
  category: QuoteCategorySummary | null;
  job: Job;
}

export interface QuoteLineItemSummary {
  item: QuoteLineItem;
  phaseName: string | null;
  service: {
    id: string;
    name: string;
    pricingMetric: string | null;
  } | null;
}

export interface QuoteDetail {
  customer: QuoteCustomerSummary | null;
  job: QuoteJobSummary;
  lineItems: QuoteLineItemSummary[];
  property: QuotePropertySummary | null;
  quote: Quote;
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

function buildDraftQuoteTitle(job: Job): string {
  const trimmedTitle = job.title.trim();

  if (trimmedTitle) {
    return trimmedTitle;
  }

  if (job.job_number?.trim()) {
    return `Quote for ${job.job_number.trim()}`;
  }

  return 'Draft quote';
}

function toCustomerSummary(
  customer: CustomerRow | null | undefined
): QuoteCustomerSummary | null {
  if (!customer) {
    return null;
  }

  return {
    displayName: resolveCustomerDisplayName(customer),
    email: customer.email,
    id: customer.id,
    phonePrimary: customer.phone_primary,
  };
}

function toPropertySummary(
  property: PropertyRow | null | undefined
): QuotePropertySummary | null {
  if (!property) {
    return null;
  }

  return {
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    id: property.id,
    propertyType: property.property_type,
    state: property.state,
    zip: property.zip,
  };
}

function toCategorySummary(
  category: ServiceCategoryRow | null | undefined
): QuoteCategorySummary | null {
  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
  };
}

export async function listQuotesForJob(
  client: DbClient,
  args: { jobId: string; orgId: string }
): Promise<Result<JobQuoteSummary[]>> {
  const { data: quotes, error } = await client
    .from('quotes')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .order('created_at', { ascending: false });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const quoteRows = quotes ?? [];

  if (quoteRows.length === 0) {
    return ok([]);
  }

  const quoteIds = quoteRows.map((quote) => quote.id);
  const { data: lineItems, error: lineItemsError } = await client
    .from('quote_line_items')
    .select('quote_id')
    .eq('org_id', args.orgId)
    .in('quote_id', quoteIds);

  if (lineItemsError) {
    return err(ErrorCode.DB_ERROR, lineItemsError.message);
  }

  const countsByQuoteId = new Map<string, number>();

  for (const lineItem of lineItems ?? []) {
    countsByQuoteId.set(
      lineItem.quote_id,
      (countsByQuoteId.get(lineItem.quote_id) ?? 0) + 1
    );
  }

  return ok(
    quoteRows.map((quote) => ({
      lineItemCount: countsByQuoteId.get(quote.id) ?? 0,
      quote,
    }))
  );
}

export async function getQuoteById(
  client: DbClient,
  args: { orgId: string; quoteId: string }
): Promise<Result<QuoteDetail>> {
  const { data: quote, error } = await client
    .from('quotes')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.quoteId)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, `Quote ${args.quoteId} not found`);
  }

  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', quote.job_id)
    .maybeSingle();

  if (jobError) {
    return err(ErrorCode.DB_ERROR, jobError.message);
  }

  if (!job) {
    return err(ErrorCode.NOT_FOUND, `Job ${quote.job_id} not found`);
  }

  const [customerResult, propertyResult, categoryResult, lineItemsResult] =
    await Promise.all([
      client
        .from('customers')
        .select(
          'id, display_name, company_name, first_name, last_name, phone_primary, email'
        )
        .eq('org_id', args.orgId)
        .eq('id', job.customer_id)
        .maybeSingle(),
      client
        .from('properties')
        .select(
          'id, address_line_1, address_line_2, city, state, zip, property_type'
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
        .from('quote_line_items')
        .select('*')
        .eq('org_id', args.orgId)
        .eq('quote_id', quote.id)
        .order('sort_order', { ascending: true, nullsFirst: false })
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

  if (lineItemsResult.error) {
    return err(ErrorCode.DB_ERROR, lineItemsResult.error.message);
  }

  const lineItems = lineItemsResult.data ?? [];
  const serviceIds = Array.from(
    new Set(
      lineItems
        .map((lineItem) => lineItem.service_id)
        .filter((serviceId): serviceId is string => Boolean(serviceId))
    )
  );
  const phaseIds = Array.from(
    new Set(
      lineItems
        .map((lineItem) => lineItem.phase_id)
        .filter((phaseId): phaseId is string => Boolean(phaseId))
    )
  );

  const [servicesResult, phasesResult] = await Promise.all([
    serviceIds.length > 0
      ? client
          .from('service_items')
          .select('id, name, pricing_metric')
          .eq('org_id', args.orgId)
          .in('id', serviceIds)
      : Promise.resolve({ data: [] as ServiceItemRow[], error: null }),
    phaseIds.length > 0
      ? client
          .from('job_phases')
          .select('id, name')
          .eq('job_id', job.id)
          .in('id', phaseIds)
      : Promise.resolve({ data: [] as JobPhaseRow[], error: null }),
  ]);

  if (servicesResult.error) {
    return err(ErrorCode.DB_ERROR, servicesResult.error.message);
  }

  if (phasesResult.error) {
    return err(ErrorCode.DB_ERROR, phasesResult.error.message);
  }

  const servicesById = new Map(
    (servicesResult.data ?? []).map((service) => [service.id, service as ServiceItemRow])
  );
  const phasesById = new Map(
    (phasesResult.data ?? []).map((phase) => [phase.id, phase as JobPhaseRow])
  );

  return ok({
    customer: toCustomerSummary(customerResult.data as CustomerRow | null),
    job: {
      category: toCategorySummary(categoryResult.data as ServiceCategoryRow | null),
      job,
    },
    lineItems: lineItems.map((lineItem) => {
      const service = lineItem.service_id
        ? servicesById.get(lineItem.service_id) ?? null
        : null;

      return {
        item: lineItem,
        phaseName: lineItem.phase_id
          ? phasesById.get(lineItem.phase_id)?.name ?? null
          : null,
        service: service
          ? {
              id: service.id,
              name: service.name,
              pricingMetric: service.pricing_metric,
            }
          : null,
      };
    }),
    property: toPropertySummary(propertyResult.data as PropertyRow | null),
    quote,
  });
}

export async function createDraftQuote(
  client: DbClient,
  args: {
    createdBy: string;
    input: CreateQuoteFromJobInput;
    orgId: string;
  }
): Promise<Result<Quote>> {
  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.input.jobId)
    .maybeSingle();

  if (jobError) {
    return err(ErrorCode.DB_ERROR, jobError.message);
  }

  if (!job) {
    return err(ErrorCode.NOT_FOUND, `Job ${args.input.jobId} not found`);
  }

  const payload = {
    created_by: args.createdBy,
    job_id: job.id,
    org_id: args.orgId,
    status: 'draft' satisfies QuoteStatus,
    title: buildDraftQuoteTitle(job),
    type: 'standard' satisfies QuoteType,
  } satisfies QuoteInsert;

  const { data: quote, error } = await client
    .from('quotes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(quote);
}
