'use server';

import { revalidatePath } from 'next/cache';

import {
  CreateCustomerInputSchema,
  ErrorCode,
  err,
  ok,
  type Result,
} from '@premier/shared';
import { createCustomer, createServiceClient } from '@premier/db';

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
