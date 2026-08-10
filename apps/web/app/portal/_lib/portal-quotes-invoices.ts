import {
  createServiceClient,
  listInvoicesForJob,
  listQuotesForEstimate,
  listQuotesForJob,
} from '@premier/db';

// ---------------------------------------------------------------------------
// Ownership-then-detail-fetch pattern for quotes/invoices, extended from the
// exact pattern already used by the dashboard for deposits, working-invoice
// totals, and change orders (getDepositState/getWorkingInvoiceSummaryFor
// Customer/listChangeOrdersForJob, all called with the service client only
// after a job's ownership is confirmed via an RLS-scoped `.eq('customer_id',
// account.customerId)` query). This is NOT a new authorization model — the
// service client here is only ever asked about jobs/estimates whose
// ownership was already confirmed by the caller through the portal-scoped
// (RLS-authenticated) client.
//
// Quotes at the pre-job estimate stage (quotes.job_id nullable per
// 20260511160215_make_quotes_job_id_nullable.sql) are reached the same way:
// via service_requests.estimate_id, once that service_request's ownership
// is already confirmed by `.eq('customer_id', ...)`.
//
// Row shapes here are deliberately narrow (only the customer-safe fields the
// portal actually renders), not the full internal DB row — so this file
// itself is a customer-safe-field boundary, not just an authorization one.
// ---------------------------------------------------------------------------

export interface OwnedJobRef {
  id: string;
  orgId: string;
  title: string;
}

export interface OwnedEstimateRef {
  estimateId: string;
  orgId: string;
  requestNumber: string;
  serviceTitle: string;
}

export interface PortalQuoteRow {
  id: string;
  quoteNumber: string | null;
  title: string | null;
  status: string;
  total: number;
  createdAt: string;
  shareToken: string | null;
  sourceLabel: string;
}

export interface PortalInvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string | null;
  issuedDate: string;
  createdAt: string;
  shareToken: string | null;
  jobTitle: string;
}

/**
 * customer_select_own_invoices RLS explicitly excludes kind='working'
 * invoices from direct customer SELECT (they carry internal notes) — this
 * pure predicate is the one place that boundary is enforced for the portal
 * invoices view, extracted for unit testing since it is a customer-safety
 * rule, not just a mechanical filter.
 */
export function isPortalVisibleInvoiceKind(kind: string): boolean {
  return kind !== 'working';
}

export async function listPortalQuotes(args: {
  jobs: OwnedJobRef[];
  estimates: OwnedEstimateRef[];
}): Promise<PortalQuoteRow[]> {
  const serviceClient = createServiceClient();
  const rows: PortalQuoteRow[] = [];

  await Promise.all(
    args.jobs.map(async (job) => {
      const result = await listQuotesForJob(serviceClient, { jobId: job.id, orgId: job.orgId });
      if (!result.success) return;
      for (const item of result.data) {
        rows.push({
          id: item.quote.id,
          quoteNumber: item.quote.quote_number,
          title: item.quote.title,
          status: item.quote.status,
          total: item.quote.total ?? 0,
          createdAt: item.quote.created_at,
          shareToken: item.quote.share_token,
          sourceLabel: job.title,
        });
      }
    })
  );

  const seenIds = new Set(rows.map((r) => r.id));

  await Promise.all(
    args.estimates.map(async (estimate) => {
      const result = await listQuotesForEstimate(serviceClient, {
        estimateId: estimate.estimateId,
        orgId: estimate.orgId,
      });
      if (!result.success) return;
      for (const linked of result.data) {
        // A quote already attached to one of the owned jobs above (once
        // converted from estimate to job) would otherwise show up twice.
        if (seenIds.has(linked.id)) continue;
        seenIds.add(linked.id);
        rows.push({
          id: linked.id,
          quoteNumber: linked.quoteNumber,
          title: linked.title,
          status: linked.status,
          total: linked.total ?? 0,
          createdAt: linked.createdAt,
          shareToken: null, // filled in below — listQuotesForEstimate's select doesn't include it
          sourceLabel: `${estimate.requestNumber} · ${estimate.serviceTitle}`,
        });
      }
    })
  );

  // listQuotesForEstimate's select() doesn't project share_token — fetch it
  // in one follow-up batch for those rows so the "Review quote" link is
  // always real, never fabricated.
  const missingTokenIds = rows.filter((r) => r.shareToken === null).map((r) => r.id);
  if (missingTokenIds.length > 0) {
    const { data } = await serviceClient.from('quotes').select('id, share_token').in('id', missingTokenIds);
    const tokenById = new Map((data ?? []).map((r) => [r.id, r.share_token]));
    for (const row of rows) {
      if (row.shareToken === null) {
        row.shareToken = tokenById.get(row.id) ?? null;
      }
    }
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}

export async function listPortalInvoices(args: { jobs: OwnedJobRef[] }): Promise<PortalInvoiceRow[]> {
  const serviceClient = createServiceClient();
  const rows: PortalInvoiceRow[] = [];

  await Promise.all(
    args.jobs.map(async (job) => {
      const result = await listInvoicesForJob(serviceClient, { jobId: job.id, orgId: job.orgId });
      if (!result.success) return;
      for (const item of result.data) {
        // customer_select_own_invoices RLS explicitly excludes kind='working'
        // invoices from direct customer SELECT (they carry internal notes) —
        // the portal must honor that same boundary here even though this
        // read goes through the service client, since the RLS exclusion is
        // an intentional customer-safety rule, not just a mechanical grant.
        if (!isPortalVisibleInvoiceKind(item.invoice.kind)) continue;
        rows.push({
          id: item.invoice.id,
          invoiceNumber: item.invoice.invoice_number,
          status: item.invoice.status,
          total: item.invoice.total ?? 0,
          amountPaid: item.invoice.amount_paid ?? 0,
          amountDue: item.invoice.amount_due ?? 0,
          dueDate: item.invoice.due_date,
          issuedDate: item.invoice.issued_date,
          createdAt: item.invoice.created_at,
          shareToken: item.invoice.share_token,
          jobTitle: job.title,
        });
      }
    })
  );

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}
