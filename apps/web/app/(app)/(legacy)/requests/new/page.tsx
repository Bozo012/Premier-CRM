import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

import { NewRequestForm } from '../_components/new-request-form';

export default async function NewRequestPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/requests/new');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/requests');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pt-8">
      <Link
        href="/requests"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Requests
      </Link>

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create request</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a real service request for triage, customer follow-up, and handoff.
            </p>
          </div>
          <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 sm:inline-flex">
            Manual entry
          </span>
        </div>
      </header>

      <NewRequestForm />
    </main>
  );
}
