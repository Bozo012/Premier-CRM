import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data/action code, reused unchanged ──────
import { getActiveOrgContext, getTodayActionItems, type TodayActionItem } from '@premier/db';
import type { OrgRole } from '@premier/shared';
import { getServerSupabase } from '@/lib/supabase-server';
import { OrgContextError } from '@/components/org-context-error';
import { signOutAction } from './actions';

// ── LAYER 2: adapter / view-model (spike-introduced, see ./_lib/view-model.ts) ──
import {
  buildQuoteActivityRows,
  buildScheduleJobs,
  buildSnapshotItems,
  countUniqueProperties,
  deriveFirstName,
  deriveGreeting,
  sortActionItems,
} from './_lib/view-model';

// ── LAYER 3: presentation-only components (spike-introduced) ───────────────
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TodayHeader } from './_components/today-header';
import { ActionQueue } from './_components/action-queue';
import { QuickActions, type QuickActionItem } from './_components/quick-actions';
import { SnapshotGrid } from './_components/snapshot-grid';
import { BrowseDataGrid } from './_components/browse-data-grid';
import { TodaySchedule } from './_components/today-schedule';

export const metadata: Metadata = { title: 'Today' };

interface TodayJob {
  id: string;
  scheduled_start: string | null;
  title: string;
}

// Static route list — no data dependency, unchanged from pre-spike.
const quickActions: QuickActionItem[] = [
  { id: 'new-customer', label: 'New customer', href: '/customers/new' },
  { id: 'new-estimate', label: 'New estimate', href: '/estimates/new' },
  { id: 'new-invoice', label: 'New invoice', href: '/invoices' },
  { id: 'review-quotes', label: 'Review quotes', href: '/quotes' },
] as const;

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
 *
 * Base44 compatibility spike (docs/ux/base44-compatibility-spike-plan.md,
 * docs/ux/base44-compatibility-spike-report.md): all data-fetching below is
 * byte-identical to the pre-spike version — the Promise.all block, its query
 * shapes, getActiveOrgContext()/getTodayActionItems() calls are unchanged.
 * Derived-value computation was extracted into ./_lib/view-model.ts (Layer
 * 2), and rendering was extracted into ./_components/ (Layer 3). This file
 * is now purely: auth check -> org context -> fetch -> adapt -> render.
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

  // Error state: unchanged from pre-spike — OrgContextError already renders
  // a sanitized, code-classified message (amber for the expected "no active
  // org yet" case, red for real DB/conflict errors), never a raw stack
  // trace or driver error string. Not modified by this spike.
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

  const { orgId, orgName, role, hasMultipleOrgs, availableOrgs } = orgContextResult.data;
  const canManageTeam = role === 'owner' || role === 'admin';

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const recentActivitySince = new Date();
  recentActivitySince.setDate(recentActivitySince.getDate() - 14);

  const [
    customersResult,
    propertiesResult,
    jobsResult,
    profileResult,
    requestsResult,
    todayJobsResult,
    quoteActivityResult,
    actionItemsResult,
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
    supabase
      .from('activity_log')
      .select('id, entity_id, event_type, message, created_at')
      .eq('org_id', orgId)
      .in('event_type', ['quote_accepted', 'quote_declined'])
      .gte('created_at', recentActivitySince.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    getTodayActionItems(supabase, { orgId, role: role as OrgRole }),
  ]);

  // Error state: unchanged from pre-spike.
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

  const quoteActivity = quoteActivityResult.data ?? [];
  const quoteIds = [...new Set(quoteActivity.map((entry) => entry.entity_id))];
  const { data: activityQuotes } = quoteIds.length
    ? await supabase.from('quotes').select('id, title, quote_number, job_id').in('id', quoteIds)
    : { data: [] as { id: string; title: string | null; quote_number: string | null; job_id: string | null }[] };
  const quoteById = new Map((activityQuotes ?? []).map((q) => [q.id, q]));

  const todayJobs = (todayJobsResult.data as TodayJob[] | null) ?? [];
  const actionItems: TodayActionItem[] = actionItemsResult.success ? actionItemsResult.data : [];
  const fullName = profileResult.data?.full_name ?? null;

  // ── adapter calls (Layer 2) — every value below is derived, not fetched ──
  const sortedActionItems = sortActionItems(actionItems);
  const pendingQuoteActivity = buildQuoteActivityRows(quoteActivity, quoteById);
  const scheduleJobs = buildScheduleJobs(todayJobs);
  const snapshotItems = buildSnapshotItems({
    customerCount: customersResult.count || 0,
    uniquePropertyCount: countUniqueProperties(propertiesResult.data || []),
    jobCount: jobsResult.count || 0,
    newRequestCount: requestsResult.count ?? 0,
  });
  const firstName = deriveFirstName(fullName, user.email ?? null);
  const greeting = deriveGreeting(new Date());
  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const userEmail = user.email || 'No email found';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <TodayHeader
        firstName={firstName}
        formattedDate={formattedDate}
        greeting={greeting}
        userEmail={userEmail}
        orgId={orgId}
        orgName={orgName}
        role={role}
        hasMultipleOrgs={hasMultipleOrgs}
        availableOrgs={availableOrgs}
      />

      <ActionQueue actionItems={sortedActionItems} quoteActivity={pendingQuoteActivity} />

      <QuickActions actions={quickActions} />

      <SnapshotGrid items={snapshotItems} />

      <BrowseDataGrid canManageTeam={canManageTeam} />

      <TodaySchedule jobs={scheduleJobs} />

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
