/**
 * Shared server-side lifecycle services used by BOTH the staff CRM and the
 * customer portal/share-token surfaces, so the two never implement
 * divergent business rules for the same transition. Each function does its
 * own DB-boundary validation (via RLS-protected tables or the
 * SECURITY DEFINER RPCs in the change-orders/scheduling migrations) — it
 * does not assume the caller already checked everything.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Job = Database['public']['Tables']['jobs']['Row'];

const JOB_ORIGIN_QUOTE_UNIQUE_VIOLATION = '23505';

/**
 * Accepted quote -> unscheduled job (jobs.status = 'approved' — the
 * existing "no job/quoted" naming gap: there is no distinct "unscheduled"
 * enum value; 'approved' has meant "job exists, not yet scheduled" since
 * the original schema. Not changed here per the approved design — adding a
 * competing value would fragment the existing status filtering/reporting
 * built on 'approved').
 *
 * Idempotent at the database boundary: `jobs_origin_quote_unique` (a
 * partial unique index on origin_quote_id) is the actual guarantee. A
 * concurrent duplicate call loses the race on INSERT and this function
 * catches that specific conflict and returns the job the other call
 * created, rather than surfacing an error — callers (the manual staff
 * action AND the customer accept path) get identical behavior either way.
 */
export async function createJobFromAcceptedQuote(
  client: DbClient,
  args: { orgId: string; quoteId: string; createdByUserId?: string | null }
): Promise<Result<{ job: Job; alreadyExisted: boolean }>> {
  const { orgId, quoteId, createdByUserId } = args;

  const { data: existingJob } = await client
    .from('jobs')
    .select('*')
    .eq('origin_quote_id', quoteId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (existingJob) {
    return ok({ job: existingJob, alreadyExisted: true });
  }

  const { data: quote, error: quoteError } = await client
    .from('quotes')
    .select('id, status, estimate_id, job_id, total, title')
    .eq('id', quoteId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (quoteError) return err(ErrorCode.DB_ERROR, quoteError.message);
  if (!quote) return err(ErrorCode.NOT_FOUND, 'Quote not found.');
  if (quote.status !== 'accepted') {
    return err(ErrorCode.VALIDATION_ERROR, 'Quote must be accepted before creating a job.');
  }

  let customerId: string | null = null;
  let propertyId: string | null = null;
  let jobTitle = quote.title?.trim() || 'New job';
  let originEstimateId: string | null = null;
  let originRequestId: string | null = null;

  if (quote.estimate_id) {
    const { data: estimate, error: estimateError } = await client
      .from('estimates')
      .select('id, customer_id, property_id, title, converted_job_id, service_request_id')
      .eq('id', quote.estimate_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (estimateError) return err(ErrorCode.DB_ERROR, estimateError.message);
    if (!estimate) return err(ErrorCode.NOT_FOUND, 'Linked estimate not found.');
    if (estimate.converted_job_id) {
      // Estimate already converted (possibly via the older manual path) —
      // treat as the same idempotent case.
      const { data: job } = await client
        .from('jobs')
        .select('*')
        .eq('id', estimate.converted_job_id)
        .maybeSingle();
      if (job) return ok({ job, alreadyExisted: true });
    }

    customerId = estimate.customer_id;
    propertyId = estimate.property_id;
    jobTitle = estimate.title?.trim() || jobTitle;
    originEstimateId = estimate.id;
    originRequestId = estimate.service_request_id;
  } else if (quote.job_id) {
    // Standalone quote already tied to a job directly (no estimate origin).
    const { data: job } = await client.from('jobs').select('*').eq('id', quote.job_id).maybeSingle();
    if (job) return ok({ job, alreadyExisted: true });
  }

  if (!customerId || !propertyId) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'This quote has no linked estimate/customer/property to create a job from.'
    );
  }

  const { data: newJob, error: insertError } = await client
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      title: jobTitle,
      status: 'approved',
      quoted_total: quote.total ?? null,
      created_by: createdByUserId ?? null,
      origin_quote_id: quote.id,
      origin_estimate_id: originEstimateId,
      origin_request_id: originRequestId,
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === JOB_ORIGIN_QUOTE_UNIQUE_VIOLATION) {
      // Lost the race to a concurrent accept callback — fetch and return
      // the job it created instead of erroring.
      const { data: raceWinner } = await client
        .from('jobs')
        .select('*')
        .eq('origin_quote_id', quote.id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (raceWinner) return ok({ job: raceWinner, alreadyExisted: true });
    }
    return err(ErrorCode.DB_ERROR, insertError.message);
  }

  await client
    .from('quotes')
    .update({ job_id: newJob.id })
    .eq('id', quoteId)
    .eq('org_id', orgId);

  if (originEstimateId) {
    await client
      .from('estimates')
      .update({ converted_job_id: newJob.id, converted_at: new Date().toISOString(), status: 'converted' })
      .eq('id', originEstimateId)
      .eq('org_id', orgId);
  }

  await client.from('activity_log').insert({
    org_id: orgId,
    entity_type: 'job',
    entity_id: newJob.id,
    event_type: 'job_created_from_accepted_quote',
    message: `Job created from accepted quote ${quote.id}.`,
    actor_user_id: createdByUserId ?? null,
  });

  return ok({ job: newJob, alreadyExisted: false });
}
