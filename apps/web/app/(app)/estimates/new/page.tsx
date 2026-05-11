import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerSupabase } from '@/lib/supabase-server';

import { NewEstimateForm } from '../_components/new-estimate-form';

export default async function NewEstimatePage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/estimates/new');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.org_id) {
    redirect('/estimates');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <Link
        href="/estimates"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Estimates
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          New estimate
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a customer and property, then describe the work.
        </p>
      </header>

      <NewEstimateForm />
    </main>
  );
}
