/**
 * Working invoice — the one editable, never-sent, never-paid ledger a job
 * accumulates actuals/approved change-order lines/credits against while
 * work is in progress (DB triggers block it from ever being sent or paid
 * directly — see 20260731130000_working_invoice_foundations.sql). The
 * final invoice is a separate, snapshotted row — this file's
 * generateFinalInvoiceFromWorking() copies content, it never repurposes
 * the working invoice's own kind.
 *
 * Customer-facing reads MUST go through getWorkingInvoiceSummaryForCustomer
 * — RLS already hides the working-invoice row from the customer entirely
 * (customer_select_own_invoices excludes kind='working'), so this is the
 * intentional, narrow replacement: a running total only, no internal
 * notes/source attribution.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row'];

export interface WorkingInvoiceDetail {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
}

export async function getWorkingInvoice(
  client: DbClient,
  args: { orgId: string; jobId: string }
): Promise<Result<WorkingInvoiceDetail | null>> {
  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .eq('kind', 'working')
    .neq('status', 'void')
    .maybeSingle();

  if (invoiceError) return err(ErrorCode.DB_ERROR, invoiceError.message);
  if (!invoice) return ok(null);

  const { data: lineItems, error: lineItemsError } = await client
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order');

  if (lineItemsError) return err(ErrorCode.DB_ERROR, lineItemsError.message);

  return ok({ invoice, lineItems: lineItems ?? [] });
}

export interface WorkingInvoiceCustomerSummary {
  lineCount: number;
  runningTotal: number;
}

/** Presentation-layer read: total and line count only. No notes, no source attribution, no internal detail. */
export async function getWorkingInvoiceSummaryForCustomer(
  client: DbClient,
  args: { jobId: string }
): Promise<Result<WorkingInvoiceCustomerSummary | null>> {
  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select('id')
    .eq('job_id', args.jobId)
    .eq('kind', 'working')
    .neq('status', 'void')
    .maybeSingle();

  if (invoiceError) return err(ErrorCode.DB_ERROR, invoiceError.message);
  if (!invoice) return ok(null);

  const { data: lineItems, error: lineItemsError } = await client
    .from('invoice_line_items')
    .select('total')
    .eq('invoice_id', invoice.id);

  if (lineItemsError) return err(ErrorCode.DB_ERROR, lineItemsError.message);

  const runningTotal = (lineItems ?? []).reduce((sum, item) => sum + (item.total ?? 0), 0);
  return ok({ lineCount: lineItems?.length ?? 0, runningTotal });
}

export async function generateFinalInvoiceFromWorking(
  client: DbClient,
  args: { orgId: string; jobId: string }
): Promise<Result<{ finalInvoiceId: string }>> {
  const { data: working, error: workingError } = await client
    .from('invoices')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .eq('kind', 'working')
    .neq('status', 'void')
    .maybeSingle();

  if (workingError) return err(ErrorCode.DB_ERROR, workingError.message);
  if (!working) return err(ErrorCode.NOT_FOUND, 'No working invoice found for this job.');
  if (working.finalized_into_invoice_id) {
    return ok({ finalInvoiceId: working.finalized_into_invoice_id });
  }

  const { data: lineItems, error: lineItemsError } = await client
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', working.id)
    .order('sort_order');

  if (lineItemsError) return err(ErrorCode.DB_ERROR, lineItemsError.message);

  const { data: finalInvoice, error: insertError } = await client
    .from('invoices')
    .insert({
      org_id: args.orgId,
      job_id: args.jobId,
      quote_id: working.quote_id,
      kind: 'final',
      status: 'draft',
      title: working.title ?? 'Final invoice',
      notes: working.notes,
      terms: working.terms,
    })
    .select('id')
    .single();

  if (insertError || !finalInvoice) {
    return err(ErrorCode.DB_ERROR, insertError?.message ?? 'Failed to create final invoice.');
  }

  if (lineItems && lineItems.length > 0) {
    const { error: copyError } = await client.from('invoice_line_items').insert(
      lineItems.map((item) => ({
        invoice_id: finalInvoice.id,
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sort_order: item.sort_order,
        source_type: item.source_type,
        source_quote_line_id: item.source_quote_line_id,
        source_change_order_revision_id: item.source_change_order_revision_id,
        source_note: item.source_note,
      }))
    );
    if (copyError) return err(ErrorCode.DB_ERROR, copyError.message);
  }

  const { error: finalizeError } = await client
    .from('invoices')
    .update({ finalized_at: new Date().toISOString(), finalized_into_invoice_id: finalInvoice.id })
    .eq('id', working.id);

  if (finalizeError) return err(ErrorCode.DB_ERROR, finalizeError.message);

  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: 'invoice',
    entity_id: finalInvoice.id,
    event_type: 'final_invoice_generated',
    message: `Final invoice generated from working invoice ${working.id}.`,
  });

  return ok({ finalInvoiceId: finalInvoice.id });
}
