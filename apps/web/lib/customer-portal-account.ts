import { createServiceClient, findCustomerByEmail } from '@premier/db';

const PREMIER_ORG_ID =
  process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

export interface EnsureCustomerAccountSuccess {
  success: true;
  customerId: string;
}

export interface EnsureCustomerAccountFailure {
  success: false;
  code: 'CUSTOMER_LOOKUP_FAILED' | 'CUSTOMER_CREATE_FAILED' | 'ACCOUNT_LINK_FAILED';
}

export type EnsureCustomerAccountResult =
  | EnsureCustomerAccountSuccess
  | EnsureCustomerAccountFailure;

export function splitCustomerName(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] ?? null,
  };
}

export async function ensureCustomerAccount(args: {
  authUserId: string;
  email: string;
  fullName: string;
}): Promise<EnsureCustomerAccountResult> {
  const serviceClient = createServiceClient();
  const email = args.email.toLowerCase();

  const existingResult = await findCustomerByEmail(serviceClient, {
    email,
    orgId: PREMIER_ORG_ID,
  });

  if (!existingResult.success) {
    console.error('Customer portal lookup failed', existingResult);
    return { success: false, code: 'CUSTOMER_LOOKUP_FAILED' };
  }

  let customerId = existingResult.data?.id ?? null;

  if (!customerId) {
    const { firstName, lastName } = splitCustomerName(args.fullName);
    const { data: createdCustomer, error: createError } = await serviceClient
      .from('customers')
      .insert({
        org_id: PREMIER_ORG_ID,
        type: 'residential',
        first_name: firstName,
        last_name: lastName,
        email,
        preferred_channel: 'portal',
        source: 'customer_portal',
        tags: ['customer_portal'],
      })
      .select('id')
      .single();

    if (createError || !createdCustomer) {
      console.error('Customer portal customer creation failed', createError);
      return { success: false, code: 'CUSTOMER_CREATE_FAILED' };
    }

    customerId = createdCustomer.id;
  }

  const { error: accountError } = await serviceClient.from('customer_accounts').upsert(
    {
      org_id: PREMIER_ORG_ID,
      customer_id: customerId,
      auth_user_id: args.authUserId,
      email,
      status: 'active',
      invited_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'auth_user_id' }
  );

  if (accountError) {
    console.error('Customer portal account link failed', accountError);
    return { success: false, code: 'ACCOUNT_LINK_FAILED' };
  }

  return { success: true, customerId };
}
