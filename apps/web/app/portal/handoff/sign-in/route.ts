import { NextResponse, type NextRequest } from 'next/server';

import { ensureCustomerAccount } from '@/lib/customer-portal-account';
import {
  buildMarketingPortalUrl,
  isAllowedPortalHandoffOrigin,
  readRequiredString,
} from '@/lib/customer-portal-handoff';
import { getServerSupabase } from '@/lib/supabase-server';

function redirectToMarketing(status: Parameters<typeof buildMarketingPortalUrl>[0]): NextResponse {
  return NextResponse.redirect(buildMarketingPortalUrl(status), { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAllowedPortalHandoffOrigin(request.headers.get('origin'))) {
    return redirectToMarketing('portal-unavailable');
  }

  const formData = await request.formData();
  const email = readRequiredString(formData, 'email')?.toLowerCase();
  const password = readRequiredString(formData, 'password');

  if (!email || !password) {
    return redirectToMarketing('missing-credentials');
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return redirectToMarketing('invalid-credentials');
  }

  const fullName =
    typeof data.user.user_metadata?.full_name === 'string'
      ? data.user.user_metadata.full_name
      : '';
  const accountResult = await ensureCustomerAccount({
    authUserId: data.user.id,
    email: data.user.email?.toLowerCase() ?? email,
    fullName,
  });

  if (!accountResult.success) {
    await supabase.auth.signOut();
    return redirectToMarketing('account-link-failed');
  }

  return NextResponse.redirect(new URL('/portal/dashboard', request.url), { status: 303 });
}
