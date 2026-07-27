'use server';

import { revalidatePath } from 'next/cache';

import {
  CreateInvoiceFromJobInputSchema,
  CreateQuoteFromJobInputSchema,
  ErrorCode,
  err,
  ok,
  type Result,
} from '@premier/shared';
import { createDraftInvoiceFromJob, createDraftQuote, createServiceClient, getActiveOrgContext } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type CreateDraftQuoteActionState = Result<{ quoteId: string }>;
export type CreateInvoiceFromJobPageActionState = Result<{ invoiceId: string }>;

async function getJobActionContext(): Promise<
  Result<{ orgId: string; userId: string }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(
      ErrorCode.FORBIDDEN,
      'You must be signed in to create a draft quote.'
    );
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  return ok({
    orgId: orgContextResult.data.orgId,
    userId: user.id,
  });
}

export async function createDraftQuoteAction(
  _previousState: CreateDraftQuoteActionState | null,
  formData: FormData
): Promise<CreateDraftQuoteActionState> {
  const access = await getJobActionContext();

  if (!access.success) {
    return access;
  }

  const parsed = CreateQuoteFromJobInputSchema.safeParse({
    jobId: formData.get('jobId'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid quote creation payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await createDraftQuote(serviceClient, {
    createdBy: access.data.userId,
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  return ok({ quoteId: result.data.id });
}

// ---------------------------------------------------------------------------
// Standalone job creation (customer + property, no prior quote) — per the
// post-MVP amendment, a second door alongside "quote accepted → create job."
// Jobs have no constraint requiring a quote/estimate origin, so this simply
// inserts directly; status defaults to 'lead' (there is no acceptance
// milestone to start from, unlike the quote-accepted path which starts jobs
// at 'approved').
// ---------------------------------------------------------------------------

export type CreateStandaloneJobActionState = Result<{ id: string }>;

export async function createStandaloneJobAction(
  _previousState: CreateStandaloneJobActionState | null,
  formData: FormData
): Promise<CreateStandaloneJobActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId } = access.data;

  const customerId =
    typeof formData.get('customerId') === 'string'
      ? (formData.get('customerId') as string).trim()
      : '';
  const propertyId =
    typeof formData.get('propertyId') === 'string'
      ? (formData.get('propertyId') as string).trim()
      : '';
  const title =
    typeof formData.get('title') === 'string'
      ? (formData.get('title') as string).trim()
      : '';
  const description =
    typeof formData.get('description') === 'string'
      ? (formData.get('description') as string).trim()
      : '';

  if (!customerId) return err(ErrorCode.VALIDATION_ERROR, 'A customer is required.');
  if (!propertyId) return err(ErrorCode.VALIDATION_ERROR, 'A property is required.');
  if (!title) return err(ErrorCode.VALIDATION_ERROR, 'A title is required.');

  const serviceClient = createServiceClient();

  const { data: customer, error: customerError } = await serviceClient
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (customerError) return err(ErrorCode.DB_ERROR, customerError.message);
  if (!customer) return err(ErrorCode.NOT_FOUND, 'Customer not found.');

  const { data: link, error: linkError } = await serviceClient
    .from('customer_properties')
    .select('property_id')
    .eq('customer_id', customerId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (linkError) return err(ErrorCode.DB_ERROR, linkError.message);
  if (!link) {
    return err(ErrorCode.VALIDATION_ERROR, 'The selected property is not linked to this customer.');
  }

  const { data: newJob, error: insertError } = await serviceClient
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      title,
      description: description || null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !newJob) {
    return err(ErrorCode.DB_ERROR, insertError?.message ?? 'Failed to create job.');
  }

  revalidatePath('/jobs');

  return ok({ id: newJob.id });
}

export async function createInvoiceFromJobPageAction(
  _previousState: CreateInvoiceFromJobPageActionState | null,
  formData: FormData
): Promise<CreateInvoiceFromJobPageActionState> {
  const access = await getJobActionContext();

  if (!access.success) {
    return access;
  }

  const parsed = CreateInvoiceFromJobInputSchema.safeParse({
    jobId: formData.get('jobId'),
    kind: formData.get('kind') ?? 'standalone',
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid invoice creation payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await createDraftInvoiceFromJob(serviceClient, {
    createdBy: access.data.userId,
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  return ok({ invoiceId: result.data.id });
}
