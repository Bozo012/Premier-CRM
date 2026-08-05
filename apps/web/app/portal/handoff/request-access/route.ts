import { NextResponse, type NextRequest } from 'next/server';

import { ensureCustomerAccount } from '@/lib/customer-portal-account';
import {
  buildMarketingPortalUrl,
  isAllowedPortalHandoffOrigin,
  readRequiredString,
} from '@/lib/customer-portal-handoff';
import { getAppUrl } from '@/lib/email';
import { getServerSupabase } from '@/lib/supabase-server';

function redirectToMarketing(status: Parameters<typeof buildMarketingPortalUrl>[0]): NextResponse {
  return NextResponse.redirect(buildMarketingPortalUrl(status), { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAllowedPortalHandoffOrigin(request.headers.get('origin'))) {
    return redirectToMarketing('portal-unavailable');
  }

  const formData = await request.formData();
  const fullName = readRequiredString(formData, 'fullName');
  const email = readRequiredString(formData, 'email')?.toLowerCase();
  const password = readRequiredString(formData, 'password');

  if (!fullName || !email || !password) {
    return redirectToMarketing('missing-access-fields');
  }

  if (password.length < 8) {
    return redirectToMarketing('password-too-short');
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        account_type: 'customer',
      },
      emailRedirectTo: new URL('/portal/confirm', getAppUrl()).toString(),
    },
  });

  if (error || !data.user) {
    return redirectToMarketing('invalid-credentials');
  }

  const accountResult = await ensureCustomerAccount({
    authUserId: data.user.id,
    email,
    fullName,
  });

  if (!accountResult.success) {
    await supabase.auth.signOut();
    return redirectToMarketing('account-link-failed');
  }

  if (!data.session) {
    return redirectToMarketing('account-created-check-email');
  }

  return NextResponse.redirect(new URL('/portal/dashboard', request.url), { status: 303 });
}
