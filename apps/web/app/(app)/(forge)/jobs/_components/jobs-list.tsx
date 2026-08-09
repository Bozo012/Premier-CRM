// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/jobs/JobsList.tsx. Markup/layout unchanged;
// `forge-*` tokens -> this app's existing shadcn tokens (bg-primary,
// text-muted-foreground, etc.), matching every other ported presentation
// component in this program (RecordDetailView, DetailSections). Props-driven
// only — no Supabase/action/fixture/auth/permissions imports.
import { Briefcase, ChevronRight, Plus, Search, SearchX } from 'lucide-react';

import type { JobsListFilter, JobRowModel } from '../_lib/forge-jobs-view-model';

const ORIGIN_LABELS: Record<NonNullable<JobRowModel['origin']>, string> = {
  manual: 'Manual',
  'from-quote': 'From quote',
  'from-request': 'From request',
};

export interface JobsListCallbacks {
  onOpenJob: (id: string) => void;
  onSearch: (query: string) => void;
  onFilter: (filterId: string) => void;
  onNewJob: () => void;
}

export function JobsList({
  jobs,
  filters,
  activeFilter,
  searchQuery,
  callbacks,
}: {
  jobs: JobRowModel[];
  filters: JobsListFilter[];
  activeFilter: string;
  searchQuery: string;
  callbacks: JobsListCallbacks;
}) {
  const hasJobs = jobs.length > 0;
  const showNoResults = !hasJobs && (searchQuery || activeFilter !== 'all');

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track ongoing maintenance tasks, assignments, and completion stages.</p>
        </div>
        <button
          type="button"
          onClick={callbacks.onNewJob}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> New job
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          defaultValue={searchQuery}
          onChange={(e) => callbacks.onSearch(e.target.value)}
          placeholder="Search by job number, customer, or title…"
          aria-label="Search jobs"
          className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter jobs">
        {filters.map((filter) => {
          const active = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => callbacks.onFilter(filter.id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground'}`}
            >
              {filter.label}
              <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{filter.count}</span>
            </button>
          );
        })}
      </div>

      {showNoResults ? (
        <div className="grid min-h-[40vh] place-items-center px-4 text-center">
          <div>
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold text-foreground">No jobs found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        </div>
      ) : !hasJobs ? (
        <div className="grid min-h-[40vh] place-items-center px-4 text-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">No jobs yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Jobs are created when a quote is accepted, or manually.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-muted-foreground">
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Job</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Customer</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Lead technician</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Progress</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Stage</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Scheduled</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => (
                  <tr key={job.id} className="cursor-pointer transition hover:bg-muted/30" onClick={() => callbacks.onOpenJob(job.id)}>
                    <td className="max-w-0 break-words px-5 py-4">
                      <div className="flex items-center gap-2 font-bold text-card-foreground">
                        <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{job.number}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{job.title}</div>
                    </td>
                    <td className="max-w-0 break-words px-5 py-4">
                      <div className="font-medium text-card-foreground">{job.customerName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{job.propertyName}</div>
                    </td>
                    <td className="px-5 py-4 text-xs text-card-foreground">{job.assignedTechnician || 'Unassigned'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${job.progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${job.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <JobStagePill stage={job.stage} label={job.stageLabel} />
                        {job.origin ? <OriginPill origin={job.origin} /> : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{job.dueDate}</td>
                    <td className="px-5 py-4 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 lg:hidden">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => callbacks.onOpenJob(job.id)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-card-foreground">{job.number}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{job.title}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <JobStagePill stage={job.stage} label={job.stageLabel} />
                    {job.origin ? <OriginPill origin={job.origin} /> : null}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {job.customerName} · {job.assignedTechnician || 'Unassigned'}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${job.progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">{job.progress}%</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Scheduled {job.dueDate}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function JobStagePill({ stage, label }: { stage: JobRowModel['stage']; label: string }) {
  const styles: Record<JobRowModel['stage'], string> = {
    scheduled: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    in_progress: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    on_hold: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${styles[stage]}`}>{label}</span>;
}

function OriginPill({ origin }: { origin: NonNullable<JobRowModel['origin']> }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
      {ORIGIN_LABELS[origin]}
    </span>
  );
}
