import { redirect } from 'next/navigation';

import { buildMarketingPortalUrl } from '@/lib/customer-portal-handoff';
import { getServerSupabase } from '@/lib/supabase-server';

export default async function PortalPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/portal/dashboard');
  }

  redirect(buildMarketingPortalUrl());
}
