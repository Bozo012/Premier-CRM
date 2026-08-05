import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext } from '@premier/db';

import { Button } from '@/components/ui/button';
import { getServerSupabase } from '@/lib/supabase-server';
import { CustomerPropertyWorkForm } from '@/components/forms/customer-property-work-form';

import { createStandaloneJobAction } from '../actions';

const JOB_SOURCE_OPTIONS = [
  {
    available: false,
    carriedForward: ['Customer', 'Property', 'Approved scope', 'Quoted line items', 'Pricing', 'Quote reference'],
    description: 'Convert an accepted quote into operational work.',
    title: 'From accepted quote',
  },
  {
    available: false,
    carriedForward: ['Customer', 'Property', 'Inspection findings', 'Site photos', 'Access notes'],
    description: 'Turn inspection findings into scheduled work.',
    title: 'From site visit',
  },
  {
    available: false,
    carriedForward: ['Customer', 'Property', 'Reported concern', 'Priority', 'Request reference'],
    description: 'Promote an intake request straight to a job.',
    title: 'From customer request',
  },
  {
    available: false,
    carriedForward: ['Customer', 'Property', 'Service schedule', 'Standard scope', 'Assigned crew'],
    description: 'Create the next occurrence of a maintenance agreement.',
    title: 'Recurring service',
  },
  {
    available: true,
    carriedForward: ['Customer', 'Property', 'Scope you enter'],
    description: 'Log work with no prior upstream record. Nothing is fabricated.',
    title: 'Manual job',
  },
];

export default async function NewJobPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/jobs/new');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    redirect('/jobs');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pt-8">
      <Link
        href="/jobs"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Cancel
      </Link>

      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create job</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up operational work for a customer property.
            </p>
          </div>
          <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 sm:inline-flex">
            Manual entry
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-3" aria-label="Create job progress">
          <span className="h-1 rounded-full bg-primary" />
          <span className="h-1 rounded-full bg-muted" />
          <span className="h-1 rounded-full bg-muted" />
          <span className="h-1 rounded-full bg-muted" />
        </div>
        <p className="text-sm font-semibold text-foreground">Step 1 of 4: Source</p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-foreground">How should this job begin?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Forge supplies the permitted job sources and the information each one carries forward.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {JOB_SOURCE_OPTIONS.map((option) => (
            <SourceOptionCard key={option.title} {...option} />
          ))}
        </div>
      </section>

      <section id="manual-job-form" className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">Manual job details</h2>
          <p className="text-sm text-muted-foreground">
            Select a customer and property, then describe the work. This creates a real Premier job directly.
          </p>
        </div>

        <CustomerPropertyWorkForm
          redirectBasePath="/jobs"
          submitAction={createStandaloneJobAction}
          submitIdleLabel="Create job"
          submitPendingLabel="Creating…"
          successMessage="Job created."
        />
      </section>

      <footer className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="rounded-xl font-bold">
          <Link href="/jobs">Cancel</Link>
        </Button>
        <Button asChild className="rounded-xl font-bold">
          <a href="#manual-job-form">Continue →</a>
        </Button>
      </footer>
    </main>
  );
}

function SourceOptionCard({
  available,
  carriedForward,
  description,
  title,
}: {
  available: boolean;
  carriedForward: string[];
  description: string;
  title: string;
}) {
  return (
    <article
      aria-disabled={!available}
      className={[
        'rounded-xl border bg-card p-4 text-card-foreground shadow-sm',
        available ? 'border-primary/70 ring-1 ring-primary/40' : 'opacity-80',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {available ? <span className="text-primary">✓</span> : null}
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Carried forward
        </p>
        <ul className="space-y-0.5 text-sm font-semibold text-foreground">
          {carriedForward.map((item) => (
            <li key={item}>
              <span className="text-primary">•</span> {item}
            </li>
          ))}
        </ul>
      </div>
      {!available ? (
        <p className="text-sm text-muted-foreground">
          Requires a dedicated real handoff action before this source can create jobs.
        </p>
      ) : null}
    </article>
  );
}
