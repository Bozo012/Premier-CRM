'use server';

import { revalidatePath } from 'next/cache';

import {
  CheckCustomerEmailInputSchema,
  CreateCustomerInputSchema,
  CreatePropertyInputSchema,
  ErrorCode,
  err,
  ok,
  type Result,
} from '@premier/shared';
import {
  createCustomer,
  createPropertyForCustomer,
  createServiceClient,
  findCustomerByEmail,
  type CustomerEmailMatch,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

interface CustomerActionContext {
  orgId: string;
  userId: string;
}

async function getCustomerActionContext(): Promise<Result<CustomerActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to create a customer.');
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
    return err(ErrorCode.FORBIDDEN, 'No organization membership was found for this user.');
  }

  return ok({ orgId: membership.org_id, userId: user.id });
}

export type CreateCustomerActionState = Result<{ id: string }>;

export async function createCustomerAction(
  _previousState: CreateCustomerActionState | null,
  formData: FormData
): Promise<CreateCustomerActionState> {
  const access = await getCustomerActionContext();
  if (!access.success) return access;

  const parsed = CreateCustomerInputSchema.safeParse({
    type: formData.get('type') || undefined,
    firstName: formData.get('firstName') || undefined,
    lastName: formData.get('lastName') || undefined,
    companyName: formData.get('companyName') || undefined,
    email: formData.get('email') || undefined,
    phonePrimary: formData.get('phonePrimary') || undefined,
    phoneSecondary: formData.get('phoneSecondary') || undefined,
    preferredChannel: formData.get('preferredChannel') || undefined,
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(ErrorCode.VALIDATION_ERROR, firstIssue?.message ?? 'Invalid customer details.');
  }

  const serviceClient = createServiceClient();
  const result = await createCustomer(serviceClient, {
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath('/customers');

  return ok({ id: result.data.id });
}

// ---------------------------------------------------------------------------
// Dedupe check (soft — advisory only, never blocks creation)
// ---------------------------------------------------------------------------

export type CheckCustomerEmailActionState = Result<CustomerEmailMatch | null>;

export async function checkCustomerEmailAction(
  email: string
): Promise<CheckCustomerEmailActionState> {
  const access = await getCustomerActionContext();
  if (!access.success) return access;

  const parsed = CheckCustomerEmailInputSchema.safeParse({ email });
  if (!parsed.success) {
    // A malformed email can't match anything — treat as "no match" rather
    // than surfacing a validation error from what is just a dedupe check.
    return ok(null);
  }

  const serviceClient = createServiceClient();
  return findCustomerByEmail(serviceClient, {
    email: parsed.data.email,
    orgId: access.data.orgId,
  });
}

// ---------------------------------------------------------------------------
// Property creation (customer detail page, /customers/[customerId])
// ---------------------------------------------------------------------------

export type CreatePropertyActionState = Result<{ id: string }>;

export async function createPropertyForCustomerAction(
  _previousState: CreatePropertyActionState | null,
  formData: FormData
): Promise<CreatePropertyActionState> {
  const access = await getCustomerActionContext();
  if (!access.success) return access;

  const parsed = CreatePropertyInputSchema.safeParse({
    customerId: formData.get('customerId'),
    addressLine1: formData.get('addressLine1'),
    addressLine2: formData.get('addressLine2') || undefined,
    city: formData.get('city'),
    state: formData.get('state'),
    zip: formData.get('zip'),
    country: formData.get('country') || undefined,
    propertyType: formData.get('propertyType') || undefined,
    accessNotes: formData.get('accessNotes') || undefined,
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(ErrorCode.VALIDATION_ERROR, firstIssue?.message ?? 'Invalid property details.');
  }

  const serviceClient = createServiceClient();
  const result = await createPropertyForCustomer(serviceClient, {
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath('/properties');

  return ok({ id: result.data.id });
}
