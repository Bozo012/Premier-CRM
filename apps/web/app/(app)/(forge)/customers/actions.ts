'use server';

import { revalidatePath } from 'next/cache';

import {
  CheckCustomerEmailInputSchema,
  CreateCustomerInputSchema,
  CreatePropertyInputSchema,
  ErrorCode,
  err,
  hasCapability,
  ok,
  type OrgRole,
  type Result,
} from '@premier/shared';
import {
  createCustomer,
  createPropertyForCustomer,
  createServiceClient,
  findCustomerByEmail,
  getActiveOrgContext,
  type CustomerEmailMatch,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

interface CustomerActionContext {
  orgId: string;
  userId: string;
  role: OrgRole;
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

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  return ok({ orgId: orgContextResult.data.orgId, userId: user.id, role: orgContextResult.data.role as OrgRole });
}

// CP-4 (docs/security/customers-properties-authorization-audit.md §10/§15;
// product decision recorded 2026-08-13): customers/properties are the CRM's
// authoritative master identity/contact/location records, so create is
// gated by canManageCustomers (owner/admin/employee) rather than plain
// active membership. Direct authenticated REST writes to these tables were
// already fully revoked at the RLS layer (20260804000000_harden_customers_
// and_properties.sql) — this app-layer check is the only enforcement
// boundary that ever existed for the service-role action path, and closes
// it for the first time.
export type CreateCustomerActionState = Result<{ id: string }>;

export async function createCustomerAction(
  _previousState: CreateCustomerActionState | null,
  formData: FormData
): Promise<CreateCustomerActionState> {
  const access = await getCustomerActionContext();
  if (!access.success) return access;

  if (!hasCapability(access.data.role, 'canManageCustomers')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit creating customers.');
  }

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

  if (!hasCapability(access.data.role, 'canManageCustomers')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit adding properties.');
  }

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
