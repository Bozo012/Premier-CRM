import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data/action code, reused unchanged ──────
import {
  getActiveOrgContext,
  getTodayActionItems,
  getTodayQuoteActivity,
  getTodaySiteVisits,
  getTodayInvoicesNeedingActionCount,
  type TodayActionItem,
} from '@premier/db';
import { hasCapability, type OrgRole } from '@premier/shared';
import { getServerSupabase } from '@/lib/supabase-server';
import { OrgContextError } from '@/components/org-context-error';
import { ErrorState } from '@/components/ui/error-state';
import { signOutAction } from './actions';

// ── LAYER 2: adapter / view-model (Forge V1.1 Today redesign, see ./_lib/view-model.ts) ──
import { buildSnapshotItems, buildTodaySchedule, sortActionItems } from './_lib/view-model';

// ── LAYER 3: presentation-only components ───────────────────────────────
import { Button } from '@/components/ui/button';
import { ActionQueue } from './_components/action-queue';
import { QuickActions, type QuickActionItem } from './_components/quick-actions';
import { SnapshotGrid } from './_components/snapshot-grid';
import { TodaySchedule } from './_components/today-schedule';
import { AdminLinks } from './_components/admin-links';
import { BrowseForge } from './_components/browse-forge';
import { TodayViewToggle } from './_components/today-view-toggle';

export const metadata: Metadata = { title: 'Today' };

interface TodayJob {
  id: string;
  scheduled_start: string | null;
  title: string;
}

/**
 * Dashboard — server component. Forge V1.1 Today redesign
 * (docs/ux/forge-v1.1-today-redesign.md): rebuilt on the Batch UX-A shared
 * foundation, using the proven 3-layer pattern from the Base44
 * compatibility spike, with its Layer 2 workflow-relevance defect
 * corrected — getTodayQuoteActivity() (packages/db) now owns the
 * "is this quote activity still actionable" decision that used to live in
 * this page's view-model.
 *
 * Org-context resolution unchanged from the original PR C0 fix: requires
 * an active membership for both id and name in the same query, so this
 * page either shows real values or an honest "no active organization"
 * state — never a placeholder next to a role that looks legitimate.
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

  const { orgId, role } = orgContextResult.data;
  const canManageTeam = role === 'owner' || role === 'admin';

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const recentActivitySince = new Date();
  recentActivitySince.setDate(recentActivitySince.getDate() - 14);

  const [requestsResult, todayJobsResult, actionItemsResult, quoteActivityResult, siteVisitsResult, invoicesNeedingActionResult] =
    await Promise.all([
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'new'),
      supabase
        .from('jobs')
        .select('id, title, scheduled_start')
        .eq('org_id', orgId)
        .gte('scheduled_start', startOfDay.toISOString())
        .lt('scheduled_start', endOfDay.toISOString())
        .order('scheduled_start', { ascending: true })
        .limit(10),
      getTodayActionItems(supabase, { orgId, role: role as OrgRole }),
      getTodayQuoteActivity(supabase, { orgId, since: recentActivitySince }),
      getTodaySiteVisits(supabase, { orgId, startOfDay, endOfDay }),
      getTodayInvoicesNeedingActionCount(supabase, orgId),
    ]);

  // Expected-failure state (Layer 3's ErrorState), never the raw driver
  // message — mirrors the pre-existing OrgContextError sanitization
  // pattern above, generalized via the shared foundation.
  if (todayJobsResult.error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-4 p-6">
        <ErrorState message="Couldn't load today's schedule. Try refreshing the page." />
      </main>
    );
  }

  const actionItems: TodayActionItem[] = actionItemsResult.success ? actionItemsResult.data : [];
  const quoteActivity = quoteActivityResult.success ? quoteActivityResult.data : [];
  const siteVisits = siteVisitsResult.success ? siteVisitsResult.data : [];
  const invoicesNeedingActionCount = invoicesNeedingActionResult.success ? invoicesNeedingActionResult.data : 0;
  const todayJobs = (todayJobsResult.data as TodayJob[] | null) ?? [];

  // ── adapter calls (Layer 2) ───────────────────────────────────────────
  const sortedActionItems = sortActionItems(actionItems);
  const schedule = buildTodaySchedule(todayJobs, siteVisits);
  const snapshotItems = buildSnapshotItems({
    newRequestCount: requestsResult.count ?? 0,
    todayScheduleCount: schedule.length,
    invoicesNeedingActionCount,
  });
  // Capability filtering happens here (Layer 1) — the only layer allowed
  // to call hasCapability(). Layer 3 never decides which actions render.
  const quickActions: QuickActionItem[] = [
    { id: 'create-request', label: 'Create request', href: '/requests' },
    { id: 'create-customer', label: 'Create customer', href: '/customers/new' },
    ...(hasCapability(role, 'canCreateEstimates') ? [{ id: 'create-estimate', label: 'Create estimate', href: '/estimates/new' }] : []),
    ...(hasCapability(role, 'canCreateDirectWorkOrder') ? [{ id: 'schedule-work', label: 'Schedule work', href: '/jobs/new' }] : []),
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <QuickActions actions={quickActions} />
        <TodayViewToggle />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
        <div className="space-y-8">
          <ActionQueue actionItems={sortedActionItems} quoteActivity={quoteActivity} />
          <TodaySchedule entries={schedule} />
          <SnapshotGrid items={snapshotItems} />
          <AdminLinks canManageTeam={canManageTeam} />
        </div>
        <BrowseForge />
      </div>
    </main>
  );
}
