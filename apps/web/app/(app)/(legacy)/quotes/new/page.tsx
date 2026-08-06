import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';
import { CustomerPropertyWorkForm } from '@/components/forms/customer-property-work-form';

import { createStandaloneQuoteAction } from '../actions';

export default async function NewQuotePage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/quotes/new');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/quotes');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <Link
        href="/quotes"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Quotes
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">New quote</h1>
        <p className="text-sm text-muted-foreground">
          Select a customer and property, then describe the work. Creates a quote
          you can send directly — no prior request or estimate required.
        </p>
      </header>

      <CustomerPropertyWorkForm
        redirectBasePath="/quotes"
        submitAction={createStandaloneQuoteAction}
        submitIdleLabel="Create quote"
        submitPendingLabel="Creating…"
        successMessage="Quote created."
      />
    </main>
  );
}
