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

export type JobDeposit = Database['public']['Tables']['job_deposits']['Row'];

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
