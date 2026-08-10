import type { SupabaseClient } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase-server';

export interface ActivePortalAccount {
  customerId: string;
  email: string;
  orgId: string;
  status: string;
  userId: string;
}

interface CustomerAccountRow {
  customer_id: string;
  email: string;
  org_id: string;
  status: string;
}

function asCustomerAccountRow(value: unknown): CustomerAccountRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.customer_id === 'string' &&
    typeof row.email === 'string' &&
    typeof row.org_id === 'string' &&
    typeof row.status === 'string'
  ) {
    return {
      customer_id: row.customer_id,
      email: row.email,
      org_id: row.org_id,
      status: row.status,
    };
  }
  return null;
}

/**
 * Resolves the signed-in portal customer, or null when the visitor has no
 * session or no active customer_accounts link yet ("Portal account not
 * linked yet" state). Every portal page under /portal/(authenticated)
 * calls this once and either renders that unlinked state or proceeds with
 * a real, RLS-scoped account. This is the same authentication outcome the
 * dashboard has always resolved — extracted here so every new view uses
 * the identical check instead of re-deriving it.
 */
export async function resolveActivePortalAccount(): Promise<{
  account: ActivePortalAccount | null;
  portalClient: SupabaseClient;
}> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const portalClient = supabase as unknown as SupabaseClient;

  if (!user) return { account: null, portalClient };

  const { data: accountData } = await portalClient
    .from('customer_accounts')
    .select('customer_id, email, org_id, status')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();

  const row = asCustomerAccountRow(accountData);
  if (!row || row.status !== 'active') return { account: null, portalClient };

  return {
    account: {
      customerId: row.customer_id,
      email: row.email,
      orgId: row.org_id,
      status: row.status,
      userId: user.id,
    },
    portalClient,
  };
}
