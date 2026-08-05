import Link from 'next/link';
import { CalendarX2, MapPin, UserCheck } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

import type { ScheduleEntry } from '../_lib/view-model';

// Presentation-only (Layer 3). `entries` is a pre-merged, pre-sorted list
// of today's jobs and today's site visits (Layer 2's buildTodaySchedule) —
// this component performs no data access or ordering decisions itself.
export function TodaySchedule({ entries }: { entries: ScheduleEntry[] }) {
  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out.
  // Empty state (entries.length === 0) must be preserved.
  return (
    <section aria-labelledby="work-heading">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Schedule</p>
        <h2 id="work-heading" className="mt-1 text-xl font-bold tracking-tight text-foreground">Today&apos;s Work</h2>
      </div>
      {entries.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <ol className="divide-y">
            {entries.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`}>
                <Link
                  href={entry.href}
                  className="grid gap-3 p-4 transition hover:bg-muted/30 sm:grid-cols-[84px_1fr_auto] sm:items-center"
                >
                  <div>
                    <time className="text-lg font-bold tabular-nums text-card-foreground">{entry.timeLabel}</time>
                    <p className="text-xs font-semibold text-muted-foreground">{entry.kind === 'site_visit' ? 'Site visit' : 'Job'}</p>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-card-foreground">{entry.title}</h3>
                    {entry.subtitle ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{entry.subtitle}</span>
                      </p>
                    ) : (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Crew assignment in job detail
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-self-end">
                    <StatusPill tone={entry.kind === 'site_visit' ? 'blue' : 'neutral'}>
                      {entry.kind === 'site_visit' ? 'Scheduled' : 'Crew assigned'}
                    </StatusPill>
                    <span className="flex min-h-9 items-center rounded-lg border bg-secondary px-3 text-xs font-bold text-secondary-foreground">
                      {entry.kind === 'site_visit' ? 'Open visit' : 'Open job'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <CalendarX2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <EmptyState title="No jobs or site visits scheduled for today" />
        </div>
      )}
    </section>
  );
}
