/**
 * job_deposits is a REQUIREMENT/CONFIGURATION record only (job_id, amount
 * or percentage, due date, blocks-scheduling/work-start flags, waiver).
 * Money — billed, paid, partial, refunded, credited — is never duplicated
 * here; it's derived at read time from the linked deposit invoice
 * (invoices.kind = 'deposit') and its payments, which stay the single
 * source of truth.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';
import { addInvoiceLineItem } from './invoices';

export type JobDeposit = Database['public']['Tables']['job_deposits']['Row'];

const DEPOSIT_INVOICE_UNIQUE_VIOLATION = '23505';

export type DepositPaymentStatus =
  | 'none'
  | 'required'
  | 'partially_paid'
  | 'paid'
  | 'waived'
  | 'refunded';

export interface DepositState {
  requirement: JobDeposit | null;
  paymentStatus: DepositPaymentStatus;
  invoiceTotal: number | null;
  amountPaid: number | null;
  amountDue: number | null;
}

export async function getDepositState(
  client: DbClient,
  args: { orgId: string; jobId: string }
): Promise<Result<DepositState>> {
  const { data: requirement, error: requirementError } = await client
    .from('job_deposits')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .maybeSingle();

  if (requirementError) return err(ErrorCode.DB_ERROR, requirementError.message);

  if (!requirement || requirement.requirement_status === 'none') {
    return ok({ requirement, paymentStatus: 'none', invoiceTotal: null, amountPaid: null, amountDue: null });
  }

  if (requirement.requirement_status === 'waived') {
    return ok({ requirement, paymentStatus: 'waived', invoiceTotal: null, amountPaid: null, amountDue: null });
  }

  if (!requirement.deposit_invoice_id) {
    return ok({ requirement, paymentStatus: 'required', invoiceTotal: null, amountPaid: null, amountDue: null });
  }

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select('status, total, amount_paid, amount_due')
    .eq('id', requirement.deposit_invoice_id)
    .maybeSingle();

  if (invoiceError) return err(ErrorCode.DB_ERROR, invoiceError.message);
  if (!invoice) {
    return ok({ requirement, paymentStatus: 'required', invoiceTotal: null, amountPaid: null, amountDue: null });
  }

  let paymentStatus: DepositPaymentStatus = 'required';
  if (invoice.status === 'refunded') paymentStatus = 'refunded';
  else if (invoice.status === 'paid') paymentStatus = 'paid';
  else if (invoice.status === 'partially_paid' || (invoice.amount_paid ?? 0) > 0) paymentStatus = 'partially_paid';

  return ok({
    requirement,
    paymentStatus,
    invoiceTotal: invoice.total,
    amountPaid: invoice.amount_paid,
    amountDue: invoice.amount_due,
  });
}

export async function setDepositRequirement(
  client: DbClient,
  args: {
    orgId: string;
    jobId: string;
    requiredAmount: number | null;
    requiredPercentage: number | null;
    dueDate: string | null;
    blocksScheduling: boolean;
    blocksWorkStart: boolean;
    actorUserId: string;
  }
): Promise<Result<{ requirement: JobDeposit }>> {
  const { data, error } = await client
    .from('job_deposits')
    .upsert(
      {
        org_id: args.orgId,
        job_id: args.jobId,
        requirement_status: 'required',
        required_amount: args.requiredAmount,
        required_percentage: args.requiredPercentage,
        due_date: args.dueDate,
        blocks_scheduling: args.blocksScheduling,
        blocks_work_start: args.blocksWorkStart,
        waived_reason: null,
        waived_by_user_id: null,
        waived_at: null,
      },
      { onConflict: 'job_id' }
    )
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: 'job',
    entity_id: args.jobId,
    event_type: 'deposit_requested',
    message: 'Deposit requirement set.',
    actor_user_id: args.actorUserId,
  });

  return ok({ requirement: data });
}

export async function waiveDepositRequirement(
  client: DbClient,
  args: { orgId: string; jobId: string; reason: string; waivedByUserId: string }
): Promise<Result<{ requirement: JobDeposit }>> {
  const { data, error } = await client
    .from('job_deposits')
    .upsert(
      {
        org_id: args.orgId,
        job_id: args.jobId,
        requirement_status: 'waived',
        waived_reason: args.reason,
        waived_by_user_id: args.waivedByUserId,
        waived_at: new Date().toISOString(),
      },
      { onConflict: 'job_id' }
    )
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: 'job',
    entity_id: args.jobId,
    event_type: 'deposit_waived',
    message: `Deposit waived: ${args.reason}`,
    actor_user_id: args.waivedByUserId,
  });

  return ok({ requirement: data });
}

/**
 * Creates the kind='deposit' invoice for a job's already-`required` deposit
 * requirement, and links it back via job_deposits.deposit_invoice_id — the
 * step no application code previously performed (found while populating the
 * Demo organization; see docs/implementation/deposit-invoice-creation.md).
 * Idempotent: a second call for the same job returns the existing deposit
 * invoice rather than creating a duplicate, both via the fast-path lookup
 * and, under a genuine race, via `invoices_one_deposit_per_job` catching the
 * unique_violation and re-selecting the winner — same pattern as
 * generateEstimateFromSiteVisit / createJobFromAcceptedQuote.
 */
export async function createDepositInvoice(
  client: DbClient,
  args: { orgId: string; jobId: string; actorUserId: string }
): Promise<Result<{ invoiceId: string; alreadyExisted: boolean }>> {
  const { data: requirement, error: requirementError } = await client
    .from('job_deposits')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId)
    .maybeSingle();

  if (requirementError) return err(ErrorCode.DB_ERROR, requirementError.message);
  if (!requirement || requirement.requirement_status !== 'required') {
    return err(ErrorCode.VALIDATION_ERROR, 'This job has no active deposit requirement to invoice.');
  }

  if (requirement.deposit_invoice_id) {
    const { data: existing } = await client
      .from('invoices')
      .select('id, status')
      .eq('id', requirement.deposit_invoice_id)
      .maybeSingle();
    if (existing && existing.status !== 'void') {
      return ok({ invoiceId: existing.id, alreadyExisted: true });
    }
  }

  let amount = requirement.required_amount;
  if (amount === null && requirement.required_percentage !== null) {
    const { data: job, error: jobError } = await client
      .from('jobs')
      .select('quoted_total')
      .eq('id', args.jobId)
      .eq('org_id', args.orgId)
      .maybeSingle();
    if (jobError) return err(ErrorCode.DB_ERROR, jobError.message);
    if (!job?.quoted_total) {
      return err(
        ErrorCode.VALIDATION_ERROR,
        'This job has a percentage-based deposit but no quoted total to calculate it from.'
      );
    }
    amount = Math.round(job.quoted_total * (requirement.required_percentage / 100) * 100) / 100;
  }
  if (amount === null) {
    return err(ErrorCode.VALIDATION_ERROR, 'Deposit requirement has no amount or percentage set.');
  }

  const { data: invoice, error: insertError } = await client
    .from('invoices')
    .insert({ org_id: args.orgId, job_id: args.jobId, kind: 'deposit', status: 'draft', title: 'Deposit invoice' })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === DEPOSIT_INVOICE_UNIQUE_VIOLATION) {
      const { data: raceWinner } = await client
        .from('invoices')
        .select('id')
        .eq('job_id', args.jobId)
        .eq('kind', 'deposit')
        .neq('status', 'void')
        .maybeSingle();
      if (raceWinner) return ok({ invoiceId: raceWinner.id, alreadyExisted: true });
    }
    return err(ErrorCode.DB_ERROR, insertError.message);
  }

  const lineItemResult = await addInvoiceLineItem(client, {
    orgId: args.orgId,
    input: {
      invoiceId: invoice.id,
      name: 'Deposit',
      description: 'Deposit required before scheduling/work begins.',
      unit: 'ea',
      quantity: 1,
      unitPrice: amount,
    },
  });
  if (!lineItemResult.success) return lineItemResult;

  const { error: linkError } = await client
    .from('job_deposits')
    .update({ deposit_invoice_id: invoice.id })
    .eq('org_id', args.orgId)
    .eq('job_id', args.jobId);
  if (linkError) return err(ErrorCode.DB_ERROR, linkError.message);

  await client.from('activity_log').insert({
    org_id: args.orgId,
    entity_type: 'job',
    entity_id: args.jobId,
    event_type: 'deposit_invoice_created',
    message: 'Deposit invoice created.',
    actor_user_id: args.actorUserId,
  });

  return ok({ invoiceId: invoice.id, alreadyExisted: false });
}
