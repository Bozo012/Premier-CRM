import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerSupabase } from '@/lib/supabase-server';
import { CustomerPropertyWorkForm } from '@/components/forms/customer-property-work-form';

import { createStandaloneJobAction } from '../actions';

export default async function NewJobPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/jobs/new');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.org_id) {
    redirect('/jobs');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <Link
        href="/jobs"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Jobs
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">New job</h1>
        <p className="text-sm text-muted-foreground">
          Select a customer and property, then describe the work. Creates a job
          directly — no prior quote required.
        </p>
      </header>

      <CustomerPropertyWorkForm
        redirectBasePath="/jobs"
        submitAction={createStandaloneJobAction}
        submitIdleLabel="Create job"
        submitPendingLabel="Creating…"
        successMessage="Job created."
      />
    </main>
  );
}
