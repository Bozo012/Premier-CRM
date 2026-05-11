import {
  ErrorCode,
  err,
  ok,
  type AddLineItemInput,
  type CreateQuoteFromJobInput,
  type ListQuotesArgs,
  type QuoteStatus,
  type QuoteType,
  type RemoveLineItemInput,
  type Result,
  type UpdateLineItemInput,
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

// ---------------------------------------------------------------------------
// Org-wide quote list (used by /quotes index page)
// ---------------------------------------------------------------------------

type QuoteListJobRow = Pick<
  Database['public']['Tables']['jobs']['Row'],
  'customer_id' | 'id' | 'job_number' | 'title'
>;

export interface QuoteListCustomerSummary {
  displayName: string;
  id: string;
}

export interface QuoteListJobSummary {
  id: string;
  jobNumber: string | null;
  title: string;
}

export interface QuoteListItem {
  customer: QuoteListCustomerSummary | null;
  job: QuoteListJobSummary;
  lineItemCount: number;
  quote: Quote;
}

export interface QuoteListPage {
  quotes: QuoteListItem[];
  total: number;
}

export async function listQuotes(
  client: DbClient,
  args: { orgId: string } & ListQuotesArgs
): Promise<Result<QuoteListPage>> {
  let query = client
    .from('quotes')
    .select('*', { count: 'exact' })
    .eq('org_id', args.orgId);

  if (args.status) {
    query = query.eq('status', args.status);
  }

  if (args.search?.trim()) {
    const term = `%${args.search.trim()}%`;
    query = query.or(`title.ilike.${term},quote_number.ilike.${term}`);
  }

  const { data: quotes, error, count } = await query
    .order('created_at', { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const quoteRows = quotes ?? [];

  if (quoteRows.length === 0) {
    return ok({ quotes: [], total: count ?? 0 });
  }

  const jobIds = Array.from(new Set(quoteRows.map((q) => q.job_id)));
  const quoteIds = quoteRows.map((q) => q.id);

  const [jobsResult, lineItemsResult] = await Promise.all([
    client
      .from('jobs')
      .select('id, job_number, title, customer_id')
      .eq('org_id', args.orgId)
      .in('id', jobIds),
    client
      .from('quote_line_items')
      .select('quote_id')
      .eq('org_id', args.orgId)
      .in('quote_id', quoteIds),
  ]);

  if (jobsResult.error) {
    return err(ErrorCode.DB_ERROR, jobsResult.error.message);
  }

  const jobsById = new Map(
    (jobsResult.data ?? []).map((j) => [j.id, j as QuoteListJobRow])
  );

  const lineItemCountsByQuoteId = new Map<string, number>();
  for (const li of lineItemsResult.data ?? []) {
    lineItemCountsByQuoteId.set(
      li.quote_id,
      (lineItemCountsByQuoteId.get(li.quote_id) ?? 0) + 1
    );
  }

  // Fetch customers for the jobs we found.
  const customerIds = Array.from(
    new Set(
      (jobsResult.data ?? [])
        .map((j) => j.customer_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: customers, error: customersError } =
    customerIds.length > 0
      ? await client
          .from('customers')
          .select('id, display_name, company_name, first_name, last_name')
          .eq('org_id', args.orgId)
          .in('id', customerIds)
      : { data: [] as CustomerRow[], error: null };

  if (customersError) {
    return err(ErrorCode.DB_ERROR, customersError.message);
  }

  const customersById = new Map(
    (customers ?? []).map((c) => [c.id, c as CustomerRow])
  );

  const items: QuoteListItem[] = quoteRows.map((quote) => {
    const job = jobsById.get(quote.job_id);
    const customer = job?.customer_id
      ? (customersById.get(job.customer_id) ?? null)
      : null;

    return {
      customer: customer ? toCustomerSummary(customer) : null,
      job: {
        id: job?.id ?? quote.job_id,
        jobNumber: job?.job_number ?? null,
        title: job?.title ?? '',
      },
      lineItemCount: lineItemCountsByQuoteId.get(quote.id) ?? 0,
      quote,
    };
  });

  return ok({ quotes: items, total: count ?? 0 });
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

// ---------------------------------------------------------------------------
// Public token-based quote lookup (used by /q/[token] — no auth required)
// Must be called with a service-role client since the anonymous reader has
// no org membership and cannot satisfy the org_isolation_quotes RLS policy.
// ---------------------------------------------------------------------------

export interface QuoteTokenDetail {
  customer: QuoteCustomerSummary | null;
  job: QuoteJobSummary;
  lineItems: QuoteLineItemSummary[];
  property: QuotePropertySummary | null;
  quote: Quote;
}

export async function getQuoteByToken(
  client: DbClient,
  args: { token: string }
): Promise<Result<QuoteTokenDetail>> {
  const { data: quote, error } = await client
    .from('quotes')
    .select('*')
    .eq('share_token', args.token)
    .maybeSingle();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, 'Quote not found');
  }

  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
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
      job.customer_id
        ? client
            .from('customers')
            .select(
              'id, display_name, company_name, first_name, last_name, phone_primary, email'
            )
            .eq('id', job.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null as CustomerRow | null, error: null }),
      job.property_id
        ? client
            .from('properties')
            .select(
              'id, address_line_1, address_line_2, city, state, zip, property_type'
            )
            .eq('id', job.property_id)
            .maybeSingle()
        : Promise.resolve({ data: null as PropertyRow | null, error: null }),
      job.category_id
        ? client
            .from('service_categories')
            .select('id, name')
            .eq('id', job.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null as ServiceCategoryRow | null, error: null }),
      client
        .from('quote_line_items')
        .select('*')
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
        .map((li) => li.service_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const phaseIds = Array.from(
    new Set(
      lineItems
        .map((li) => li.phase_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [servicesResult, phasesResult] = await Promise.all([
    serviceIds.length > 0
      ? client
          .from('service_items')
          .select('id, name, pricing_metric')
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
    (servicesResult.data ?? []).map((s) => [s.id, s as ServiceItemRow])
  );
  const phasesById = new Map(
    (phasesResult.data ?? []).map((p) => [p.id, p as JobPhaseRow])
  );

  return ok({
    customer: toCustomerSummary(customerResult.data as CustomerRow | null),
    job: {
      category: toCategorySummary(categoryResult.data as ServiceCategoryRow | null),
      job,
    },
    lineItems: lineItems.map((li) => {
      const service = li.service_id ? servicesById.get(li.service_id) ?? null : null;
      return {
        item: li,
        phaseName: li.phase_id ? phasesById.get(li.phase_id)?.name ?? null : null,
        service: service
          ? { id: service.id, name: service.name, pricingMetric: service.pricing_metric }
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

// ---------------------------------------------------------------------------
// Line item mutations
// After each mutation we recalculate the quote totals since the DB has no
// trigger for this (the schema comment says "via trigger" but none exists).
// ---------------------------------------------------------------------------

type QuoteLineItemInsert =
  Database['public']['Tables']['quote_line_items']['Insert'];

/**
 * Recomputes and writes subtotal/tax_amount/total on the quotes row.
 * Reads the current tax_pct and discount_amount from the quote so the
 * caller doesn't have to pass them.
 */
async function recalcQuoteTotals(
  client: DbClient,
  args: { orgId: string; quoteId: string }
): Promise<void> {
  // Fetch the quote's current tax and discount settings.
  const { data: quote } = await client
    .from('quotes')
    .select('tax_pct, discount_amount')
    .eq('id', args.quoteId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  const taxPct = quote?.tax_pct ?? 0;
  const discountAmount = quote?.discount_amount ?? 0;

  // Sum all line totals for this quote (total_quoted is a generated column).
  const { data: agg } = await client
    .from('quote_line_items')
    .select('total_quoted')
    .eq('quote_id', args.quoteId)
    .eq('org_id', args.orgId);

  const subtotal = (agg ?? []).reduce(
    (sum, row) => sum + (row.total_quoted ?? 0),
    0
  );

  const taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
  const total = subtotal + taxAmount - discountAmount;

  await client
    .from('quotes')
    .update({ subtotal, tax_amount: taxAmount, total })
    .eq('id', args.quoteId)
    .eq('org_id', args.orgId);
}

export async function addQuoteLineItem(
  client: DbClient,
  args: { input: AddLineItemInput; orgId: string }
): Promise<Result<QuoteLineItem>> {
  // Verify the quote exists and belongs to this org.
  const { data: quote, error: quoteError } = await client
    .from('quotes')
    .select('id, job_id, status')
    .eq('id', args.input.quoteId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (quoteError) {
    return err(ErrorCode.DB_ERROR, quoteError.message);
  }

  if (!quote) {
    return err(ErrorCode.NOT_FOUND, `Quote ${args.input.quoteId} not found`);
  }

  if (quote.status !== 'draft') {
    return err(
      ErrorCode.FORBIDDEN,
      'Line items can only be added to draft quotes.'
    );
  }

  // Denormalize property_id and zip_code from the job so pricing intelligence
  // queries can filter by location without joining all the way back to jobs.
  const { data: job } = await client
    .from('jobs')
    .select('property_id')
    .eq('id', quote.job_id)
    .maybeSingle();

  const propertyId = job?.property_id ?? null;

  const { data: property } =
    propertyId
      ? await client
          .from('properties')
          .select('zip')
          .eq('id', propertyId)
          .maybeSingle()
      : { data: null };

  const payload: QuoteLineItemInsert = {
    description: args.input.description ?? null,
    job_id: quote.job_id,
    markup_pct: args.input.markupPct ?? null,
    name: args.input.name,
    org_id: args.orgId,
    property_id: propertyId,
    quantity: args.input.quantity,
    quote_id: args.input.quoteId,
    service_id: args.input.serviceId ?? null,
    unit: args.input.unit,
    unit_price: args.input.unitPrice,
    zip_code: property?.zip ?? null,
  };

  const { data: lineItem, error } = await client
    .from('quote_line_items')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  await recalcQuoteTotals(client, {
    orgId: args.orgId,
    quoteId: args.input.quoteId,
  });

  return ok(lineItem);
}

export async function updateQuoteLineItem(
  client: DbClient,
  args: { input: UpdateLineItemInput; orgId: string }
): Promise<Result<QuoteLineItem>> {
  // Verify the line item exists and belongs to this org + quote.
  const { data: existing, error: existingError } = await client
    .from('quote_line_items')
    .select('id, quote_id')
    .eq('id', args.input.lineItemId)
    .eq('org_id', args.orgId)
    .eq('quote_id', args.input.quoteId)
    .maybeSingle();

  if (existingError) {
    return err(ErrorCode.DB_ERROR, existingError.message);
  }

  if (!existing) {
    return err(ErrorCode.NOT_FOUND, `Line item ${args.input.lineItemId} not found`);
  }

  const { data: lineItem, error } = await client
    .from('quote_line_items')
    .update({
      description: args.input.description ?? null,
      markup_pct: args.input.markupPct ?? null,
      name: args.input.name,
      quantity: args.input.quantity,
      unit: args.input.unit,
      unit_price: args.input.unitPrice,
    })
    .eq('id', args.input.lineItemId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  await recalcQuoteTotals(client, {
    orgId: args.orgId,
    quoteId: args.input.quoteId,
  });

  return ok(lineItem);
}

export async function removeQuoteLineItem(
  client: DbClient,
  args: { input: RemoveLineItemInput; orgId: string }
): Promise<Result<{ lineItemId: string }>> {
  const { error } = await client
    .from('quote_line_items')
    .delete()
    .eq('id', args.input.lineItemId)
    .eq('quote_id', args.input.quoteId)
    .eq('org_id', args.orgId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  await recalcQuoteTotals(client, {
    orgId: args.orgId,
    quoteId: args.input.quoteId,
  });

  return ok({ lineItemId: args.input.lineItemId });
}
