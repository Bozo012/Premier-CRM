import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getActiveOrgContext } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { signOutAction } from './actions';

interface TodayJob {
  id: string;
  scheduled_start: string | null;
  title: string;
}

interface QuickAction {
  href: string;
  id: string;
  label: string;
}

const quickActions: QuickAction[] = [
  { id: 'new-customer', label: 'New customer', href: '/customers/new' },
  { id: 'new-estimate', label: 'New estimate', href: '/estimates/new' },
  { id: 'new-invoice', label: 'New invoice', href: '/invoices' },
  { id: 'review-quotes', label: 'Review quotes', href: '/quotes' },
] as const;

function normalizePropertyAddressKey(property: {
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  return [property.address_line_1, property.city, property.state, property.zip]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    )
    .join('|');
}

function formatScheduledTime(value: string | null): string {
  if (!value) return 'Anytime';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value)
  );
}

/**
 * Dashboard — server component (PR C0). Previously a client component that
 * resolved the user's org via its own browser-side `.limit(1).maybeSingle()`
 * query with no `status = 'active'` filter (see this file's prior git
 * history), which is exactly what produced the "Unknown org • Employee" bug:
 * a user whose only org_members row is `pending` still has a readable
 * org_id/role (that row's own RLS policy — "Users can read their own
 * membership" — has no status check), but the embedded
 * `organizations(name)` join silently returns null because `organizations`'
 * RLS policy calls `user_is_in_org()`, which DOES require `status = 'active'`
 * (see supabase/migrations — `user_is_in_org()`). The mismatch between those
 * two checks is what let a broken org name render next to a real-looking
 * role. Resolving through `getActiveOrgContext()` server-side (PR C0's
 * shared helper) closes that gap for good: it requires an active membership
 * for BOTH the id and the name in the same query, so this page either shows
 * the real values or an honest "no active organization" state — never a
 * placeholder string next to a role that looks legitimate.
 */
export default async function TodayPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/today');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </main>
    );
  }

  const { orgId, orgName, role } = orgContextResult.data;
  const canManageTeam = role === 'owner' || role === 'admin';

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [
    customersResult,
    propertiesResult,
    jobsResult,
    profileResult,
    requestsResult,
    todayJobsResult,
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('properties').select('address_line_1, city, state, zip').eq('org_id', orgId),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'new'),
    supabase
      .from('jobs')
      .select('id, title, scheduled_start')
      .eq('org_id', orgId)
      .gte('scheduled_start', startOfDay.toISOString())
      .lt('scheduled_start', endOfDay.toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(10),
  ]);

  if (customersResult.error || propertiesResult.error || jobsResult.error) {
    const message =
      customersResult.error?.message ||
      propertiesResult.error?.message ||
      jobsResult.error?.message ||
      'Failed to load dashboard counts.';
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-red-600">{message}</p>
      </main>
    );
  }

  const newRequestCount = requestsResult.count ?? 0;
  const uniquePropertyCount = new Set(
    (propertiesResult.data || []).map((property) => normalizePropertyAddressKey(property))
  ).size;

  const fullName = profileResult.data?.full_name ?? null;
  const firstNameFromProfile = fullName ? fullName.split(' ')[0] : null;
  const firstNameFromEmail = user.email ? user.email.split('@')[0] : null;
  const firstName = firstNameFromProfile ?? firstNameFromEmail ?? 'there';
  const userEmail = user.email || 'No email found';
  const customerCount = customersResult.count || 0;
  const jobCount = jobsResult.count || 0;
  const todayJobs = (todayJobsResult.data as TodayJob[] | null) ?? [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">{formattedDate}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2 text-right">
            <p className="text-xs font-medium text-foreground">{firstName}</p>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <div className="inline-flex max-w-full items-center rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <span className="truncate">
            {orgName} • <span className="capitalize">{role}</span>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">Signed in as {userEmail}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              asChild
              variant="outline"
              className="h-16 justify-start px-4 text-left text-sm sm:text-base"
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Business snapshot
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SnapshotCard
            helper="Review imported records"
            href="/customers"
            label="Customers"
            value={String(customerCount)}
          />
          <SnapshotCard
            helper="Browse addresses and owners"
            href="/properties"
            label="Properties"
            value={String(uniquePropertyCount)}
          />
          <SnapshotCard
            helper="Jobs imported or created"
            href="/jobs"
            label="Jobs"
            value={String(jobCount)}
          />
          <SnapshotCard
            helper="Unreviewed website inquiries"
            href="/requests"
            label="New requests"
            value={String(newRequestCount)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Browse imported data
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                See the imported customer list, contact info, notes, quotes, and jobs.
              </p>
              <Button asChild variant="outline">
                <Link href="/customers">Open customers</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Inspect imported addresses, linked owners, access notes, and property memory.
              </p>
              <Button asChild variant="outline">
                <Link href="/properties">Open properties</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review imported or created jobs with status, priority, and scheduling context.
              </p>
              <Button asChild variant="outline">
                <Link href="/jobs">Open jobs</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service catalog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review seeded services, pricing confidence, and current rate ranges.
              </p>
              <Button asChild variant="outline">
                <Link href="/services">Open service catalog</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {canManageTeam ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Team access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review manually-created team accounts with app access.
              </p>
              <Button asChild variant="outline">
                <Link href="/team">View team access</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {canManageTeam ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Website content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Manage the CRM-backed marketing content that powers the public website.
              </p>
              <Button asChild variant="outline">
                <Link href="/settings/website">Open website content</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayJobs.length > 0 ? (
              <ul className="divide-y">
                {todayJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="font-medium text-foreground">{job.title}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatScheduledTime(job.scheduled_start)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No jobs scheduled for today yet.
              </p>
            )}
            <Button asChild variant="outline">
              <Link href="/jobs">Review jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Next Best Step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Import your Jobber data to start building your business memory.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild type="button" variant="outline">
                <Link href="/customers">Import customers</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function SnapshotCard({
  helper,
  href,
  label,
  value,
}: {
  helper: string;
  href?: string;
  label: string;
  value: string;
}) {
  const content = (
    <>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </>
  );

  if (!href) {
    return <Card>{content}</Card>;
  }

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        {content}
      </Link>
    </Card>
  );
}
