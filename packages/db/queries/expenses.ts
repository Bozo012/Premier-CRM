import {
  ErrorCode,
  err,
  ok,
  type ApproveExpenseInput,
  type CreateExpenseInput,
  type ExpenseBillingTreatment,
  type ExpenseFilter,
  type ExpenseStatus,
  type ListExpensesArgs,
  type RejectExpenseInput,
  type Result,
  type UpdateExpenseInput,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

import { logActivity } from './activity-log';

export type Expense = Database['public']['Tables']['expenses']['Row'];
type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type ExpenseUpdate = Database['public']['Tables']['expenses']['Update'];

type CustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'company_name' | 'display_name' | 'first_name' | 'id' | 'last_name'
>;

type PropertyRow = Pick<
  Database['public']['Tables']['properties']['Row'],
  'address_line_1' | 'address_line_2' | 'city' | 'id' | 'state' | 'zip'
>;

type JobRow = Pick<
  Database['public']['Tables']['jobs']['Row'],
  'customer_id' | 'id' | 'job_number' | 'property_id' | 'status' | 'title'
>;

type InvoiceRow = Pick<
  Database['public']['Tables']['invoices']['Row'],
  'id' | 'invoice_number' | 'status'
>;

export interface ExpenseListCustomerSummary {
  displayName: string;
  id: string;
}

export interface ExpenseListPropertySummary {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  id: string;
  state: string;
  zip: string;
}

export interface ExpenseListJobSummary {
  id: string;
  jobNumber: string | null;
  status: string;
  title: string;
}

export interface ExpenseListInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
}

export interface ExpenseListItem {
  customer: ExpenseListCustomerSummary | null;
  expense: Expense;
  invoice: ExpenseListInvoiceSummary | null;
  job: ExpenseListJobSummary | null;
  property: ExpenseListPropertySummary | null;
}

export interface ExpenseSummaryCard {
  id: 'pending-review' | 'approved-cost' | 'invoiced-to-customers';
  label: string;
  value: number;
}

export interface ExpenseFilterCount {
  count: number;
  id: ExpenseFilter;
  label: string;
}

export interface ExpenseListPage {
  expenses: ExpenseListItem[];
  filters: ExpenseFilterCount[];
  summary: ExpenseSummaryCard[];
  total: number;
}

export interface ExpenseDetail extends ExpenseListItem {
  activity: Database['public']['Tables']['activity_log']['Row'][];
}

const FILTERS: Array<{ id: ExpenseFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'ready-to-invoice', label: 'Ready to invoice' },
  { id: 'invoiced', label: 'Invoiced' },
  { id: 'internal-only', label: 'Internal only' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'missing-receipt', label: 'Missing receipt' },
];

const REVIEW_STATUSES = new Set<ExpenseStatus>(['submitted', 'needs_receipt', 'needs_review']);
const APPROVED_COST_STATUSES = new Set<ExpenseStatus>([
  'approved',
  'internal_only',
  'ready_to_invoice',
  'partially_invoiced',
  'invoiced',
  'reimbursed',
]);
const INVOICED_STATUSES = new Set<ExpenseStatus>([
  'partially_invoiced',
  'invoiced',
  'reimbursed',
]);
const TERMINAL_STATUSES = new Set<ExpenseStatus>([
  'rejected',
  'internal_only',
  'invoiced',
  'reimbursed',
  'voided',
]);

function normalizeForSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
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
): ExpenseListCustomerSummary | null {
  if (!customer) return null;
  return {
    displayName: resolveCustomerDisplayName(customer),
    id: customer.id,
  };
}

function toPropertySummary(
  property: PropertyRow | null | undefined
): ExpenseListPropertySummary | null {
  if (!property) return null;
  return {
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    id: property.id,
    state: property.state,
    zip: property.zip,
  };
}

function toJobSummary(job: JobRow | null | undefined): ExpenseListJobSummary | null {
  if (!job) return null;
  return {
    id: job.id,
    jobNumber: job.job_number,
    status: job.status,
    title: job.title,
  };
}

function toInvoiceSummary(
  invoice: InvoiceRow | null | undefined
): ExpenseListInvoiceSummary | null {
  if (!invoice) return null;
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
  };
}

export function expenseMatchesFilter(
  expense: Pick<Expense, 'receipt_vault_item_id' | 'status'>,
  filter: ExpenseFilter
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'draft':
      return expense.status === 'draft';
    case 'submitted':
      return expense.status === 'submitted';
    case 'needs-review':
      return REVIEW_STATUSES.has(expense.status as ExpenseStatus);
    case 'approved':
      return expense.status === 'approved';
    case 'ready-to-invoice':
      return expense.status === 'ready_to_invoice';
    case 'invoiced':
      return INVOICED_STATUSES.has(expense.status as ExpenseStatus);
    case 'internal-only':
      return expense.status === 'internal_only';
    case 'rejected':
      return expense.status === 'rejected' || expense.status === 'voided';
    case 'missing-receipt':
      return expense.receipt_vault_item_id === null;
  }
}

function itemMatchesSearch(item: ExpenseListItem, search: string | undefined): boolean {
  if (!search) return true;
  const needle = normalizeForSearch(search);
  const haystack = [
    item.expense.amount.toString(),
    item.expense.description,
    item.expense.expense_number,
    item.expense.vendor,
    item.customer?.displayName,
    item.job?.jobNumber,
    item.job?.title,
    item.property?.addressLine1,
    item.property?.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  return haystack.includes(needle);
}

export function deriveApprovedExpenseStatus(
  input: Pick<ApproveExpenseInput, 'billingTreatment' | 'customerChargeAmount'>
): ExpenseStatus {
  if (input.billingTreatment === 'internal_cost_only' || input.billingTreatment === 'non_billable') {
    return 'internal_only';
  }

  if (
    input.billingTreatment === 'reimbursable_at_cost' ||
    input.billingTreatment === 'billable_with_markup' ||
    input.billingTreatment === 'customer_approved_pass_through'
  ) {
    return (input.customerChargeAmount ?? 0) > 0 ? 'ready_to_invoice' : 'approved';
  }

  return 'approved';
}

function buildSummary(items: ExpenseListItem[]): ExpenseSummaryCard[] {
  const pendingReview = items
    .filter((item) => REVIEW_STATUSES.has(item.expense.status as ExpenseStatus))
    .reduce((sum, item) => sum + (item.expense.total_cost ?? item.expense.amount + item.expense.tax), 0);
  const approvedCost = items
    .filter((item) => APPROVED_COST_STATUSES.has(item.expense.status as ExpenseStatus))
    .reduce((sum, item) => sum + (item.expense.total_cost ?? item.expense.amount + item.expense.tax), 0);
  const invoicedToCustomers = items
    .filter((item) => INVOICED_STATUSES.has(item.expense.status as ExpenseStatus))
    .reduce((sum, item) => sum + (item.expense.customer_charge_amount ?? 0), 0);

  return [
    { id: 'pending-review', label: 'Pending review', value: pendingReview },
    { id: 'approved-cost', label: 'Approved cost', value: approvedCost },
    { id: 'invoiced-to-customers', label: 'Invoiced to customers', value: invoicedToCustomers },
  ];
}

function buildFilterCounts(items: ExpenseListItem[]): ExpenseFilterCount[] {
  return FILTERS.map((filter) => ({
    ...filter,
    count: items.filter((item) => expenseMatchesFilter(item.expense, filter.id)).length,
  }));
}

async function hydrateExpenseItems(
  client: DbClient,
  orgId: string,
  expenses: Expense[]
): Promise<Result<ExpenseListItem[]>> {
  if (expenses.length === 0) return ok([]);

  const customerIds = Array.from(new Set(expenses.map((expense) => expense.customer_id)));
  const propertyIds = Array.from(new Set(expenses.map((expense) => expense.property_id)));
  const jobIds = Array.from(new Set(expenses.map((expense) => expense.job_id)));
  const invoiceIds = Array.from(
    new Set(
      expenses
        .map((expense) => expense.invoice_id)
        .filter((invoiceId): invoiceId is string => Boolean(invoiceId))
    )
  );

  const [customersResult, propertiesResult, jobsResult, invoicesResult] = await Promise.all([
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
    client
      .from('jobs')
      .select('id, customer_id, property_id, job_number, status, title')
      .eq('org_id', orgId)
      .in('id', jobIds),
    invoiceIds.length > 0
      ? client
          .from('invoices')
          .select('id, invoice_number, status')
          .eq('org_id', orgId)
          .in('id', invoiceIds)
      : Promise.resolve({ data: [] as InvoiceRow[], error: null }),
  ]);

  if (customersResult.error) return err(ErrorCode.DB_ERROR, customersResult.error.message);
  if (propertiesResult.error) return err(ErrorCode.DB_ERROR, propertiesResult.error.message);
  if (jobsResult.error) return err(ErrorCode.DB_ERROR, jobsResult.error.message);
  if (invoicesResult.error) return err(ErrorCode.DB_ERROR, invoicesResult.error.message);

  const customersById = new Map(
    (customersResult.data ?? []).map((customer) => [customer.id, customer as CustomerRow])
  );
  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((property) => [property.id, property as PropertyRow])
  );
  const jobsById = new Map((jobsResult.data ?? []).map((job) => [job.id, job as JobRow]));
  const invoicesById = new Map(
    (invoicesResult.data ?? []).map((invoice) => [invoice.id, invoice as InvoiceRow])
  );

  return ok(
    expenses.map((expense) => ({
      customer: toCustomerSummary(customersById.get(expense.customer_id)),
      expense,
      invoice: expense.invoice_id ? toInvoiceSummary(invoicesById.get(expense.invoice_id)) : null,
      job: toJobSummary(jobsById.get(expense.job_id)),
      property: toPropertySummary(propertiesById.get(expense.property_id)),
    }))
  );
}

export async function listExpenses(
  client: DbClient,
  args: ListExpensesArgs & { orgId: string }
): Promise<Result<ExpenseListPage>> {
  const { filter, limit, offset, orgId, search, status } = args;

  let query = client
    .from('expenses')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500);

  const { data, error } = await query;
  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const hydratedResult = await hydrateExpenseItems(client, orgId, data ?? []);
  if (!hydratedResult.success) return hydratedResult;

  const allItems = search
    ? hydratedResult.data.filter((item) => itemMatchesSearch(item, search))
    : hydratedResult.data;
  const filteredItems =
    status
      ? allItems.filter((item) => item.expense.status === status)
      : filter === 'all'
      ? allItems
      : allItems.filter((item) => expenseMatchesFilter(item.expense, filter));

  return ok({
    expenses: filteredItems.slice(offset, offset + limit),
    filters: buildFilterCounts(allItems),
    summary: buildSummary(allItems),
    total: filteredItems.length,
  });
}

/** Expenses tied to a customer (via the direct `expenses.customer_id` FK) — for the Customer detail page. */
export async function listExpensesForCustomer(
  client: DbClient,
  args: { orgId: string; customerId: string }
): Promise<Result<ExpenseListItem[]>> {
  const { data, error } = await client
    .from('expenses')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('customer_id', args.customerId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return hydrateExpenseItems(client, args.orgId, data ?? []);
}

/** Expenses tied to a property (via the direct `expenses.property_id` FK) — for the Property detail page. */
export async function listExpensesForProperty(
  client: DbClient,
  args: { orgId: string; propertyId: string }
): Promise<Result<ExpenseListItem[]>> {
  const { data, error } = await client
    .from('expenses')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('property_id', args.propertyId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return hydrateExpenseItems(client, args.orgId, data ?? []);
}

export async function getExpenseById(
  client: DbClient,
  args: { expenseId: string; orgId: string }
): Promise<Result<ExpenseDetail>> {
  const { data: expense, error } = await client
    .from('expenses')
    .select('*')
    .eq('id', args.expenseId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!expense) return err(ErrorCode.NOT_FOUND, `Expense ${args.expenseId} not found`);

  const hydratedResult = await hydrateExpenseItems(client, args.orgId, [expense]);
  if (!hydratedResult.success) return hydratedResult;
  const item = hydratedResult.data[0];
  if (!item) return err(ErrorCode.NOT_FOUND, `Expense ${args.expenseId} not found`);

  const { data: activity, error: activityError } = await client
    .from('activity_log')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('entity_type', 'expense')
    .eq('entity_id', args.expenseId)
    .order('created_at', { ascending: true });

  if (activityError) return err(ErrorCode.DB_ERROR, activityError.message);

  return ok({
    ...item,
    activity: activity ?? [],
  });
}

async function getJobForExpense(
  client: DbClient,
  args: { jobId: string; orgId: string }
): Promise<Result<JobRow>> {
  const { data: job, error } = await client
    .from('jobs')
    .select('id, customer_id, property_id, job_number, status, title')
    .eq('id', args.jobId)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!job) return err(ErrorCode.NOT_FOUND, 'Selected job was not found.');
  return ok(job);
}

function normalizeCustomerCopy(input: CreateExpenseInput | UpdateExpenseInput): string | null {
  if (
    input.billingTreatment === 'reimbursable_at_cost' ||
    input.billingTreatment === 'billable_with_markup' ||
    input.billingTreatment === 'customer_approved_pass_through'
  ) {
    return input.customerVisibleDescription?.trim() || null;
  }

  return null;
}

export async function createExpense(
  client: DbClient,
  args: { createdBy: string; input: CreateExpenseInput; orgId: string }
): Promise<Result<Expense>> {
  const jobResult = await getJobForExpense(client, { jobId: args.input.jobId, orgId: args.orgId });
  if (!jobResult.success) return jobResult;

  const input = args.input;
  const insert: ExpenseInsert = {
    amount: input.amount,
    billing_treatment: input.billingTreatment,
    category: input.category,
    created_by: args.createdBy,
    customer_charge_amount: input.customerChargeAmount ?? null,
    customer_id: jobResult.data.customer_id,
    customer_visible_description: normalizeCustomerCopy(input),
    description: input.description,
    internal_notes: input.internalNotes,
    job_id: jobResult.data.id,
    markup_pct: input.markupPct ?? null,
    org_id: args.orgId,
    payment_method: input.paymentMethod,
    property_id: jobResult.data.property_id,
    purchase_date: input.purchaseDate,
    receipt_vault_item_id: input.receiptVaultItemId ?? null,
    receipt_visibility: input.receiptVisibility,
    tax: input.tax,
    vendor: input.vendor,
  };

  const { data, error } = await client.from('expenses').insert(insert).select('*').single();
  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await logActivity(client, {
    actorUserId: args.createdBy,
    entityId: data.id,
    entityType: 'expense',
    eventType: 'expense_created',
    message: `Expense ${data.expense_number} created.`,
    orgId: args.orgId,
  });

  return ok(data);
}

export async function updateExpense(
  client: DbClient,
  args: { input: UpdateExpenseInput; orgId: string }
): Promise<Result<Expense>> {
  const existingResult = await getExpenseById(client, {
    expenseId: args.input.expenseId,
    orgId: args.orgId,
  });
  if (!existingResult.success) return existingResult;
  if (existingResult.data.expense.status !== 'draft') {
    return err(ErrorCode.VALIDATION_ERROR, 'Only draft expenses can be edited.');
  }

  const jobResult = await getJobForExpense(client, { jobId: args.input.jobId, orgId: args.orgId });
  if (!jobResult.success) return jobResult;

  const input = args.input;
  const update: ExpenseUpdate = {
    amount: input.amount,
    billing_treatment: input.billingTreatment,
    category: input.category,
    customer_charge_amount: input.customerChargeAmount ?? null,
    customer_id: jobResult.data.customer_id,
    customer_visible_description: normalizeCustomerCopy(input),
    description: input.description,
    internal_notes: input.internalNotes,
    job_id: jobResult.data.id,
    markup_pct: input.markupPct ?? null,
    payment_method: input.paymentMethod,
    property_id: jobResult.data.property_id,
    purchase_date: input.purchaseDate,
    receipt_vault_item_id: input.receiptVaultItemId ?? null,
    receipt_visibility: input.receiptVisibility,
    tax: input.tax,
    vendor: input.vendor,
  };

  const { data, error } = await client
    .from('expenses')
    .update(update)
    .eq('id', input.expenseId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data);
}

export async function submitExpense(
  client: DbClient,
  args: { actorUserId: string; expenseId: string; orgId: string }
): Promise<Result<Expense>> {
  const existingResult = await getExpenseById(client, {
    expenseId: args.expenseId,
    orgId: args.orgId,
  });
  if (!existingResult.success) return existingResult;
  if (existingResult.data.expense.status !== 'draft') {
    return err(ErrorCode.VALIDATION_ERROR, 'Only draft expenses can be submitted.');
  }

  const { data, error } = await client
    .from('expenses')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: args.actorUserId,
    })
    .eq('id', args.expenseId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await logActivity(client, {
    actorUserId: args.actorUserId,
    entityId: data.id,
    entityType: 'expense',
    eventType: 'expense_submitted',
    message: `Expense ${data.expense_number} submitted for review.`,
    orgId: args.orgId,
  });

  return ok(data);
}

export async function approveExpense(
  client: DbClient,
  args: { actorUserId: string; input: ApproveExpenseInput; orgId: string }
): Promise<Result<Expense>> {
  const existingResult = await getExpenseById(client, {
    expenseId: args.input.expenseId,
    orgId: args.orgId,
  });
  if (!existingResult.success) return existingResult;

  const existing = existingResult.data.expense;
  if (!REVIEW_STATUSES.has(existing.status as ExpenseStatus)) {
    return err(ErrorCode.VALIDATION_ERROR, 'Only submitted expenses can be approved.');
  }
  if (TERMINAL_STATUSES.has(existing.status as ExpenseStatus)) {
    return err(ErrorCode.VALIDATION_ERROR, 'This expense is already closed.');
  }

  const nextStatus = deriveApprovedExpenseStatus(args.input);
  const { data, error } = await client
    .from('expenses')
    .update({
      approval_comment: args.input.approvalComment,
      approved_at: new Date().toISOString(),
      approved_by: args.actorUserId,
      billing_treatment: args.input.billingTreatment,
      customer_charge_amount: args.input.customerChargeAmount ?? null,
      status: nextStatus,
    })
    .eq('id', args.input.expenseId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await logActivity(client, {
    actorUserId: args.actorUserId,
    entityId: data.id,
    entityType: 'expense',
    eventType: 'expense_approved',
    message: `Expense ${data.expense_number} approved as ${data.billing_treatment}.`,
    orgId: args.orgId,
  });

  return ok(data);
}

export async function rejectExpense(
  client: DbClient,
  args: { actorUserId: string; input: RejectExpenseInput; orgId: string }
): Promise<Result<Expense>> {
  const existingResult = await getExpenseById(client, {
    expenseId: args.input.expenseId,
    orgId: args.orgId,
  });
  if (!existingResult.success) return existingResult;
  if (!REVIEW_STATUSES.has(existingResult.data.expense.status as ExpenseStatus)) {
    return err(ErrorCode.VALIDATION_ERROR, 'Only submitted expenses can be rejected.');
  }

  const { data, error } = await client
    .from('expenses')
    .update({
      approval_comment: args.input.rejectionComment,
      rejected_at: new Date().toISOString(),
      rejected_by: args.actorUserId,
      status: 'rejected',
    })
    .eq('id', args.input.expenseId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await logActivity(client, {
    actorUserId: args.actorUserId,
    entityId: data.id,
    entityType: 'expense',
    eventType: 'expense_rejected',
    message: `Expense ${data.expense_number} rejected.`,
    orgId: args.orgId,
  });

  return ok(data);
}

export async function voidExpense(
  client: DbClient,
  args: { actorUserId: string; expenseId: string; orgId: string }
): Promise<Result<Expense>> {
  const existingResult = await getExpenseById(client, {
    expenseId: args.expenseId,
    orgId: args.orgId,
  });
  if (!existingResult.success) return existingResult;
  if (TERMINAL_STATUSES.has(existingResult.data.expense.status as ExpenseStatus)) {
    return err(ErrorCode.VALIDATION_ERROR, 'This expense is already closed.');
  }

  const { data, error } = await client
    .from('expenses')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: args.actorUserId,
    })
    .eq('id', args.expenseId)
    .eq('org_id', args.orgId)
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await logActivity(client, {
    actorUserId: args.actorUserId,
    entityId: data.id,
    entityType: 'expense',
    eventType: 'expense_voided',
    message: `Expense ${data.expense_number} voided.`,
    orgId: args.orgId,
  });

  return ok(data);
}
