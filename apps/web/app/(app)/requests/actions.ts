'use server';

import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import { createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

interface RequestActionContext {
  orgId: string;
  userId: string;
}

async function getRequestActionContext(): Promise<Result<RequestActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }

  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

// ---------------------------------------------------------------------------
// Convert request to lead-status job
// ---------------------------------------------------------------------------

export type ConvertRequestToJobActionState = Result<{ jobId: string }>;

export async function convertRequestToJobAction(
  _prevState: ConvertRequestToJobActionState | null,
  formData: FormData
): Promise<ConvertRequestToJobActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId, userId } = contextResult.data;

  const taskId = readString(formData, 'taskId');
  if (!taskId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const client = createServiceClient();

  // Fetch the task — must belong to org and not already be converted.
  const { data: task, error: taskError } = await client
    .from('tasks')
    .select('id, title, description, customer_id, property_id, job_id')
    .eq('id', taskId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (taskError) {
    return err(ErrorCode.DB_ERROR, taskError.message);
  }

  if (!task) {
    return err(ErrorCode.NOT_FOUND, 'Request not found.');
  }

  if (task.job_id) {
    return err(ErrorCode.VALIDATION_ERROR, 'This request has already been converted to a job.');
  }

  if (!task.customer_id) {
    return err(ErrorCode.VALIDATION_ERROR, 'No customer linked to this request.');
  }

  // Resolve property_id: prefer the task's own property_id, otherwise look up
  // the customer's first property via customer_properties.
  let propertyId = task.property_id as string | null;

  if (!propertyId) {
    const { data: link, error: linkError } = await client
      .from('customer_properties')
      .select('property_id')
      .eq('customer_id', task.customer_id)
      .limit(1)
      .maybeSingle();

    if (linkError) {
      return err(ErrorCode.DB_ERROR, linkError.message);
    }

    propertyId = link?.property_id ?? null;
  }

  if (!propertyId) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'No property on file for this customer. Add a property from the customer record, then convert.'
    );
  }

  // Derive the job title from the task title (strip "Quote request from " prefix).
  const jobTitle = deriveJobTitle(task.title, task.description);

  // Create the lead-status job.
  const { data: newJob, error: insertError } = await client
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: task.customer_id,
      property_id: propertyId,
      title: jobTitle,
      status: 'lead',
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !newJob) {
    return err(ErrorCode.DB_ERROR, insertError?.message ?? 'Failed to create job.');
  }

  // Link the task back to the job and mark it done.
  const { error: updateError } = await client
    .from('tasks')
    .update({ job_id: newJob.id, status: 'done' })
    .eq('id', taskId)
    .eq('org_id', orgId);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  revalidatePath(`/requests/${taskId}`);
  revalidatePath('/requests');
  revalidatePath('/jobs');

  return ok({ jobId: newJob.id });
}

// ---------------------------------------------------------------------------
// Mark request as reviewed (done)
// ---------------------------------------------------------------------------

export type MarkRequestReviewedActionState = Result<{ taskId: string }>;

export async function markRequestReviewedAction(
  _prevState: MarkRequestReviewedActionState | null,
  formData: FormData
): Promise<MarkRequestReviewedActionState> {
  const contextResult = await getRequestActionContext();
  if (!contextResult.success) return contextResult;
  const { orgId } = contextResult.data;

  const taskId = readString(formData, 'taskId');
  if (!taskId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Missing request ID.');
  }

  const client = createServiceClient();

  const { error } = await client
    .from('tasks')
    .update({ status: 'done' })
    .eq('id', taskId)
    .eq('org_id', orgId);

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  revalidatePath(`/requests/${taskId}`);
  revalidatePath('/requests');

  return ok({ taskId });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a job title from the intake task title.
 * The task title follows the pattern "Quote request from {name}" or
 * "Quote request from {name} — {service}". Strip the prefix and fall back
 * to extracting the service line from the structured description block.
 */
function deriveJobTitle(taskTitle: string, description: string | null): string {
  const PREFIX = 'Quote request from ';
  if (taskTitle.startsWith(PREFIX)) {
    const rest = taskTitle.slice(PREFIX.length).trim();
    // If the title already includes " — {service}", use it directly.
    const dashIdx = rest.indexOf(' — ');
    if (dashIdx !== -1) {
      return rest.slice(dashIdx + 3).trim() || rest;
    }
    // Otherwise extract from the description's "Service: {value}" line.
    const service = extractServiceLine(description);
    return service ?? rest;
  }
  return taskTitle;
}

function extractServiceLine(description: string | null): string | null {
  if (!description) return null;
  for (const line of description.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Service:')) {
      const value = trimmed.slice('Service:'.length).trim();
      return value || null;
    }
  }
  return null;
}
