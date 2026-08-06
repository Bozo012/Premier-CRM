'use client'; // Search input, filter tabs, and card clicks are all interactive handlers.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/team/TeamList.tsx. Markup, spacing, and
// loading/error/empty/no-results states are unchanged; `forge-*` Tailwind
// classes swapped for the existing equivalent tokens (same convention as
// ../../customers/_components/customers-list.tsx). Props-driven, no data/
// auth/fixture imports — real wiring lives in team-list-container.tsx.
import { Search, SearchX, Plus, Mail, Phone } from 'lucide-react';

import type { TeamCallbacks, TeamListViewModel } from '../_lib/forge-team-contracts';

export function TeamList({ model, callbacks }: { model: TeamListViewModel; callbacks: TeamCallbacks }) {
  const hasMembers = model.members.length > 0;
  const showNoResults = !hasMembers && !model.isLoading && !model.error && (model.searchQuery || model.activeFilter !== 'all');

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage staff members, roles, and field availability.</p>
        </div>
        <button
          onClick={() => callbacks.onOpenAction('invite-member')}
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" /> Invite member
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          defaultValue={model.searchQuery}
          onChange={(e) => callbacks.onSearch(e.target.value)}
          placeholder="Search by name, role, or skill…"
          aria-label="Search team members"
          className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter team members">
        {model.filters.map((filter) => {
          const active = model.activeFilter === filter.id;
          return (
            <button
              key={filter.id}
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

      {model.isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" aria-label="Loading team members" />
        </div>
      ) : model.error ? (
        <div className="grid min-h-[40vh] place-items-center px-4 text-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">{model.error.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{model.error.message}</p>
          </div>
        </div>
      ) : showNoResults ? (
        <div className="grid min-h-[40vh] place-items-center px-4 text-center">
          <div>
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold text-foreground">No team members found</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        </div>
      ) : !hasMembers ? (
        <div className="grid min-h-[40vh] place-items-center px-4 text-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">No team members yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Invite staff to join your workspace.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {model.members.map((m) => (
            <button
              key={m.id}
              onClick={() => callbacks.onOpenMember(m.id)}
              aria-label={`Open team member ${m.name}, ${m.role}, ${m.availabilityLabel}`}
              className="rounded-xl border border-border bg-card p-5 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{m.initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-bold text-card-foreground">{m.name}</div>
                    <AvailabilityDot status={m.availability} label={m.availabilityLabel} />
                  </div>
                  <div className="mt-0.5 text-xs capitalize text-muted-foreground">{m.role}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" aria-hidden="true" />
                  {m.email}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {m.phone}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.skills.slice(0, 3).map((skill) => (
                  <span key={skill} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {skill}
                  </span>
                ))}
                {m.skills.length > 3 && <span className="text-[10px] text-muted-foreground">+{m.skills.length - 3}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  {m.assignedJobs} active {m.assignedJobs === 1 ? 'assignment' : 'assignments'}
                </span>
                <span className="text-xs text-muted-foreground">{m.lastActiveLabel}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function AvailabilityDot({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = {
    available: 'bg-emerald-500',
    on_job: 'bg-indigo-500',
    off_shift: 'bg-slate-400',
    on_leave: 'bg-amber-500',
  };
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${colors[status] || colors.off_shift}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
