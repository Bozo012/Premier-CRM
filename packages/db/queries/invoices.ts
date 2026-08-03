import {
  ErrorCode,
  err,
  ok,
  type AddInvoiceLineItemInput,
  type CreateInvoiceFromJobInput,
  type CreateInvoiceFromQuoteInput,
  type ListInvoicesArgs,
  type RecordPaymentInput,
  type RemoveInvoiceLineItemInput,
  type Result,
  type UpdateInvoiceLineItemInput,
  type UpdateInvoiceMetadataInput,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];

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

type JobRow = Pick<
  Database['public']['Tables']['jobs']['Row'],
  'customer_id' | 'id' | 'job_number' | 'property_id' | 'title'
>;

type QuoteRow = Pick<
  Database['public']['Tables']['quotes']['Row'],
  'id' | 'quote_number' | 'title'
>;

type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert'];
type PaymentInsert = Database['public']['Tables']['payments']['Insert'];

export interface InvoiceCustomerSummary {
  displayName: string;
  email: string | null;
  id: string;
  phonePrimary: string | null;
}

export interface InvoicePropertySummary {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  id: string;
  propertyType: string | null;
  state: string;
  zip: string;
}

export interface InvoiceJobSummary {
  id: string;
  jobNumber: string | null;
  title: string;
}

export interface InvoiceQuoteSummary {
  id: string;
  quoteNumber: string | null;
  title: string | null;
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
): InvoiceCustomerSummary | null {
  if (!customer) return null;

  return {
    displayName: resolveCustomerDisplayName(customer),
    email: customer.email,
    id: customer.id,
    phonePrimary: customer.phone_primary,
  };
}

function toPropertySummary(
  property: PropertyRow | null | undefined
): InvoicePropertySummary | null {
  if (!property) return null;

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

/**
 * Translates the friendly RAISE EXCEPTION messages from the
 * apply_payment_to_invoice() trigger (migration 20260722000000) into
 * VALIDATION_ERROR results instead of raw DB_ERROR — those messages are
 * already written for a human reader.
 */
export function translatePaymentError(message: string): Result<never> {
  if (
    message.includes('void invoice') ||
    message.includes('greater than zero') ||
    message.includes('exceed the invoice total')
  ) {
    return err(ErrorCode.VALIDATION_ERROR, message);
  }
  return err(ErrorCode.DB_ERROR, message);
}

// ---------------------------------------------------------------------------
// Live invoice-total aggregate for a job (never trust jobs.invoiced_total /
// paid_total — those are stale legacy columns with no maintaining trigger)
// ---------------------------------------------------------------------------

export interface JobInvoiceTotals {
  invoicedTotal: number;
  paidTotal: number;
  amountDueTotal: number;
  invoiceCount: number;
}

export async function getJobInvoiceTotals(
  client: DbClient,
  args: { jobId: string; orgId: string }
): Promise<Result<JobInvoiceTotals>> {
  const { data, error } = await client
    .from('invoices')
    .select('total, amount_paid, amount_due, status')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const rows = (data ?? []).filter((row) => row.status !== 'void');

  return ok({
    invoicedTotal: rows.reduce((sum, row) => sum + (row.total ?? 0), 0),
    paidTotal: rows.reduce((sum, row) => sum + (row.amount_paid ?? 0), 0),
    amountDueTotal: rows.reduce((sum, row) => sum + (row.amount_due ?? 0), 0),
    invoiceCount: rows.length,
  });
}

// ---------------------------------------------------------------------------
// Invoices for a job (job detail page)
// ---------------------------------------------------------------------------

export interface JobInvoiceSummary {
  invoice: Invoice;
  lineItemCount: number;
}

export async function listInvoicesForJob(
  client: DbClient,
  args: { jobId: string; orgId: string }
): Promise<Result<JobInvoiceSummary[]>> {
  const { data: invoices, error } = await client
    .from('invoices')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .order('created_at', { ascending: false });

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const invoiceRows = invoices ?? [];
  if (invoiceRows.length === 0) return ok([]);

  const invoiceIds = invoiceRows.map((invoice) => invoice.id);
  const { data: lineItems, error: lineItemsError } = await client
    .from('invoice_line_items')
    .select('invoice_id')
    .in('invoice_id', invoiceIds);

  if (lineItemsError) {
    return err(ErrorCode.DB_ERROR, lineItemsError.message);
  }

  const countsByInvoiceId = new Map<string, number>();
  for (const lineItem of lineItems ?? []) {
    countsByInvoiceId.set(
      lineItem.invoice_id,
      (countsByInvoiceId.get(lineItem.invoice_id) ?? 0) + 1
    );
  }

  return ok(
    invoiceRows.map((invoice) => ({
      invoice,
      lineItemCount: countsByInvoiceId.get(invoice.id) ?? 0,
    }))
  );
}

// ---------------------------------------------------------------------------
// Org-wide invoice list (used by /invoices index page)
// ---------------------------------------------------------------------------

export interface InvoiceListItem {
  customer: InvoiceCustomerSummary | null;
  invoice: Invoice;
  job: InvoiceJobSummary;
  isOverdue: boolean;
}

export interface InvoiceListPage {
  invoices: InvoiceListItem[];
  total: number;
}

// Overdue is computed at read time, never written to the status column:
// due date has passed, amount is still owed, and the invoice isn't in a
// terminal/non-collectible state.
const NON_OVERDUE_ELIGIBLE_STATUSES = new Set(['paid', 'void', 'refunded', 'draft']);

export function computeIsOverdue(
  invoice: Pick<Invoice, 'due_date' | 'amount_due' | 'status'>
): boolean {
  if (!invoice.due_date) return false;
  if (NON_OVERDUE_ELIGIBLE_STATUSES.has(invoice.status)) return false;
  if ((invoice.amount_due ?? 0) <= 0) return false;
  return new Date(invoice.due_date) < new Date();
}

export async function listInvoices(
  client: DbClient,
  args: { orgId: string } & ListInvoicesArgs
): Promise<Result<InvoiceListPage>> {
  let query = client
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('org_id', args.orgId);

  if (args.status) {
    query = query.eq('status', args.status);
  }

  if (args.search?.trim()) {
    const term = `%${args.search.trim()}%`;
    query = query.or(`title.ilike.${term},invoice_number.ilike.${term}`);
  }

  const { data: invoices, error, count } = await query
    .order('created_at', { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const invoiceRows = invoices ?? [];
  if (invoiceRows.length === 0) return ok({ invoices: [], total: count ?? 0 });

  const jobIds = Array.from(new Set(invoiceRows.map((invoice) => invoice.job_id)));

  const { data: jobs, error: jobsError } = await client
    .from('jobs')
    .select('id, job_number, title, customer_id')
    .eq('org_id', args.orgId)
    .in('id', jobIds);

  if (jobsError) {
    return err(ErrorCode.DB_ERROR, jobsError.message);
  }

  const jobsById = new Map((jobs ?? []).map((job) => [job.id, job as JobRow]));

  const customerIds = Array.from(
    new Set(
      (jobs ?? [])
        .map((job) => job.customer_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: customers, error: customersError } =
    customerIds.length > 0
      ? await client
          .from('customers')
          .select('id, display_name, company_name, first_name, last_name, phone_primary, email')
          .eq('org_id', args.orgId)
          .in('id', customerIds)
      : { data: [] as CustomerRow[], error: null };

  if (customersError) {
    return err(ErrorCode.DB_ERROR, customersError.message);
  }

  const customersById = new Map((customers ?? []).map((c) => [c.id, c as CustomerRow]));

  const items: InvoiceListItem[] = invoiceRows.map((invoice) => {
    const job = jobsById.get(invoice.job_id);
    const customer = job?.customer_id ? customersById.get(job.customer_id) : undefined;

    return {
      customer: customer ? toCustomerSummary(customer) : null,
      invoice,
      job: {
        id: job?.id ?? invoice.job_id,
        jobNumber: job?.job_number ?? null,
        title: job?.title ?? '',
      },
      isOverdue: computeIsOverdue(invoice),
    };
  });

  return ok({ invoices: items, total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// Invoice detail (bundles invoice + line items + payments + job/customer/
// property/quote summaries in one call, per Phase 1-B)
// ---------------------------------------------------------------------------

export interface InvoiceLineItemSummary {
  item: InvoiceLineItem;
}

export interface InvoiceDetail {
  customer: InvoiceCustomerSummary | null;
  invoice: Invoice;
  job: InvoiceJobSummary;
  lineItems: InvoiceLineItemSummary[];
  payments: Payment[];
  property: InvoicePropertySummary | null;
  quote: InvoiceQuoteSummary | null;
}

async function loadInvoiceDetail(
  client: DbClient,
  invoice: Invoice,
  args: { orgId?: string }
): Promise<Result<InvoiceDetail>> {
  const scopedJobs = args.orgId
    ? client.from('jobs').select('*').eq('org_id', args.orgId)
    : client.from('jobs').select('*');

  const [jobResult, lineItemsResult, paymentsResult] = await Promise.all([
    scopedJobs.eq('id', invoice.job_id).maybeSingle(),
    client
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    client
      .from('payments')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('paid_at', { ascending: false }),
  ]);

  if (jobResult.error) return err(ErrorCode.DB_ERROR, jobResult.error.message);
  if (lineItemsResult.error) return err(ErrorCode.DB_ERROR, lineItemsResult.error.message);
  if (paymentsResult.error) return err(ErrorCode.DB_ERROR, paymentsResult.error.message);

  const job = jobResult.data as Database['public']['Tables']['jobs']['Row'] | null;
  if (!job) {
    return err(ErrorCode.NOT_FOUND, `Job ${invoice.job_id} not found`);
  }

  const [customerResult, propertyResult, quoteResult] = await Promise.all([
    job.customer_id
      ? client
          .from('customers')
          .select('id, display_name, company_name, first_name, last_name, phone_primary, email')
          .eq('id', job.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null as CustomerRow | null, error: null }),
    job.property_id
      ? client
          .from('properties')
          .select('id, address_line_1, address_line_2, city, state, zip, property_type')
          .eq('id', job.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null as PropertyRow | null, error: null }),
    invoice.quote_id
      ? client
          .from('quotes')
          .select('id, quote_number, title')
          .eq('id', invoice.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null as QuoteRow | null, error: null }),
  ]);

  if (customerResult.error) return err(ErrorCode.DB_ERROR, customerResult.error.message);
  if (propertyResult.error) return err(ErrorCode.DB_ERROR, propertyResult.error.message);
  if (quoteResult.error) return err(ErrorCode.DB_ERROR, quoteResult.error.message);

  return ok({
    customer: toCustomerSummary(customerResult.data as CustomerRow | null),
    invoice,
    job: { id: job.id, jobNumber: job.job_number, title: job.title },
    lineItems: (lineItemsResult.data ?? []).map((item) => ({ item })),
    payments: paymentsResult.data ?? [],
    property: toPropertySummary(propertyResult.data as PropertyRow | null),
    quote: quoteResult.data
      ? {
          id: quoteResult.data.id,
          quoteNumber: quoteResult.data.quote_number,
          title: quoteResult.data.title,
        }
      : null,
  });
}

export async function getInvoiceById(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<Result<InvoiceDetail>> {
  const { data: invoice, error } = await client
    .from('invoices')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.invoiceId)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, `Invoice ${args.invoiceId} not found`);

  return loadInvoiceDetail(client, invoice, { orgId: args.orgId });
}

// ---------------------------------------------------------------------------
// Public token-based invoice lookup (used by /i/[token] — no auth required)
// Must be called with a service-role client since the anonymous reader has
// no org membership and cannot satisfy the org_isolation_invoices RLS
// policy. Only non-draft invoices should be shown — enforced by the caller
// (the page checks invoice.status !== 'draft' and 404s otherwise), mirroring
// how the public quote view handles draft/terminal states.
// ---------------------------------------------------------------------------

export async function getInvoiceByToken(
  client: DbClient,
  args: { token: string }
): Promise<Result<InvoiceDetail>> {
  const { data: invoice, error } = await client
    .from('invoices')
    .select('*')
    .eq('share_token', args.token)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, 'Invoice not found');

  return loadInvoiceDetail(client, invoice, {});
}

// ---------------------------------------------------------------------------
// Invoice creation
// ---------------------------------------------------------------------------

export async function createDraftInvoiceFromJob(
  client: DbClient,
  args: { createdBy: string; input: CreateInvoiceFromJobInput; orgId: string }
): Promise<Result<Invoice>> {
  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.input.jobId)
    .maybeSingle();

  if (jobError) return err(ErrorCode.DB_ERROR, jobError.message);
  if (!job) return err(ErrorCode.NOT_FOUND, `Job ${args.input.jobId} not found`);

  const payload = {
    job_id: job.id,
    kind: args.input.kind,
    org_id: args.orgId,
    status: 'draft',
    title: job.title?.trim() || (job.job_number ? `Invoice for ${job.job_number}` : 'Draft invoice'),
  } satisfies InvoiceInsert;

  const { data: invoice, error } = await client
    .from('invoices')
    .insert(payload)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  return ok(invoice);
}

/**
 * Creates a draft invoice from an accepted quote, optionally copying the
 * quote's line items in as snapshots. `quote_line_id` is preserved for
 * traceability only — invoice line items are never live-synced back to the
 * quote. Calling this twice for the same quote creates two invoices (an
 * invoice is not a singleton per quote the way a job is per accepted quote),
 * but each call only ever copies the quote's line items once per invoice —
 * there is no duplication within a single invoice.
 */
export async function createDraftInvoiceFromQuote(
  client: DbClient,
  args: { createdBy: string; input: CreateInvoiceFromQuoteInput; orgId: string }
): Promise<Result<Invoice>> {
  const { data: quote, error: quoteError } = await client
    .from('quotes')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.input.quoteId)
    .maybeSingle();

  if (quoteError) return err(ErrorCode.DB_ERROR, quoteError.message);
  if (!quote) return err(ErrorCode.NOT_FOUND, `Quote ${args.input.quoteId} not found`);

  if (!quote.job_id) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'This quote has no linked job yet. Create the job first, then invoice from the job.'
    );
  }

  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', quote.job_id)
    .maybeSingle();

  if (jobError) return err(ErrorCode.DB_ERROR, jobError.message);
  if (!job) return err(ErrorCode.NOT_FOUND, `Job ${quote.job_id} not found`);

  const payload = {
    job_id: job.id,
    kind: args.input.kind,
    org_id: args.orgId,
    quote_id: quote.id,
    status: 'draft',
    tax_pct: quote.tax_pct,
    title: quote.title?.trim() || (job.job_number ? `Invoice for ${job.job_number}` : 'Draft invoice'),
  } satisfies InvoiceInsert;

  const { data: invoice, error } = await client
    .from('invoices')
    .insert(payload)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  if (args.input.copyLineItems) {
    const { data: quoteLineItems, error: quoteLineItemsError } = await client
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (quoteLineItemsError) {
      return err(ErrorCode.DB_ERROR, quoteLineItemsError.message);
    }

    if ((quoteLineItems ?? []).length > 0) {
      const snapshots: InvoiceLineItemInsert[] = (quoteLineItems ?? []).map((li, index) => ({
        description: li.description,
        invoice_id: invoice.id,
        name: li.name,
        quantity: li.quantity,
        quote_line_id: li.id,
        sort_order: index,
        unit: li.unit,
        unit_price: li.unit_price,
      }));

      const { error: insertLineItemsError } = await client
        .from('invoice_line_items')
        .insert(snapshots);

      if (insertLineItemsError) {
        return err(ErrorCode.DB_ERROR, insertLineItemsError.message);
      }

      await recalcInvoiceTotals(client, { invoiceId: invoice.id, orgId: args.orgId });

      const { data: refreshed, error: refreshError } = await client
        .from('invoices')
        .select('*')
        .eq('id', invoice.id)
        .single();

      if (refreshError) return err(ErrorCode.DB_ERROR, refreshError.message);
      return ok(refreshed);
    }
  }

  return ok(invoice);
}

// ---------------------------------------------------------------------------
// Invoice metadata update (draft only)
// ---------------------------------------------------------------------------

export async function updateInvoiceMetadata(
  client: DbClient,
  args: { input: UpdateInvoiceMetadataInput; orgId: string }
): Promise<Result<Invoice>> {
  const { data: existing, error: fetchError } = await client
    .from('invoices')
    .select('status')
    .eq('id', args.input.invoiceId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (fetchError) return err(ErrorCode.DB_ERROR, fetchError.message);
  if (!existing) return err(ErrorCode.NOT_FOUND, 'Invoice not found.');
  if (existing.status !== 'draft') {
    return err(ErrorCode.VALIDATION_ERROR, 'Only draft invoices can be edited.');
  }

  const update: InvoiceUpdate = {
    title: args.input.title.trim() || null,
    kind: args.input.kind,
    issued_date: args.input.issuedDate.trim() || undefined,
    due_date: args.input.dueDate.trim() || null,
    discount_amount: args.input.discountAmount,
    tax_pct: args.input.taxPct,
    notes: args.input.notes.trim() || null,
    terms: args.input.terms.trim() || null,
  };

  const { error } = await client
    .from('invoices')
    .update(update)
    .eq('id', args.input.invoiceId)
    .eq('org_id', args.orgId);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await recalcInvoiceTotals(client, { invoiceId: args.input.invoiceId, orgId: args.orgId });

  const { data: refreshed, error: refreshError } = await client
    .from('invoices')
    .select('*')
    .eq('id', args.input.invoiceId)
    .single();

  if (refreshError) return err(ErrorCode.DB_ERROR, refreshError.message);
  return ok(refreshed);
}

// ---------------------------------------------------------------------------
// Line item mutations — invoice_line_items.total is a generated column
// (quantity * unit_price); there is no DB trigger recalculating the parent
// invoice's subtotal/tax_amount/total, so we recompute after every mutation,
// same as the quotes module does for quote_line_items.
// ---------------------------------------------------------------------------

/**
 * Recalculates subtotal/tax_amount/total for an invoice. The arithmetic
 * itself lives in exactly one place — the recalc_invoice_totals() SQL
 * function (migration 20260803040000) — so this stays a thin wrapper
 * rather than a second copy of the formula that could drift from it. A
 * database trigger on invoice_line_items already calls the same SQL
 * function automatically on every insert/update/delete (covering
 * generateFinalInvoiceFromWorking()'s raw line-item copy, which doesn't go
 * through this TS layer at all); this explicit call after each of this
 * file's own mutations is a defensive belt-and-suspenders, not the primary
 * mechanism. Never touches amount_paid — owned exclusively by the
 * apply_payment_to_invoice() payment trigger.
 */
async function recalcInvoiceTotals(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<void> {
  await client.rpc('recalc_invoice_totals', { p_invoice_id: args.invoiceId });
}

async function assertDraftInvoice(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<Result<{ id: string }>> {
  const { data: invoice, error } = await client
    .from('invoices')
    .select('id, status')
    .eq('id', args.invoiceId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, `Invoice ${args.invoiceId} not found`);
  if (invoice.status !== 'draft') {
    return err(ErrorCode.FORBIDDEN, 'Line items can only be edited on draft invoices.');
  }

  return ok({ id: invoice.id });
}

export async function addInvoiceLineItem(
  client: DbClient,
  args: { input: AddInvoiceLineItemInput; orgId: string }
): Promise<Result<InvoiceLineItem>> {
  const guard = await assertDraftInvoice(client, {
    invoiceId: args.input.invoiceId,
    orgId: args.orgId,
  });
  if (!guard.success) return guard;

  const payload: InvoiceLineItemInsert = {
    description: args.input.description ?? null,
    invoice_id: args.input.invoiceId,
    name: args.input.name,
    quantity: args.input.quantity,
    unit: args.input.unit,
    unit_price: args.input.unitPrice,
  };

  const { data: lineItem, error } = await client
    .from('invoice_line_items')
    .insert(payload)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await recalcInvoiceTotals(client, { invoiceId: args.input.invoiceId, orgId: args.orgId });

  return ok(lineItem);
}

export async function updateInvoiceLineItem(
  client: DbClient,
  args: { input: UpdateInvoiceLineItemInput; orgId: string }
): Promise<Result<InvoiceLineItem>> {
  const guard = await assertDraftInvoice(client, {
    invoiceId: args.input.invoiceId,
    orgId: args.orgId,
  });
  if (!guard.success) return guard;

  const { data: existing, error: existingError } = await client
    .from('invoice_line_items')
    .select('id')
    .eq('id', args.input.lineItemId)
    .eq('invoice_id', args.input.invoiceId)
    .maybeSingle();

  if (existingError) return err(ErrorCode.DB_ERROR, existingError.message);
  if (!existing) return err(ErrorCode.NOT_FOUND, `Line item ${args.input.lineItemId} not found`);

  const { data: lineItem, error } = await client
    .from('invoice_line_items')
    .update({
      description: args.input.description ?? null,
      name: args.input.name,
      quantity: args.input.quantity,
      unit: args.input.unit,
      unit_price: args.input.unitPrice,
    })
    .eq('id', args.input.lineItemId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await recalcInvoiceTotals(client, { invoiceId: args.input.invoiceId, orgId: args.orgId });

  return ok(lineItem);
}

export async function removeInvoiceLineItem(
  client: DbClient,
  args: { input: RemoveInvoiceLineItemInput; orgId: string }
): Promise<Result<{ lineItemId: string }>> {
  const guard = await assertDraftInvoice(client, {
    invoiceId: args.input.invoiceId,
    orgId: args.orgId,
  });
  if (!guard.success) return guard;

  const { error } = await client
    .from('invoice_line_items')
    .delete()
    .eq('id', args.input.lineItemId)
    .eq('invoice_id', args.input.invoiceId);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await recalcInvoiceTotals(client, { invoiceId: args.input.invoiceId, orgId: args.orgId });

  return ok({ lineItemId: args.input.lineItemId });
}

// ---------------------------------------------------------------------------
// Send / void
// ---------------------------------------------------------------------------

export async function sendInvoice(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<Result<Invoice>> {
  const { data: invoice, error: fetchError } = await client
    .from('invoices')
    .select('id, status')
    .eq('id', args.invoiceId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (fetchError) return err(ErrorCode.DB_ERROR, fetchError.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, 'Invoice not found.');
  if (invoice.status !== 'draft') {
    return err(
      ErrorCode.VALIDATION_ERROR,
      `Invoice is already ${invoice.status} — only draft invoices can be sent.`
    );
  }

  const { data: updated, error } = await client
    .from('invoices')
    .update({ status: 'sent' })
    .eq('id', args.invoiceId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(updated);
}

export async function voidInvoice(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<Result<Invoice>> {
  const { data: invoice, error: fetchError } = await client
    .from('invoices')
    .select('id, status')
    .eq('id', args.invoiceId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (fetchError) return err(ErrorCode.DB_ERROR, fetchError.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, 'Invoice not found.');
  if (invoice.status === 'void') {
    return ok(invoice as Invoice); // idempotent — already void
  }
  if (invoice.status === 'paid') {
    return err(ErrorCode.VALIDATION_ERROR, 'A fully paid invoice cannot be voided.');
  }

  const { data: updated, error } = await client
    .from('invoices')
    .update({ status: 'void' })
    .eq('id', args.invoiceId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(updated);
}

// ---------------------------------------------------------------------------
// Payments — the actual recalculation (amount_paid, status, overpayment /
// void guards) happens atomically inside the apply_payment_to_invoice()
// trigger (migration 20260722000000); this just inserts and translates any
// trigger-raised exception into a friendly Result.
// ---------------------------------------------------------------------------

export async function recordPayment(
  client: DbClient,
  args: { input: RecordPaymentInput; orgId: string; actorUserId?: string }
): Promise<Result<Payment>> {
  const { data: invoice, error: fetchError } = await client
    .from('invoices')
    .select('id')
    .eq('id', args.input.invoiceId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (fetchError) return err(ErrorCode.DB_ERROR, fetchError.message);
  if (!invoice) return err(ErrorCode.NOT_FOUND, 'Invoice not found.');

  const payload: PaymentInsert = {
    amount: args.input.amount,
    invoice_id: args.input.invoiceId,
    method: args.input.method,
    notes: args.input.notes ?? null,
    org_id: args.orgId,
    paid_at: new Date(args.input.paidAt).toISOString(),
    reference: args.input.reference ?? null,
  };

  const { data: payment, error } = await client
    .from('payments')
    .insert(payload)
    .select('*')
    .single();

  if (error) return translatePaymentError(error.message);

  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: 'invoice',
    entity_id: args.input.invoiceId,
    event_type: 'payment_recorded',
    message: `Payment of ${args.input.amount} recorded.`,
    actor_user_id: args.actorUserId ?? null,
  });

  return ok(payment);
}

export async function listPaymentsForInvoice(
  client: DbClient,
  args: { invoiceId: string; orgId: string }
): Promise<Result<Payment[]>> {
  const { data, error } = await client
    .from('payments')
    .select('*')
    .eq('invoice_id', args.invoiceId)
    .eq('org_id', args.orgId)
    .order('paid_at', { ascending: false });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data ?? []);
}
