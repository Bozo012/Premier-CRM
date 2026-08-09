import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { getActiveOrgContext, listJobLeadsForJobs, listJobs } from '@premier/db';
import type { JobStatus } from '@premier/shared';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { buildJobsListModel, isValidJobsFilterId, statusesForFilter } from './_lib/forge-jobs-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { JobsShell } from './_components/jobs-shell';
import { JobsListContainer } from './_components/jobs-list-container';

export const metadata: Metadata = { title: 'Jobs' };

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;

  // Legacy bridge-model route — redirect to the real estimates workspace.
  if (readStringParam(params.view) === 'estimates') {
    redirect('/estimates');
  }

  const search = readStringParam(params.q);
  const activeFilter = readFilterParam(params.filter);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/jobs');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const { orgId } = orgContextResult.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const statuses = statusesForFilter(activeFilter);
  const [result, allStatusesResult] = await Promise.all([
    listJobs(supabase, {
      limit: 100,
      offset: 0,
      orgId,
      search,
      statuses: statuses.length > 0 ? (statuses as JobStatus[]) : undefined,
    }),
    supabase.from('jobs').select('status').eq('org_id', orgId),
  ]);

  if (!result.success) {
    return (
      <JobsShell shellData={shellData} mobileNav={mobileNav}>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Failed to load jobs: {result.error}
          </p>
        </main>
      </JobsShell>
    );
  }

  const { jobs, total } = result.data;
  const jobIds = jobs.map((item) => item.job.id);

  // Real per-job lead technician for the list's "Lead technician" column
  // (design/job-crew-assignment-model, PR #131) — one batched query, not
  // N+1: job_assignments where is_lead is true, for exactly the jobs on
  // this page.
  const leadNameByJobId = new Map<string, string>();
  const leadsResult = await listJobLeadsForJobs(supabase, { orgId, jobIds });
  if (leadsResult.success) {
    for (const row of leadsResult.data) {
      leadNameByJobId.set(row.jobId, row.displayName);
    }
  }

  const allStatuses = ((allStatusesResult.data ?? []) as Array<{ status: string }>).map((row) => row.status);
  const model = buildJobsListModel(jobs, leadNameByJobId, total, allStatuses);

  return (
    <JobsShell shellData={shellData} mobileNav={mobileNav}>
      <JobsListContainer jobs={model.jobs} filters={model.filters} activeFilter={activeFilter} searchQuery={search ?? ''} />
    </JobsShell>
  );
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readFilterParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && isValidJobsFilterId(raw) ? raw : 'all';
}
